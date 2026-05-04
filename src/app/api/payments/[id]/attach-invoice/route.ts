/**
 * POST /api/payments/[id]/attach-invoice
 *
 * Sesija 4 of the rēķini-redesign — handles the "Augšupielādēt
 * manuāli" button users click when a bank transaction has no
 * matching invoice. The user picks a PDF / image; we:
 *
 *   1. Upload the file to the company's Drive (in the
 *      "Manuāli pievienotie" subfolder so accountants know
 *      these came from the user, not AI scan)
 *   2. Update the 35_payments row with manual_invoice_drive_id
 *      + manual_invoice_filename
 *   3. Flip payment_status from 'maksajums_bez_rekina' to
 *      'sasaistits' so the red frame goes away
 *
 * We deliberately do NOT create a 30_invoices_out / 31_invoices_in
 * row for these. Reasons:
 *   - The transaction is the source of truth (we know exact
 *     amount + date from the bank); a derived invoice row would
 *     just duplicate that
 *   - Bookkeepers want to see "here's what the user attached
 *     to this payment" — if it's also in the invoices tab, it
 *     gets confusing whether it was AI-imported or manual
 *   - Future Sesija 5 may add an "Promote to invoice" button if
 *     the user explicitly wants it indexed there
 *
 * Request: multipart/form-data with single 'file' field
 * Response: { ok, fileId, viewUrl }
 *
 * Errors: 412 if no Gmail connected, 404 if payment not found,
 * 413 if file > 10MB.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createDriveClientFromInstance,
  DriveError,
} from "@/lib/drive-client";
import {
  createSheetsClientFromInstance,
} from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";

export const maxDuration = 60;

// Bigger than the AI-scanner cap (5MB) because users sometimes
// have phone-photo PDFs that ballon to 8-9MB. We trust manual
// uploads more than scrape-bait.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: paymentId } = await params;
  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Nepareizs formas formāts" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Trūkst 'file' lauks" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `Fails par lielu (${Math.round(file.size / 1024 / 1024)}MB). Maks: 10MB.`,
      },
      { status: 413 }
    );
  }

  // ───── Get the company's clients ─────
  let cc;
  try {
    cc = await getCompanyClients(companyId);
  } catch (err) {
    if (err instanceof NoCompanyOAuthError) {
      return NextResponse.json(
        {
          error:
            "Šim uzņēmumam nav pievienots Gmail konts.",
          oauth_disconnected: true,
        },
        { status: 412 }
      );
    }
    throw err;
  }

  const drive = createDriveClientFromInstance({
    drive: cc.drive,
    companyFolderId: cc.company.folderId,
  });
  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: session.user.email,
  });

  // ───── Verify the payment row exists + is actually orphaned ─────
  // We fetch fresh so we have updated_at for the optimistic-lock
  // patch. Also a sanity check: if the payment was already linked
  // (status != maksajums_bez_rekina), reject — overwriting a
  // matched payment's link could destroy real reconciliation work.
  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;
  const paymentRow = allPayments.find((r) => r.id === paymentId);
  if (!paymentRow) {
    return NextResponse.json(
      { error: `Maksājums nav atrasts (${paymentId})` },
      { status: 404 }
    );
  }
  const currentStatus = paymentRow.payment_status as string | undefined;
  if (currentStatus && currentStatus !== "maksajums_bez_rekina") {
    return NextResponse.json(
      {
        error: `Šis maksājums jau ir sasaistīts ar rēķinu (statuss: ${currentStatus}). Vispirms noņem esošo saiti.`,
      },
      { status: 409 }
    );
  }

  // ───── Upload the file to Drive ─────
  // Path: WORKMANIS / accounts / .../  / company / Manuāli_pievienotie / YYYY-MM /
  // YYYY-MM groups by the payment date (not today's date) so files
  // stay alongside the period they relate to. Falls back to today
  // if payment_date is missing.
  const paymentDate =
    (paymentRow.payment_date as string) || new Date().toISOString().slice(0, 10);
  const yearMonth = paymentDate.slice(0, 7); // YYYY-MM
  const subPath = `Manuali_pievienotie/${yearMonth}`;

  let uploaded;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    uploaded = await drive.uploadFile({
      subPath,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      content: buffer,
    });
  } catch (err) {
    if (err instanceof DriveError) {
      console.error("Manual upload to Drive failed:", err);
      return NextResponse.json(
        { error: `Drive kļūda: ${err.message}` },
        { status: 502 }
      );
    }
    console.error("Unknown Drive upload error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Augšupielāde neizdevās",
      },
      { status: 502 }
    );
  }

  // ───── Patch the payment row ─────
  const expectedUpdatedAt = (paymentRow.updated_at as string) ?? "";
  try {
    await sheets.update("35_payments", paymentId, {
      manual_invoice_drive_id: uploaded.fileId,
      manual_invoice_filename: file.name,
      payment_status: "sasaistits",
      expected_updated_at: expectedUpdatedAt,
    });
  } catch (err) {
    console.error("Failed to patch payment after upload:", err);
    // The Drive file is uploaded but the link wasn't recorded.
    // Don't try to clean up Drive — leaving an orphan file is
    // safer than the alternative of accidentally deleting a
    // user's invoice. They can re-attach.
    return NextResponse.json(
      {
        error: `Fails saglabāts Drive, bet sasaistīšana neizdevās: ${err instanceof Error ? err.message : "Sheets kļūda"}. Mēģini atkārtoti.`,
        fileId: uploaded.fileId,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    fileId: uploaded.fileId,
    viewUrl: uploaded.viewUrl,
    filename: file.name,
  });
}
