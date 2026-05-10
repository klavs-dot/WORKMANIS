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
import {
  createSheetsClientFromInstance,
} from "@/lib/sheets-client";
import { createDriveClientFromInstance } from "@/lib/drive-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
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
  /**
   * Sesija 2: count of AI-extracted invoices that were rejected
   * because the recipient/supplier didn't match the active company.
   * Always 0 if no company identity was loaded (filter disabled).
   */
  unmatchedCount: number;
  summary: string;
  /**
   * Per-error breakdown so the client can show the user WHY each
   * email failed (rate limit, AI didn't recognize, dedup, etc.).
   * Keeps debugging accessible without forcing the user to dig
   * through Vercel function logs.
   */
  debugErrors?: Array<{ messageId: string; reason: string }>;
  /**
   * Per-rejection breakdown for the company-match filter — surfaced
   * to the browser console so the user can see exactly which
   * invoices got filtered out and why.
   */
  unmatchedDetails?: Array<{
    messageId: string;
    supplier: string;
    recipient: string;
    reason: string;
  }>;
  /**
   * Sesija 7 — emails that triage classified as non-invoice and
   * skipped before extraction. Surfaces why an email might have
   * been skipped ('newsletter', 'personal', etc.) so the user
   * can verify the AI isn't being too aggressive.
   */
  triageSkippedDetails?: Array<{
    messageId: string;
    subject: string;
    type: string;
    confidence: number;
    reasoning: string;
  }>;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
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

  // Default to scanning both folders.
  const mailboxes: Mailbox[] = body.mailboxes?.length
    ? body.mailboxes
    : ["INBOX", "SENT"];

  // Per-company OAuth: get fresh clients tied to the connected
  // Gmail account. This is THE key change — the AI scanner now
  // reads emails from the Gmail account associated with this
  // specific company, not from the login user's primary inbox.
  let cc;
  try {
    cc = await getCompanyClients(companyId);
  } catch (err) {
    if (err instanceof NoCompanyOAuthError) {
      return NextResponse.json(
        {
          error:
            "Šim uzņēmumam nav pievienots Gmail konts. Atveriet uzņēmumu, lai pievienotu Gmail.",
          oauth_disconnected: true,
        },
        { status: 412 }
      );
    }
    throw err;
  }

  // Check that gmail.readonly scope was actually granted at
  // consent. If user declined Gmail access, fail fast with
  // a clear message rather than getting a cryptic 403 deep in
  // the scan.
  if (!cc.grantedScopes.some((s) => s.includes("gmail"))) {
    return NextResponse.json(
      {
        error:
          "Gmail piekļuve nav atļauta šim uzņēmumam. Pievieno Gmail kontu vēlreiz un atļauj e-pasta lasīšanu.",
        scope_missing: "gmail.readonly",
      },
      { status: 412 }
    );
  }

  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: session.user.email,
  });

  const drive = createDriveClientFromInstance({
    drive: cc.drive,
    companyFolderId: cc.company.folderId,
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

  // Sesija 2: read the active company's identity (legal name, reg
  // number, VAT number) from 01_requisites so the scanner can
  // filter out invoices addressed to OTHER companies that happen
  // to share this Gmail inbox.
  //
  // Falls back gracefully if the sheet is empty or the read fails
  // — undefined identity disables the filter and scanner accepts
  // every invoice (legacy behaviour). User will see "0 unmatched"
  // in that case rather than scan failure.
  let companyIdentity:
    | { legalName: string; regNumber: string; vatNumber: string }
    | undefined;
  try {
    const requisitesRows = (await sheets.list(
      "01_requisites"
    )) as Array<Record<string, unknown>>;
    const reqRow = requisitesRows[0];
    if (reqRow) {
      const legalName =
        ((reqRow.legal_name as string) || (reqRow.name as string) || "").trim();
      const regNumber = ((reqRow.reg_number as string) || "").trim();
      const vatNumber = ((reqRow.vat_number as string) || "").trim();
      // Only enable the filter if at least ONE identifier is set.
      // Without any identifiers we couldn't reject anything anyway.
      if (legalName || regNumber || vatNumber) {
        companyIdentity = { legalName, regNumber, vatNumber };
        console.log(
          `[email-import] company identity loaded — name='${legalName}' reg='${regNumber}' vat='${vatNumber}'`
        );
      } else {
        console.warn(
          `[email-import] 01_requisites row found but all identifiers empty — filter disabled`
        );
      }
    } else {
      console.warn(
        `[email-import] 01_requisites is empty — no company identity, filter disabled`
      );
    }
  } catch (err) {
    console.error(
      `[email-import] failed to read 01_requisites for identity match:`,
      err
    );
    // Continue without the filter rather than fail the whole scan
  }

  // Run each mailbox scan
  const summaries: MailboxScanSummary[] = [];

  for (const mailbox of mailboxes) {
    const sinceTs = lastScanByMailbox.get(mailbox);
    const startedAt = new Date().toISOString();

    // Stats accumulated during the scan via callbacks. These run
    // INSIDE the scan loop now (via onItemParsed), so when the
    // function dies mid-scan, everything processed up to that
    // point is already persisted to Drive + Sheets.
    let invoicesCreated = 0;
    let duplicatesSkipped = 0;
    let lastCheckpointAt = Date.now();
    let checkpointRowId: string | null = null;

    const writeCheckpoint = async (
      cursorMs: number,
      processed: number,
      errorsCount: number,
      status: "in_progress" | "ok" | "partial" | "error"
    ) => {
      // First checkpoint creates the row; subsequent updates would
      // need optimistic locking which makes this fragile. Simpler:
      // each checkpoint is a NEW row. The lookup picks the MAX
      // last_message_internal_date across all rows for this mailbox,
      // so multiple rows per scan still work for the cursor.
      try {
        const summary =
          `Apstrādāti ${processed}/${
            // We don't know total at first checkpoint; recompute
            // from scan result snapshot when available
            processed
          }, ${invoicesCreated} izveidoti, ${duplicatesSkipped} dublikāti, ${errorsCount} kļūdas`;
        const row = await sheets.create("60_email_imports", {
          mailbox,
          started_at: startedAt,
          completed_at:
            status === "in_progress" ? "" : new Date().toISOString(),
          messages_found: "",
          messages_processed: String(processed),
          invoices_created: String(invoicesCreated),
          duplicates_skipped: String(duplicatesSkipped),
          errors_count: String(errorsCount),
          last_message_internal_date: String(cursorMs),
          summary,
          status,
        });
        checkpointRowId = row.id;
      } catch (err) {
        console.warn("Checkpoint write failed:", err);
      }
    };

    let scanResult;
    try {
      scanResult = await scanGmailForInvoices(
        {
          gmailClient: cc.gmail,
          mailbox,
          sinceInternalDate: sinceTs,
          // Sesija 2: identity-filter so we only ingest invoices
          // addressed TO us (INBOX) or issued BY us (SENT). When
          // identity is undefined (couldn't read requisites), the
          // filter is disabled and we accept every invoice.
          companyIdentity,
          // Lower cap (default 6) — fits in one Vercel function
          // call. Users with more mail click again to continue.
        },
        apiKey,
        // onProgress — used for logging only, no UI streaming yet
        undefined,
        // onItemParsed — persist each invoice IMMEDIATELY after
        // AI parsing succeeds. This is the key fix: previously the
        // whole batch was held in memory until the scan loop
        // finished, so a timeout meant losing everything.
        async (item) => {
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
            // Re-throw so the scanner counts this as an error
            throw err;
          }
        },
        // onCheckpoint — write a 60_email_imports row every ~10s
        // of work so we always have a recent cursor. Don't write
        // every chunk — that's too chatty.
        async (snapshot) => {
          const elapsed = Date.now() - lastCheckpointAt;
          if (elapsed > 10000) {
            void checkpointRowId; // suppress unused for now
            await writeCheckpoint(
              snapshot.lastMessageInternalDate,
              snapshot.messagesProcessed,
              snapshot.errors.length,
              "in_progress"
            );
            lastCheckpointAt = Date.now();
          }
        }
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Skenēšanas kļūda";
      console.error(`Email scan ${mailbox} failed:`, err);
      // Even on failure, write a final checkpoint so the cursor
      // we DID advance through is preserved
      await writeCheckpoint(
        // Best-effort: use 0 as cursor — next scan re-checks
        // from before this run started
        sinceTs ?? 0,
        0,
        1,
        "error"
      );
      summaries.push({
        mailbox,
        messagesFound: 0,
        messagesProcessed: 0,
        invoicesCreated: 0,
        duplicatesSkipped: 0,
        errors: 1,
        unmatchedCount: 0,
        summary: `Skenēšanas kļūda: ${errorMsg}`,
        debugErrors: [{ messageId: "scan", reason: errorMsg }],
      });
      continue;
    }

    // Final audit row with completed status
    const unmatchedCount = scanResult.unmatched.length;
    const summaryText =
      `Atrasti ${scanResult.messagesFound}, apstrādāti ${scanResult.messagesProcessed}, ` +
      `izveidoti ${invoicesCreated}, dublikāti ${duplicatesSkipped}, ` +
      `citiem uzņēmumiem ${unmatchedCount}, kļūdas ${scanResult.errors.length}`;

    console.log(
      `[email-import] FINAL mailbox=${mailbox} ${summaryText}. ` +
        `Errors: ${scanResult.errors.map((e) => e.reason).join("; ")}`
    );
    if (unmatchedCount > 0) {
      console.log(
        `[email-import] UNMATCHED in ${mailbox}:`,
        scanResult.unmatched.map((u) => `${u.recipient} — ${u.reason}`)
      );
    }

    try {
      await sheets.create("60_email_imports", {
        mailbox,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
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
      console.warn("Failed to write final 60_email_imports row:", err);
    }

    summaries.push({
      mailbox,
      messagesFound: scanResult.messagesFound,
      messagesProcessed: scanResult.messagesProcessed,
      invoicesCreated,
      duplicatesSkipped,
      errors: scanResult.errors.length,
      unmatchedCount,
      summary: summaryText,
      // Debug: full error breakdown so we can see in client what's
      // happening (UI surfaces this in a console.log + toast detail)
      debugErrors: scanResult.errors.map((e) => ({
        messageId: e.messageId,
        reason: e.reason,
      })),
      unmatchedDetails: scanResult.unmatched,
      triageSkippedDetails: scanResult.triageSkipped,
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
  sheets: ReturnType<typeof createSheetsClientFromInstance>,
  drive: ReturnType<typeof createDriveClientFromInstance>,
  inDedup: Set<string>,
  outDedup: Set<string>
): Promise<"created" | "duplicate"> {
  const { candidate, parsed } = item;
  const direction: "issued" | "received" =
    mailbox === "INBOX" ? "received" : "issued";

  console.log(
    `[email-import] persistOne dir=${direction} supplier="${parsed.supplier_name ?? "?"}" recipient="${parsed.recipient_name ?? "?"}" number="${parsed.invoice_number ?? "?"}" amount=${parsed.amount_total ?? 0}`
  );

  // Dedup BEFORE we spend Drive upload tokens
  if (direction === "received") {
    const key = `${parsed.supplier_name}|${parsed.invoice_number}`;
    if (inDedup.has(key)) {
      console.log(`[email-import] DUPLICATE (received) key=${key}`);
      return "duplicate";
    }
    inDedup.add(key);
  } else {
    // Issued: dedup by (recipient_name, invoice_number) — Claude's
    // recipient_name is the CLIENT, supplier_name is us
    const key = `${parsed.recipient_name}|${parsed.invoice_number}`;
    if (outDedup.has(key)) {
      console.log(`[email-import] DUPLICATE (issued) key=${key}`);
      return "duplicate";
    }
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

  console.log(
    `[email-import] CREATED ${direction} invoice for ${
      direction === "received" ? parsed.supplier_name : parsed.recipient_name
    } number=${parsed.invoice_number}`
  );
  return "created";
}
