/**
 * Gmail invoice scanner — server-side only.
 *
 * Walks the user's Gmail INBOX or SENT folder, finds emails that
 * look like they contain invoice attachments (PDF), runs each
 * candidate through Claude's invoice-extraction tool, and saves
 * the structured data + the original PDF (uploaded to Drive)
 * back to the user's invoice tabs.
 *
 * Why Gmail directly via googleapis instead of an MCP server:
 *   - We already use googleapis for Drive + Sheets, so adding
 *     Gmail there is one more service on the same auth path.
 *     No extra OAuth flow.
 *   - We need batch processing semantics (fetch list, fetch
 *     full bodies, parse, persist) which is awkward with MCP's
 *     turn-based call model.
 *   - The Gmail API quota is generous enough for this use case
 *     (~250 quota units per request, a typical month's scan
 *     uses well under the daily 1B limit).
 *
 * Flow per scan:
 *   1. Build query: 'has:attachment filename:pdf' + date range
 *   2. List matching message IDs
 *   3. For each: fetch full message → extract PDF attachment
 *      → call Claude to parse → upload PDF to Drive →
 *      append row to 30_invoices_out or 31_invoices_in
 *   4. Track largest internalDate for next run's 'after' filter
 *   5. Write a row to 60_email_imports for audit + state
 *
 * Idempotency / dedup:
 *   - Each run uses 'after:<seconds>' filter, so we never re-scan
 *     the same period. The previous run's max internalDate is
 *     the next run's lower bound.
 *   - Plus we check for an existing invoice with matching
 *     supplier + invoice_number before creating a new row, so
 *     even if a message slips through twice we don't duplicate.
 *
 * Cost (Claude Sonnet 4.6):
 *   - ~$0.003 per invoice parsed
 *   - 100 invoices/month ≈ $0.30
 *   - Well within reasonable budget for a small business
 */

import { google, type gmail_v1 } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import {
  EXTRACT_TOOL,
  SYSTEM_PROMPT,
  type ParsedInvoice,
} from "@/app/api/invoices-in/parse/route";

// ============================================================
// Types
// ============================================================

export type Mailbox = "INBOX" | "SENT";

export interface EmailScanInput {
  /** OAuth access token from the authenticated user's session */
  accessToken: string;
  /** Which folder to scan: INBOX (received) or SENT (issued) */
  mailbox: Mailbox;
  /**
   * Lower bound — only fetch messages with internalDate strictly
   * AFTER this. Pass undefined for the first scan, in which case
   * we default to "last 31 days".
   *
   * Stored as epoch milliseconds (Gmail's internalDate format).
   */
  sinceInternalDate: number | undefined;
  /**
   * Hard cap on messages processed per run. Prevents a runaway
   * scan from racking up Anthropic costs if a user has years of
   * unscanned mail. Default 50.
   */
  maxMessages?: number;
}

export interface ParsedAttachment {
  /** Original filename from the email */
  filename: string;
  /** PDF bytes ready to upload to Drive */
  data: Buffer;
  /** MIME type (always 'application/pdf' for now) */
  mimeType: string;
}

export interface CandidateInvoice {
  /** Gmail message ID */
  messageId: string;
  /** Gmail internalDate (epoch ms) — used to advance the cursor */
  internalDate: number;
  /** Sender from the From: header */
  fromHeader: string;
  /** Subject line */
  subject: string;
  /** First PDF attachment found in the message */
  attachment: ParsedAttachment;
  /** Date the email was received/sent (ISO date) */
  emailDate: string;
}

export interface ScannedInvoice {
  candidate: CandidateInvoice;
  parsed: ParsedInvoice;
}

export interface ScanResult {
  mailbox: Mailbox;
  messagesFound: number;
  messagesProcessed: number;
  invoicesParsed: ScannedInvoice[];
  errors: Array<{ messageId: string; reason: string }>;
  /** Largest internalDate we saw — feed this back as
   *  sinceInternalDate on the next scan */
  lastMessageInternalDate: number;
}

// ============================================================
// Public API
// ============================================================

