/**
 * POST /api/email-import
 *
 * Triggered by the user clicking "Ielasīt e-pasta rēķinus".
 *
 * Scans Gmail INBOX (received invoices → 31_invoices_in) and SENT
 * (issued invoices → 30_invoices_out) for messages with PDF
 * attachments since the last successful scan. Each PDF is parsed
 * with Claude, the file is uploaded to Drive, and a new invoice
 * row is appended.
 *
 * The endpoint is intentionally synchronous — it runs the entire
 * scan in one HTTP request. Vercel function timeout is 60s; a
 * typical month has <30 invoices and processes in 30-50s. If the
 * user has years of unscanned mail the first run will hit the
 * cap on messages per run (default 50) and stop early — they can
 * just click the button again to continue.
 *
 * Request body:
 *   { mailboxes: ['INBOX', 'SENT'] }   // optional, defaults to both
 *
 * Query string:
 *   company_id   — which company's data to write to
 *
 * Response:
 *   {
 *     scans: [
 *       {
 *         mailbox: 'INBOX' | 'SENT',
 *         messagesFound: number,
 *         messagesProcessed: number,
 *         invoicesCreated: number,
 *         duplicatesSkipped: number,
 *         errors: number,
 *         summary: string
 *       }
 *     ]
 *   }
 *
 * Auth: requires logged-in session with gmail.readonly scope.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient } from "@/lib/sheets-client";
import { createDriveClient } from "@/lib/drive-client";
import {
  scanGmailForInvoices,
  type Mailbox,
  type ScannedInvoice,
} from "@/lib/email-scanner";
import { buildInvoiceSubPath } from "@/lib/drive-files";

// Generous Vercel timeout — a 50-message scan with AI parsing
// can take 40-60s. If real users hit the cap we'll need to
// move this to background processing, but it's fine for now.
export const maxDuration = 300;

interface RequestBody {
  mailboxes?: Mailbox[];
}

interface MailboxScanSummary {
  mailbox: Mailbox;
  messagesFound: number;
  messagesProcessed: number;
  invoicesCreated: number;
  duplicatesSkipped: number;
  errors: number;
  summary: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in environment");
    return NextResponse.json(
      { error: "Servera konfigurācijas kļūda" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Default to scanning both folders. Each is independent — INBOX
  // for invoices we owe (31_invoices_in), SENT for invoices we
  // issued through external systems (30_invoices_out).
  const mailboxes: Mailbox[] = body.mailboxes?.length
    ? body.mailboxes
    : ["INBOX", "SENT"];

  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const sheets = createSheetsClient({
    accessToken: session.accessToken,
    spreadsheetId: company.sheetId,
    actor: session.user.email,
  });

  const drive = createDriveClient({
    accessToken: session.accessToken,
    companyFolderId: company.folderId,
  });

  // Look up the last scan time per mailbox so we can pass it as
  // 'sinceInternalDate' to avoid re-scanning the same emails.
  let priorScans: Array<Record<string, unknown>> = [];
  try {
    priorScans = (await sheets.list("60_email_imports")) as Array<
      Record<string, unknown>
    >;
  } catch (err) {
    // Tab might not exist yet (user hasn't run schema repair).
    // Treat as no prior scans — they'll get the default 31-day
    // window. Schema repair will fix the tab on next sheets write.
    console.warn("60_email_imports list failed:", err);
  }

  const lastScanByMailbox = new Map<Mailbox, number>();
  for (const row of priorScans) {
    const mb = (row.mailbox as string)?.toUpperCase() as Mailbox | undefined;
    const ts = parseInt(
      (row.last_message_internal_date as string) || "0",
      10
    );
    if (mb && (mb === "INBOX" || mb === "SENT") && !isNaN(ts)) {
      const current = lastScanByMailbox.get(mb) ?? 0;
      if (ts > current) lastScanByMailbox.set(mb, ts);
    }
  }

  // Pre-fetch existing invoices for dedup checks. A duplicate is
  // (supplier, invoice_number) for INBOX, (client, number) for
  // SENT. Both are cheap small lookups for typical workloads.
  const existingIn = (await sheets.list("31_invoices_in")) as Array<
    Record<string, unknown>
  >;
  const existingOut = (await sheets.list("30_invoices_out")) as Array<
    Record<string, unknown>
  >;

  const inDedup = new Set(
    existingIn.map(
      (r) => `${r.supplier ?? ""}|${r.invoice_number ?? ""}`
    )
  );
  const outDedup = new Set(
    existingOut.map((r) => `${r.client ?? ""}|${r.number ?? ""}`)
  );

  // Run each mailbox scan
  const summaries: MailboxScanSummary[] = [];

  for (const mailbox of mailboxes) {
    const sinceTs = lastScanByMailbox.get(mailbox);

    const startedAt = new Date().toISOString();

    let scanResult;
    try {
      scanResult = await scanGmailForInvoices(
        {
          accessToken: session.accessToken,
          mailbox,
          sinceInternalDate: sinceTs,
          maxMessages: 50,
        },
        apiKey
      );
    } catch (err) {
      console.error(`Email scan ${mailbox} failed:`, err);
      summaries.push({
        mailbox,
        messagesFound: 0,
        messagesProcessed: 0,
        invoicesCreated: 0,
        duplicatesSkipped: 0,
        errors: 1,
        summary:
          err instanceof Error
            ? `Skenēšanas kļūda: ${err.message}`
            : "Skenēšanas kļūda",
      });
      continue;
    }

    // Persist parsed invoices: upload PDF to Drive + insert row
    let invoicesCreated = 0;
    let duplicatesSkipped = 0;

    for (const item of scanResult.invoicesParsed) {
      try {
        const persisted = await persistOne(
          item,
          mailbox,
          sheets,
          drive,
          inDedup,
          outDedup
        );
        if (persisted === "created") invoicesCreated++;
        else if (persisted === "duplicate") duplicatesSkipped++;
      } catch (err) {
        console.error(
          `Failed to persist invoice from message ${item.candidate.messageId}:`,
          err
        );
        scanResult.errors.push({
          messageId: item.candidate.messageId,
          reason:
            err instanceof Error ? err.message : "Saglabāšana neizdevās",
        });
      }
    }

    // Write the audit row to 60_email_imports
    const completedAt = new Date().toISOString();
    const summaryText =
      `Atrasti ${scanResult.messagesFound}, apstrādāti ${scanResult.messagesProcessed}, ` +
      `izveidoti ${invoicesCreated}, dublikāti ${duplicatesSkipped}, kļūdas ${scanResult.errors.length}`;

    try {
      await sheets.create("60_email_imports", {
        mailbox,
        started_at: startedAt,
        completed_at: completedAt,
        messages_found: String(scanResult.messagesFound),
        messages_processed: String(scanResult.messagesProcessed),
        invoices_created: String(invoicesCreated),
        duplicates_skipped: String(duplicatesSkipped),
        errors_count: String(scanResult.errors.length),
        last_message_internal_date: String(scanResult.lastMessageInternalDate),
        summary: summaryText,
        status: scanResult.errors.length === 0 ? "ok" : "partial",
      });
    } catch (err) {
      console.warn("Failed to write 60_email_imports row:", err);
    }

    summaries.push({
      mailbox,
      messagesFound: scanResult.messagesFound,
      messagesProcessed: scanResult.messagesProcessed,
      invoicesCreated,
      duplicatesSkipped,
      errors: scanResult.errors.length,
      summary: summaryText,
    });
  }

  return NextResponse.json({ scans: summaries });
}

/**
 * Upload the PDF and insert one invoice row. Returns:
 *   'created'   — new row appended
 *   'duplicate' — existing row had same supplier+number
 */
