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
} from "@/lib/invoice-extraction";

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
  /** Optional progress callback — invoked after each chunk is
   *  scheduled. Useful for streaming status to the UI. */
  onProgress?: (info: {
    current: number;
    total: number;
    message: string;
  }) => void,
  /**
   * Called after each invoice is successfully parsed by AI but
   * BEFORE moving to the next message. The route uses this to
   * upload the PDF + write the Sheet row immediately, so a
   * timeout halfway through the scan still preserves what's
   * been processed so far.
   *
   * Throwing from this callback is logged but doesn't halt the
   * scan — failed persistence becomes an error in result.errors.
   */
  onItemParsed?: (item: ScannedInvoice) => Promise<void>,
  /**
   * Called after each parallel chunk completes. The route uses
   * this to write a 60_email_imports row capturing the cursor
   * up to that point. Best-effort — checkpoint failures don't
   * halt the scan.
   */
  onCheckpoint?: (snapshot: ScanResult) => Promise<void>
): Promise<ScanResult> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: input.accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const anthropic = new Anthropic({ apiKey });

  // Cap default lowered to 12. Realistic budget per Vercel
  // function call: 60s Hobby, 300s Pro. With the new two-stage
  // pipeline:
  //   Stage 1 (Haiku triage):  ~1.5s per email × 12 = 18s
  //   Stage 2 (Opus extraction): ~15s × 3-4 invoices typical = 45s
  //   Total: ~60-65s, fits Pro budget; Hobby will partial-process
  // The user clicks the robot again to continue past the cap.
  const maxMessages = input.maxMessages ?? 12;

  // Build Gmail search query.
  //
  // We DELIBERATELY do NOT filter by 'has:attachment filename:pdf'
  // anymore. That was missing real invoices that arrive as:
  //   - HTML-only emails (subscription renewals, small services)
  //   - Inline images (scanned receipts)
  //   - Word/JPG/PNG attachments (some smaller suppliers)
  //   - Payment confirmations referencing an invoice without
  //     attaching it
  //
  // Instead we let Haiku triage every email and decide if it's
  // financially relevant. Costs ~$0.0001 per triage, well worth
  // not missing real invoices.
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
  //
  // We also filter out chat / draft / spam categories which
  // never contain real invoices but pad the result count.
  const queryParts: string[] = [];
  queryParts.push(input.mailbox === "INBOX" ? "in:inbox" : "in:sent");
  // Exclude obviously-non-invoice categories. Gmail uses these
  // labels automatically; -category:promotions catches most
  // marketing newsletters which would otherwise eat our budget.
  queryParts.push("-category:promotions");
  queryParts.push("-category:social");
  queryParts.push("-category:forums");

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
  console.log(
    `[email-scan] mailbox=${input.mailbox} query="${q}" maxMessages=${maxMessages}`
  );

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: maxMessages,
  });

  const messageRefs = listRes.data.messages ?? [];
  console.log(
    `[email-scan] mailbox=${input.mailbox} Gmail returned ${messageRefs.length} messages`
  );

  const result: ScanResult = {
    mailbox: input.mailbox,
    messagesFound: messageRefs.length,
    messagesProcessed: 0,
    invoicesParsed: [],
    errors: [],
    lastMessageInternalDate: input.sinceInternalDate ?? 0,
  };

  // Process messages in two stages:
  //
  // Stage 1 — Triage (cheap, fast):
  //   Fetch headers + plain text body, send to Haiku 4.5 to
  //   classify: is this an invoice? a payment receipt? a bill
  //   reminder? something else? Haiku returns { type, confidence }.
  //
  // Stage 2 — Extract (expensive, accurate):
  //   For emails Haiku flags as financially relevant, run the
  //   full extraction. If a PDF/image attachment is present, send
  //   that to Opus. If the email is HTML/text-only with the
  //   invoice details inline, send the body text to Opus.
  //
  // This way we look at EVERY email but only pay for full
  // extraction on the relevant ones (~10-20% of inbox typically).
  //
  // Concurrency — triage can run more aggressively than extract
  // because Haiku is faster and uses less of our rate limit
  // budget.
  const TRIAGE_CONCURRENCY = 4;
  const EXTRACT_CONCURRENCY = 2;

  // ───── STAGE 1: triage all messages ─────
  const triaged: Array<{
    messageId: string;
    triage: TriageResult;
    fetched: FetchedEmail;
  }> = [];

  for (let i = 0; i < messageRefs.length; i += TRIAGE_CONCURRENCY) {
    const chunk = messageRefs.slice(i, i + TRIAGE_CONCURRENCY);

    onProgress?.({
      current: i + 1,
      total: messageRefs.length,
      message: `Pārbaudu ziņojumus ${i + 1}-${Math.min(
        i + TRIAGE_CONCURRENCY,
        messageRefs.length
      )} no ${messageRefs.length}`,
    });

    const chunkResults = await Promise.allSettled(
      chunk.map(async (ref) => {
        if (!ref.id) return null;
        const fetched = await fetchEmailFull(gmail, ref.id);
        if (!fetched) return null;

        // Advance cursor regardless of outcome — prevents re-
        // scanning the same email forever
        if (fetched.internalDate > result.lastMessageInternalDate) {
          result.lastMessageInternalDate = fetched.internalDate;
        }

        const triage = await triageEmailWithAI(anthropic, fetched);
        return { messageId: ref.id, triage, fetched };
      })
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const res = chunkResults[j];
      const ref = chunk[j];
      if (res.status === "rejected") {
        result.errors.push({
          messageId: ref.id ?? "",
          reason:
            res.reason instanceof Error
              ? `Triage: ${res.reason.message}`
              : "Triage failed",
        });
        continue;
      }
      if (!res.value) continue;
      const { triage, fetched } = res.value;

      // Log every triage decision so we can see from Vercel logs
      // why emails are being included or excluded.
      console.log(
        `[email-triage] subject="${fetched.subject.slice(0, 60)}" type=${triage.type} conf=${triage.confidence.toFixed(2)} reason="${triage.reasoning?.slice(0, 80) ?? ""}"`
      );

      // Accept invoices, payment confirmations, AND reminders.
      // The original logic skipped reminders, but in practice
      // many "reminder" emails actually contain the full invoice
      // info inline (e.g. monthly subscription "your invoice is
      // ready" emails) and are worth ingesting. Better to
      // dedupe later than to miss data.
      //
      // Confidence threshold lowered to 0.4 — Haiku's confidence
      // is well-calibrated and 0.5 was rejecting borderline
      // cases unnecessarily.
      if (
        (triage.type === "invoice" ||
          triage.type === "payment_confirmation" ||
          triage.type === "reminder") &&
        triage.confidence >= 0.4
      ) {
        triaged.push(res.value);
      } else {
        console.log(
          `[email-triage] SKIPPED type=${triage.type} conf=${triage.confidence.toFixed(2)}`
        );
      }
    }
  }

  console.log(
    `[email-scan] mailbox=${input.mailbox} triaged ${triaged.length}/${messageRefs.length} emails as financially relevant`
  );

  // ───── STAGE 2: full extraction on triage-flagged emails ─────
  for (let i = 0; i < triaged.length; i += EXTRACT_CONCURRENCY) {
    const chunk = triaged.slice(i, i + EXTRACT_CONCURRENCY);

    onProgress?.({
      current: messageRefs.length + i + 1,
      total: messageRefs.length + triaged.length,
      message: `Ekstrahē rēķinus ${i + 1}-${Math.min(
        i + EXTRACT_CONCURRENCY,
        triaged.length
      )} no ${triaged.length}`,
    });

    const chunkResults = await Promise.allSettled(
      chunk.map(async ({ messageId, fetched, triage }) => {
        // Decide what to feed Opus:
        //   - PDF attachment present: use the PDF (best quality)
        //   - Image attachment: use the image
        //   - Neither: synthesize a 'document' from email body
        //     text — Opus extracts from text just fine, and we
        //     persist that body as the .txt file in Drive
        let attachment: ParsedAttachment;

        if (fetched.pdfAttachment) {
          attachment = fetched.pdfAttachment;
        } else if (fetched.imageAttachment) {
          attachment = fetched.imageAttachment;
        } else {
          // Build a synthetic .txt 'invoice document' from the
          // email body. Opus's tool-use schema doesn't actually
          // care about file extension — only mime type matters
          // for vision/PDF parsing — but storing as .txt makes
          // the Drive folder browsable for the user.
          const textContent = [
            `From: ${fetched.fromHeader}`,
            `Subject: ${fetched.subject}`,
            `Date: ${fetched.emailDate}`,
            "",
            fetched.bodyText,
          ].join("\n");
          attachment = {
            filename: `email-${messageId}.txt`,
            data: Buffer.from(textContent, "utf-8"),
            mimeType: "text/plain",
          };
        }

        const candidate: CandidateInvoice = {
          messageId,
          internalDate: fetched.internalDate,
          fromHeader: fetched.fromHeader,
          subject: fetched.subject,
          attachment,
          emailDate: fetched.emailDate,
        };

        // For text-only emails Opus needs the text inline, not
        // as a 'document'/'image' block. Branch on attachment
        // mime type.
        const parsed =
          attachment.mimeType === "text/plain"
            ? await parseInvoiceFromText(
                anthropic,
                attachment.data.toString("utf-8"),
                triage.type
              )
            : await parseInvoiceWithAI(
                anthropic,
                attachment.data,
                attachment.mimeType
              );

        return { messageId, candidate, parsed };
      })
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const res = chunkResults[j];
      const ref = chunk[j];

      if (res.status === "rejected") {
        const reason =
          res.reason instanceof Error
            ? res.reason.message
            : String(res.reason);
        result.errors.push({ messageId: ref.messageId, reason });
        console.error(
          `Email scan: extract failed on message ${ref.messageId}:`,
          res.reason
        );
        continue;
      }

      const { candidate, parsed } = res.value;

      // Defensive: confidence object might be missing from a
      // schema-violating tool response. Fall back to 0.
      const conf = parsed.confidence ?? {
        supplier_name: 0,
        invoice_number: 0,
        amount_total: 0,
      };
      const avgConfidence =
        ((conf.supplier_name ?? 0) +
          (conf.invoice_number ?? 0) +
          (conf.amount_total ?? 0)) /
        3;

      // Log what AI extracted so we can debug from Vercel logs
      console.log(
        `[email-scan] msg=${candidate.messageId} subject="${candidate.subject.slice(0, 60)}" supplier="${parsed.supplier_name ?? "?"}" amount=${parsed.amount_total ?? 0} conf=${avgConfidence.toFixed(2)}`
      );

      // Lowered threshold from 0.25 → 0.15. We already gate by
      // Haiku triage (which only flags actual invoices), so the
      // extraction-stage threshold can be looser. Many real
      // Latvian invoices have unusual layouts that score 0.2-0.3
      // on individual fields even when correctly extracted.
      if (avgConfidence < 0.15) {
        console.warn(
          `[email-scan] REJECTED msg=${candidate.messageId} confidence too low: ${avgConfidence.toFixed(2)}`
        );
        result.errors.push({
          messageId: candidate.messageId,
          reason: `Nav atpazīts kā rēķins (uzticība ${avgConfidence.toFixed(2)})`,
        });
        continue;
      }

      const item: ScannedInvoice = { candidate, parsed };
      result.invoicesParsed.push(item);
      result.messagesProcessed++;

      // Per-message persist callback. The route uses this to
      // upload PDF + write Sheet row IMMEDIATELY rather than
      // waiting for the whole scan to finish. If the function
      // times out partway through, everything processed so far
      // is already saved.
      if (onItemParsed) {
        try {
          await onItemParsed(item);
        } catch (err) {
          console.error(
            `onItemParsed callback failed for ${candidate.messageId}:`,
            err
          );
          result.errors.push({
            messageId: candidate.messageId,
            reason:
              err instanceof Error
                ? `Saglabāšana: ${err.message}`
                : "Saglabāšana neizdevās",
          });
        }
      }
    }

    // After each chunk, give the cursor-checkpoint callback a
    // chance to write progress. If the function dies before the
    // next chunk completes, this checkpoint is the cursor.
    if (onCheckpoint) {
      try {
        await onCheckpoint(result);
      } catch (err) {
        // Checkpoint failures aren't fatal — we just log
        console.warn("onCheckpoint failed:", err);
      }
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
/**
 * Fetched email — combines all the bits we might want to feed to
 * the AI pipeline: headers, body text, and the first PDF/image
 * attachment (if any).
 *
 * Body text is extracted from text/plain part if present, else
 * stripped from text/html. We DO NOT just feed raw HTML to Haiku
 * because email HTML often weighs 50KB+ of layout noise, and
 * Haiku does fine on the visible plaintext.
 */
interface FetchedEmail {
  messageId: string;
  internalDate: number;
  fromHeader: string;
  subject: string;
  emailDate: string;
  bodyText: string;
  pdfAttachment?: ParsedAttachment;
  imageAttachment?: ParsedAttachment;
}

/**
 * Fetch a Gmail message and return everything the pipeline needs:
 * headers, plain-text body, optional PDF/image attachments.
 *
 * This is the universal fetcher — replaces the old
 * fetchAndExtractAttachment which assumed a PDF was always present.
 * Now we fetch everything and let the AI decide what's relevant.
 */
async function fetchEmailFull(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<FetchedEmail | null> {
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

  const bodyText = extractBodyText(msg.payload);
  const pdfPart = findPdfPart(msg.payload);
  const imagePart = findImagePart(msg.payload);

  const fetched: FetchedEmail = {
    messageId,
    internalDate,
    fromHeader,
    subject,
    emailDate: emailDateToISO(dateHeader, internalDate),
    bodyText,
  };

  // Fetch attachment bytes if present. Cap at 10 MB — anything
  // bigger is probably a contract or media file, not an invoice.
  if (pdfPart?.body?.attachmentId) {
    const buffer = await fetchAttachmentBytes(
      gmail,
      messageId,
      pdfPart.body.attachmentId
    );
    if (buffer && buffer.length <= 10 * 1024 * 1024) {
      fetched.pdfAttachment = {
        filename: pdfPart.filename ?? `invoice-${messageId}.pdf`,
        data: buffer,
        mimeType: "application/pdf",
      };
    }
  } else if (imagePart?.body?.attachmentId) {
    const buffer = await fetchAttachmentBytes(
      gmail,
      messageId,
      imagePart.body.attachmentId
    );
    if (buffer && buffer.length <= 10 * 1024 * 1024) {
      fetched.imageAttachment = {
        filename: imagePart.filename ?? `image-${messageId}`,
        data: buffer,
        mimeType: imagePart.mimeType ?? "image/jpeg",
      };
    }
  }

  return fetched;
}

async function fetchAttachmentBytes(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  try {
    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = res.data.data;
    if (!data) return null;
    return Buffer.from(
      data.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    );
  } catch (err) {
    console.warn(`Failed to fetch attachment ${attachmentId}:`, err);
    return null;
  }
}

/**
 * Extract readable text from an email payload. Prefers text/plain
 * parts; falls back to stripping text/html. Caps at 8000 chars
 * (~2000 tokens) — Haiku doesn't need the whole email to triage,
 * just enough to recognize the subject + first paragraph.
 */
function extractBodyText(part: gmail_v1.Schema$MessagePart): string {
  // Walk the part tree, collecting text/plain content first
  const plainTexts: string[] = [];
  const htmlTexts: string[] = [];

  function walk(p: gmail_v1.Schema$MessagePart) {
    const mime = (p.mimeType ?? "").toLowerCase();
    if (mime === "text/plain" && p.body?.data) {
      plainTexts.push(decodeBase64Url(p.body.data));
    } else if (mime === "text/html" && p.body?.data) {
      htmlTexts.push(decodeBase64Url(p.body.data));
    }
    for (const sub of p.parts ?? []) walk(sub);
  }
  walk(part);

  let text = plainTexts.join("\n\n").trim();
  if (!text && htmlTexts.length > 0) {
    text = stripHtml(htmlTexts.join("\n\n"));
  }
  // Cap to keep Haiku context window reasonable
  if (text.length > 8000) {
    text = text.slice(0, 8000) + "\n[...truncated]";
  }
  return text;
}

function decodeBase64Url(b64url: string): string {
  try {
    return Buffer.from(
      b64url.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Strip HTML tags + collapse whitespace to get readable plaintext.
 * Doesn't try to be perfect — just good enough that Haiku sees
 * meaningful content. Real HTML-to-text libraries (html-to-text,
 * jsdom) are heavy and we don't need their fidelity here.
 */
function stripHtml(html: string): string {
  return (
    html
      // Drop script/style entirely (not just the tags but content)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      // Convert <br> and </p> to newlines for readability
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      // Strip remaining tags
      .replace(/<[^>]+>/g, " ")
      // HTML entities — limited set, covers most real cases
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&euro;/g, "€")
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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

/**
 * Find the first image attachment (PNG, JPEG, WebP). Used as a
 * fallback when no PDF is present — covers scanned paper invoices
 * that get sent as photos.
 */
function findImagePart(
  part: gmail_v1.Schema$MessagePart
): gmail_v1.Schema$MessagePart | null {
  const filename = (part.filename ?? "").toLowerCase();
  const mime = (part.mimeType ?? "").toLowerCase();

  // Skip inline embedded images that aren't real attachments
  // (signature logos, layout images). Heuristic: real attachments
  // have a non-empty filename.
  if (filename && (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(filename))) {
    if (part.body?.attachmentId) return part;
  }

  for (const sub of part.parts ?? []) {
    const found = findImagePart(sub);
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
/**
 * Triage result from Haiku — what kind of email is this?
 *
 * Types:
 *   invoice              — supplier sent us a bill we need to pay
 *                          (or, if SENT mailbox, we sent a bill to
 *                          a client). Has amount + supplier/client +
 *                          ideally an invoice number.
 *   payment_confirmation — bank confirmation, payment receipt
 *                          ("Your payment of X EUR was received").
 *                          We persist these to track expenses even
 *                          without a proper invoice document.
 *   reminder             — "Your invoice X is due in 3 days" — a
 *                          notification, not a new invoice. We
 *                          skip these since the original invoice
 *                          should already be in the system.
 *   other                — newsletter, personal mail, calendar
 *                          notification, anything else. Skip.
 */
interface TriageResult {
  type: "invoice" | "payment_confirmation" | "reminder" | "other";
  confidence: number;
  reasoning: string;
}

const TRIAGE_TOOL = {
  name: "classify_email",
  description:
    "Classify an email by its financial relevance. Call this exactly once per email.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["invoice", "payment_confirmation", "reminder", "other"],
        description:
          "What kind of email this is. 'invoice' = a bill (with amount + supplier). 'payment_confirmation' = bank/payment receipt. 'reminder' = notification about an existing invoice (skip). 'other' = anything not financial.",
      },
      confidence: {
        type: "number",
        description:
          "How sure you are (0.0 to 1.0). Below 0.5 means 'probably not'.",
      },
      reasoning: {
        type: "string",
        description: "One sentence explaining the classification.",
      },
    },
    required: ["type", "confidence", "reasoning"],
  },
};

const TRIAGE_SYSTEM_PROMPT = `You triage business emails to find invoices and payment-related messages for a Latvian small-business accounting tool.

You'll receive: sender, subject, and body text (in Latvian, English, Russian, or other languages).

Classify each email into ONE of:

  - invoice: Contains a bill the user must pay (or has issued). Look for: amount, due date, supplier name, invoice number. Common Latvian phrases: "rēķins", "rēķina nr.", "apmaksāt līdz", "summa apmaksai". Common English: "invoice", "bill", "amount due", "please remit", "payment due". Subscription renewal invoices count.

  - payment_confirmation: A receipt confirming money moved. Common phrases: "maksājums saņemts", "rēķins apmaksāts", "payment received", "transaction completed", "your payment of X". From banks, payment processors (Stripe, PayPal), service providers confirming receipt.

  - reminder: A NOTIFICATION about an existing invoice — typically "rēķins Nr. X termiņš tuvojas", "your invoice X is due in 3 days", "payment reminder". The original invoice already exists somewhere; this is just a nudge. Mark as reminder.

  - other: Anything else. Marketing newsletters, personal email, meeting invites, calendar notifications, package shipping notifications, social media. Most emails will be 'other'.

Be conservative — if it's not clearly invoice/payment/reminder, mark 'other'. Confidence should reflect your certainty: 0.9+ for clear cases, 0.5-0.7 for ambiguous, below 0.5 for 'probably not but maybe'.`;

/**
 * Send an email's headers + body text to Haiku for triage.
 * Returns a structured classification.
 *
 * Why Haiku 4.5 specifically:
 *   - ~30× cheaper than Opus per token
 *   - 2-3 second latency (Opus is 12-18s on PDFs)
 *   - More than smart enough for "is this an invoice?" — that's
 *     a classification task, not a vision/extraction task
 *
 * If the AI call itself fails, returns 'other' with confidence 0
 * so the email is skipped — better to miss one than crash the
 * whole scan.
 */
async function triageEmailWithAI(
  anthropic: Anthropic,
  fetched: FetchedEmail
): Promise<TriageResult> {
  const userContent = [
    `From: ${fetched.fromHeader}`,
    `Subject: ${fetched.subject}`,
    `Date: ${fetched.emailDate}`,
    "",
    "Body:",
    fetched.bodyText || "(no readable body text)",
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: TRIAGE_SYSTEM_PROMPT,
      tools: [TRIAGE_TOOL as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "classify_email" },
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === "tool_use" && block.name === "classify_email"
    );
    if (!toolUse) {
      return { type: "other", confidence: 0, reasoning: "AI returned no classification" };
    }
    const result = toolUse.input as TriageResult;
    return {
      type: result.type ?? "other",
      confidence: typeof result.confidence === "number" ? result.confidence : 0,
      reasoning: result.reasoning ?? "",
    };
  } catch (err) {
    console.warn("Triage AI call failed:", err);
    // Fail open — skip this email rather than crash the scan
    return {
      type: "other",
      confidence: 0,
      reasoning:
        err instanceof Error ? `Triage error: ${err.message}` : "Triage error",
    };
  }
}

/**
 * Extract invoice fields from PLAIN TEXT email body. Used when
 * the email has no PDF/image attachment but the invoice details
 * are in the body itself (subscription renewals, online services).
 *
 * Same Opus model + same EXTRACT_TOOL schema as the PDF path —
 * Opus does excellent extraction from prose. The triageType
 * argument hints at what we expect (invoice vs payment receipt)
 * so the extraction is calibrated correctly.
 */
async function parseInvoiceFromText(
  anthropic: Anthropic,
  bodyText: string,
  triageType: TriageResult["type"]
): Promise<ParsedInvoice> {
  const hint =
    triageType === "payment_confirmation"
      ? "This is a PAYMENT CONFIRMATION/RECEIPT. Extract the supplier (who got paid), the amount paid, and the date. Mark is_paid: true."
      : "This is an invoice in email body text. Extract the standard invoice fields.";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL as Anthropic.Messages.Tool],
    tool_choice: { type: "tool", name: "save_invoice_data" },
    messages: [
      {
        role: "user",
        content: `${hint}\n\n--- Email content ---\n${bodyText}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === "save_invoice_data"
  );
  if (!toolUse) {
    // Log the actual response for debugging — when this fires it
    // usually means the model returned text instead of tool_use,
    // which happens with adaptive-thinking models that ignore
    // forced tool_choice.
    console.error(
      "parseInvoiceFromText: AI did not use tool. Response content blocks:",
      response.content.map((b) => b.type)
    );
    throw new Error("AI neatgrieza strukturētus datus (text)");
  }
  return toolUse.input as ParsedInvoice;
}

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
    // Log the response shape for debugging
    console.error(
      "parseInvoiceWithAI: AI did not use tool. Response content blocks:",
      response.content.map((b) => b.type),
      "stop_reason:",
      response.stop_reason
    );
    throw new Error("AI neatgrieza strukturētus datus (PDF/image)");
  }
  return toolUse.input as ParsedInvoice;
}