/**
 * Run one scan of the user's mailbox. Does NOT persist anything
 * to Sheets or Drive — returns the parsed invoices so the caller
 * can decide what to do with them (typically: upload PDFs to
 * Drive then append rows).
 *
 * Splitting scan from persist makes the function testable and
 * lets the caller batch the Drive uploads + Sheet writes.
 */
export async function scanGmailForInvoices(
  input: EmailScanInput,
  apiKey: string,
  /** Optional progress callback — invoked after each message
   *  is processed. Useful for streaming status to the UI. */
  onProgress?: (info: {
    current: number;
    total: number;
    message: string;
  }) => void
): Promise<ScanResult> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: input.accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const anthropic = new Anthropic({ apiKey });

  const maxMessages = input.maxMessages ?? 50;

  // Build Gmail search query.
  //
  // 'has:attachment filename:pdf' filters to messages with a PDF
  // attached — invoices are essentially always sent this way.
  // Misses HTML-only invoices and inline images, but those are a
  // small fraction in real LV business mail and would need a
  // different (more expensive) AI path anyway.
  //
  // 'after:<seconds>' is Gmail's standard timestamp query. Note
  // that internalDate is milliseconds while the query expects
  // seconds — we divide.
  //
  // Mailbox restriction:
  //   INBOX: 'in:inbox'  — emails the user RECEIVED (incoming
  //                        invoices we owe)
  //   SENT:  'in:sent'   — emails the user SENT (outgoing
  //                        invoices we issued through other systems)
  const queryParts: string[] = [];
  queryParts.push(input.mailbox === "INBOX" ? "in:inbox" : "in:sent");
  queryParts.push("has:attachment");
  queryParts.push("filename:pdf");

  let afterSeconds: number;
  if (input.sinceInternalDate) {
    afterSeconds = Math.floor(input.sinceInternalDate / 1000);
  } else {
    // First-ever scan: last 31 days (covers a typical billing
    // month plus a few days of slack for late-arriving invoices)
    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    afterSeconds = Math.floor((Date.now() - thirtyOneDaysMs) / 1000);
  }
  queryParts.push(`after:${afterSeconds}`);

  const q = queryParts.join(" ");

  // List matching message IDs. Single page only — we cap at
  // maxMessages anyway, and pagination would make progress
  // tracking awkward for the UI.
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: maxMessages,
  });

  const messageRefs = listRes.data.messages ?? [];
  const result: ScanResult = {
    mailbox: input.mailbox,
    messagesFound: messageRefs.length,
    messagesProcessed: 0,
    invoicesParsed: [],
    errors: [],
    lastMessageInternalDate: input.sinceInternalDate ?? 0,
  };

  // Process each message
  for (let i = 0; i < messageRefs.length; i++) {
    const ref = messageRefs[i];
    if (!ref.id) continue;

    onProgress?.({
      current: i + 1,
      total: messageRefs.length,
      message: `Apstrādā ziņojumu ${i + 1} no ${messageRefs.length}`,
    });

    try {
      const candidate = await fetchAndExtractAttachment(gmail, ref.id);
      if (!candidate) {
        // No PDF attachment after all (shouldn't happen given the
        // filename:pdf filter, but defensive)
        continue;
      }

      // Track the latest message timestamp for next scan's cursor.
      // Even if AI parsing fails below, advancing the cursor
      // prevents us from re-trying the same broken email forever.
      if (candidate.internalDate > result.lastMessageInternalDate) {
        result.lastMessageInternalDate = candidate.internalDate;
      }

      const parsed = await parseInvoiceWithAI(
        anthropic,
        candidate.attachment.data,
        candidate.attachment.mimeType
      );

      // Skip non-invoices (Claude marks confidence near 0 when
      // the document isn't really an invoice — e.g. order
      // confirmation, marketing PDF, contract).
      const avgConfidence =
        (parsed.confidence.supplier_name +
          parsed.confidence.invoice_number +
          parsed.confidence.amount_total) /
        3;
      if (avgConfidence < 0.4) {
        result.errors.push({
          messageId: ref.id,
          reason: `Nav atpazīts kā rēķins (uzticība ${avgConfidence.toFixed(2)})`,
        });
        continue;
      }

      result.invoicesParsed.push({ candidate, parsed });
      result.messagesProcessed++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Nezināma kļūda";
      result.errors.push({ messageId: ref.id ?? "", reason });
      console.error(`Email scan: failed on message ${ref.id}:`, err);
    }
  }

  return result;
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Fetch a single message and pull out the first PDF attachment.
 * Returns null when no PDF is found (defensive — the search
 * query filters for filename:pdf, but multipart email mime trees
 * can be quirky).
 */