async function persistOne(
  item: ScannedInvoice,
  mailbox: Mailbox,
  sheets: ReturnType<typeof createSheetsClient>,
  drive: ReturnType<typeof createDriveClient>,
  inDedup: Set<string>,
  outDedup: Set<string>
): Promise<"created" | "duplicate"> {
  const { candidate, parsed } = item;
  const direction: "issued" | "received" =
    mailbox === "INBOX" ? "received" : "issued";

  // Dedup BEFORE we spend Drive upload tokens
  if (direction === "received") {
    const key = `${parsed.supplier_name}|${parsed.invoice_number}`;
    if (inDedup.has(key)) return "duplicate";
    inDedup.add(key);
  } else {
    // Issued: dedup by (recipient_name, invoice_number) — Claude's
    // recipient_name is the CLIENT, supplier_name is us
    const key = `${parsed.recipient_name}|${parsed.invoice_number}`;
    if (outDedup.has(key)) return "duplicate";
    outDedup.add(key);
  }

  // Upload PDF to Drive under invoices-in/2026/04 or
  // invoices-out/2026/04 by issue date
  const subPath = buildInvoiceSubPath(direction, parsed.issue_date);
  const upload = await drive.uploadFile({
    subPath,
    filename: candidate.attachment.filename,
    mimeType: candidate.attachment.mimeType,
    content: candidate.attachment.data,
  });

  // Insert the invoice row
  if (direction === "received") {
    await sheets.create("31_invoices_in", {
      supplier: parsed.supplier_name,
      invoice_number: parsed.invoice_number,
      description: parsed.description ?? "",
      amount_cents: String(Math.round(parsed.amount_total * 100)),
      iban: parsed.iban ?? "",
      due_date: parsed.due_date || candidate.emailDate,
      status: parsed.is_paid ? "apmaksats" : "apstiprinat_banka",
      file_name: candidate.attachment.filename,
      pn_akts: "",
      pn_akts_source: "",
      pn_akts_file_name: "",
      accounting_category: parsed.suggested_category ?? "",
      depreciation_period:
        parsed.suggested_depreciation_years > 0
          ? String(parsed.suggested_depreciation_years)
          : "",
      accounting_explanation: parsed.description ?? "",
      accounting_updated_at: new Date().toISOString(),
      source_channel: "internet",
      payment_evidence: "",
      file_drive_id: upload.fileId,
      pn_akts_drive_id: "",
    });
  } else {
    await sheets.create("30_invoices_out", {
      number: parsed.invoice_number,
      client: parsed.recipient_name || "Nezināms klients",
      description: parsed.description ?? "",
      amount_cents: String(Math.round(parsed.amount_total * 100)),
      vat_cents: String(Math.round(parsed.vat_amount * 100)),
      issue_date: parsed.issue_date || candidate.emailDate,
      due_date: parsed.due_date || candidate.emailDate,
      status: parsed.is_paid ? "apmaksats" : "gaidam_apmaksu",
      delivery_note: "",
      pn_akts: "",
      pn_akts_source: "",
      pn_akts_file_name: "",
      file_drive_id: upload.fileId,
      pn_akts_drive_id: "",
      delivery_note_drive_id: "",
    });
  }

  return "created";
}