async function fetchAndExtractAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<CandidateInvoice | null> {
  const msgRes = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const msg = msgRes.data;
  if (!msg.payload) return null;

  const headers = msg.payload.headers ?? [];
  const fromHeader = findHeader(headers, "From") ?? "";
  const subject = findHeader(headers, "Subject") ?? "";
  const dateHeader = findHeader(headers, "Date") ?? "";
  const internalDate = parseInt(msg.internalDate ?? "0", 10);

  // Walk the multipart tree looking for application/pdf
  const pdfPart = findPdfPart(msg.payload);
  if (!pdfPart || !pdfPart.body?.attachmentId) return null;

  const attachmentRes = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: pdfPart.body.attachmentId,
  });

  const data = attachmentRes.data.data;
  if (!data) return null;

  // Gmail returns base64url; normalize to base64 then to Buffer
  const buffer = Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  return {
    messageId,
    internalDate,
    fromHeader,
    subject,
    attachment: {
      filename: pdfPart.filename ?? `invoice-${messageId}.pdf`,
      data: buffer,
      mimeType: "application/pdf",
    },
    emailDate: emailDateToISO(dateHeader, internalDate),
  };
}

function findPdfPart(
  part: gmail_v1.Schema$MessagePart
): gmail_v1.Schema$MessagePart | null {
  // PDF attachments either come as application/pdf with a
  // filename ending .pdf, or rarely as application/octet-stream
  // with .pdf filename. Both count.
  const filename = (part.filename ?? "").toLowerCase();
  const mime = (part.mimeType ?? "").toLowerCase();

  const isPdfMime = mime === "application/pdf";
  const isPdfFilename = filename.endsWith(".pdf");

  if ((isPdfMime || isPdfFilename) && part.body?.attachmentId) {
    return part;
  }

  for (const sub of part.parts ?? []) {
    const found = findPdfPart(sub);
    if (found) return found;
  }
  return null;
}

function findHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string | undefined {
  const target = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === target) return h.value ?? undefined;
  }
  return undefined;
}

function emailDateToISO(
  dateHeader: string,
  internalDateMs: number
): string {
  // Prefer the Date: header for display since it preserves the
  // sender's intended date. Fall back to internalDate if header
  // is missing or unparseable.
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date(internalDateMs).toISOString().slice(0, 10);
}

/**
 * Send a PDF to Claude and get back structured invoice fields.
 * Reuses the EXTRACT_TOOL + SYSTEM_PROMPT from
 * /api/invoices-in/parse — same schema, same model, same prompt,
 * so the email-scan path produces invoices identical in shape
 * to the manual-upload path.
 */
async function parseInvoiceWithAI(
  anthropic: Anthropic,
  pdfBuffer: Buffer,
  mimeType: string
): Promise<ParsedInvoice> {
  const base64 = pdfBuffer.toString("base64");

  const fileBlock: Anthropic.Messages.ContentBlockParam =
    mimeType === "application/pdf"
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
            data: base64,
          },
        };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL as Anthropic.Messages.Tool],
    tool_choice: { type: "tool", name: "save_invoice_data" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          {
            type: "text",
            text: "Please extract the invoice fields from this document and call save_invoice_data with the structured data.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === "save_invoice_data"
  );

  if (!toolUse) {
    throw new Error("AI neatgrieza strukturētus datus");
  }
  return toolUse.input as ParsedInvoice;
}
