/**
 * POST /api/bank-statement/import
 *
 * Receives a bank statement file (FIDAVISTA XML, ISO 20022 camt.053
 * XML, or CSV from any Latvian bank), parses it, persists transactions
 * to 35_payments + a metadata row to 39_bank_statements, then runs
 * the reconciler to assign payment_status to every invoice in
 * 30_invoices_out + 31_invoices_in.
 *
 * Sesija 3 of the rēķini-redesign. Replaces the client-side parsing
 * that lived in bank-exchange-panel.tsx — moving it server-side lets
 * us write through the company's per-company OAuth tokens (so the
 * statement lands in the company's own Drive + Sheet, not the login
 * user's). The client just uploads bytes; everything else happens here.
 *
 * Request:
 *   multipart/form-data
 *     file:        the statement file
 *     company_id:  active company (also passed via ?company_id query)
 *
 * Response:
 *   {
 *     ok: true,
 *     parsed: { transactionCount, format, period: {from, to} },
 *     reconciled: {
 *       matched: N,           // invoices marked apmaksats
 *       waiting: N,           // invoices still gaida_apmaksu
 *       notReconciled: N,     // invoices nav_salidzinats
 *       orphansIncoming: N,   // received money with no invoice
 *       orphansOutgoing: N,   // we paid someone with no invoice
 *     }
 *   }
 *
 * Errors return 4xx with { error: 'Latvian message' }.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import {
  parseBankStatementXML,
  isBankStatementXML,
} from "@/lib/bank-statement-xml";
import {
  parseBankStatementCSV,
  type ParsedTransaction,
} from "@/lib/bank-exchange";
import {
  reconcileBankAndInvoices,
  type BankTransaction,
  type IssuedInvoiceRow,
  type ReceivedInvoiceRow,
  type PaymentStatus,
} from "@/lib/bank-reconciler";

// 120s — a typical bank statement has 50-300 transactions and we
// do one Sheet write per matched invoice + one per orphan
// transaction. With the optimistic-lock + retry overhead, that
// can hit 60-90s on big imports.
export const maxDuration = 120;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
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
      { error: `Fails par lielu (${Math.round(file.size / 1024)}KB). Maks: 5MB.` },
      { status: 413 }
    );
  }

  const text = await file.text();

  // ───── Step 1: parse the file ─────
  let transactions: ParsedTransaction[];
  let format: "fidavista" | "csv";
  try {
    if (isBankStatementXML(text)) {
      transactions = parseBankStatementXML(text);
      format = "fidavista";
    } else {
      transactions = parseBankStatementCSV(text);
      format = "csv";
    }
  } catch (err) {
    console.error("Bank statement parse failed:", err);
    return NextResponse.json(
      {
        error: `Faila parse neizdevās: ${err instanceof Error ? err.message : "nezināma kļūda"}. Atbalstīti: FIDAVISTA XML, ISO 20022 camt.053, CSV no SEB/Swedbank/Citadele/Luminor.`,
      },
      { status: 400 }
    );
  }

  if (transactions.length === 0) {
    return NextResponse.json(
      {
        error:
          "Failā nav neviena darījuma. Pārliecinies, ka tas ir banka izraksts ar vismaz vienu darījumu.",
      },
      { status: 400 }
    );
  }

  // Compute statement period from the transactions themselves
  const dates = transactions
    .map((t) => t.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  const periodFrom = dates[0] ?? "";
  const periodTo = dates[dates.length - 1] ?? "";

  // Detect bank account IBAN if the first transaction has one
  // distinct field for it. Most parsers don't extract the account-
  // owner's IBAN separately (that's metadata in the file header
  // not on each transaction), so we leave it blank for now and
  // can refine later.
  const bankAccountIban = "";

  // ───── Step 2: get the company's clients ─────
  let cc;
  try {
    cc = await getCompanyClients(companyId);
  } catch (err) {
    if (err instanceof NoCompanyOAuthError) {
      return NextResponse.json(
        {
          error:
            "Šim uzņēmumam nav pievienots Gmail konts. Atveriet uzņēmumu un pievienojiet Gmail.",
          oauth_disconnected: true,
        },
        { status: 412 }
      );
    }
    throw err;
  }

  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: session.user.email,
  });

  // ───── Step 3: persist transactions to 35_payments ─────
  // We append a new row for each transaction with raw_reference
  // populated. Classification (which 'section' it belongs to —
  // invoice / salary / tax) is left for downstream code; right
  // now we just want them in the sheet for reconciliation.
  const persistedTxs: BankTransaction[] = [];
  for (const tx of transactions) {
    try {
      const amountCents = Math.round(tx.amount * 100);
      const direction = amountCents >= 0 ? "incoming" : "outgoing";
      const row = await sheets.create("35_payments", {
        direction,
        category: "",
        invoice_out_id: "",
        invoice_in_id: "",
        salary_id: "",
        tax_id: "",
        counterparty: tx.counterparty,
        counterparty_iban: tx.counterpartyIban ?? "",
        amount_cents: String(amountCents),
        payment_date: tx.date ?? tx.rawDate,
        bank_account_iban: bankAccountIban,
        bank_reference: tx.reference,
        source: "fidavista_import",
        imported_from_csv_filename: file.name,
        classified_section: "",
        matched_invoice_id: "",
        raw_reference: tx.reference,
      });
      const id = (row as unknown as Record<string, unknown>).id as string;
      persistedTxs.push({
        paymentId: id,
        date: tx.date ?? tx.rawDate,
        counterparty: tx.counterparty,
        counterpartyIban: tx.counterpartyIban,
        amountCents,
        reference: tx.reference,
        currency: tx.currency,
      });
    } catch (err) {
      console.error("Failed to persist tx:", err);
      // Continue — partial import is better than full rollback.
    }
  }

  // Write 39_bank_statements metadata row so the reconciler knows
  // the latest period_to next time it runs.
  try {
    await sheets.create("39_bank_statements", {
      filename: file.name,
      format,
      bank_account_iban: bankAccountIban,
      period_from: periodFrom,
      period_to: periodTo,
      transaction_count: String(persistedTxs.length),
      imported_at: new Date().toISOString(),
      imported_by: session.user.email,
      drive_file_id: "",
      notes: "",
    });
  } catch (err) {
    console.warn("Failed to write 39_bank_statements row:", err);
    // Non-fatal — reconciliation still works using the period
    // we computed from transactions.
  }

  // ───── Step 4: load invoices for reconciliation ─────
  let issuedRows: IssuedInvoiceRow[] = [];
  let receivedRows: ReceivedInvoiceRow[] = [];
  try {
    const issuedRaw = await sheets.list("30_invoices_out");
    issuedRows = (issuedRaw as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ""),
      number: String(r.number ?? ""),
      client: String(r.client ?? ""),
      amountCents: Number(r.amount_cents ?? 0) || 0,
      issueDate: String(r.issue_date ?? ""),
      dueDate: String(r.due_date ?? ""),
      currentStatus: (r.payment_status as PaymentStatus) ?? "",
      currentPaymentId: String(r.payment_id ?? ""),
    }));

    const receivedRaw = await sheets.list("31_invoices_in");
    receivedRows = (receivedRaw as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id ?? ""),
      invoiceNumber: String(r.invoice_number ?? ""),
      supplier: String(r.supplier ?? ""),
      amountCents: Number(r.amount_cents ?? 0) || 0,
      dueDate: String(r.due_date ?? ""),
      currentStatus: (r.payment_status as PaymentStatus) ?? "",
      currentPaymentId: String(r.payment_id ?? ""),
    }));
  } catch (err) {
    console.error("Failed to load invoices for reconcile:", err);
    return NextResponse.json(
      {
        error: `Bankas izraksts saglabāts, bet rēķinu salīdzināšana neizdevās: ${err instanceof Error ? err.message : "Sheets kļūda"}`,
        parsed: {
          transactionCount: persistedTxs.length,
          format,
          period: { from: periodFrom, to: periodTo },
        },
      },
      { status: 502 }
    );
  }

  // ───── Step 5: run the reconciler ─────
  const result = reconcileBankAndInvoices({
    issuedInvoices: issuedRows,
    receivedInvoices: receivedRows,
    bankTransactions: persistedTxs,
    latestStatementDate: periodTo,
  });

  // ───── Step 6: write back the per-invoice updates ─────
  // Optimistic-lock note: sheets.update() requires
  // expected_updated_at. We pre-read updated_at maps for both
  // invoice tabs + payments ONCE here instead of once-per-update,
  // saving N×3 Sheets reads on big imports (300+ invoices would
  // otherwise blow through the 300/min quota).
  //
  // Tradeoff: if a user edits an invoice in another tab WHILE
  // this reconciler runs, they could get an OptimisticLockError.
  // That's acceptable — reconciliation is a 30-60s process and
  // the window for collision is small.
  const issuedFreshList = (await sheets.list(
    "30_invoices_out"
  )) as Array<Record<string, unknown>>;
  const receivedFreshList = (await sheets.list(
    "31_invoices_in"
  )) as Array<Record<string, unknown>>;
  const paymentsFreshList = (await sheets.list(
    "35_payments"
  )) as Array<Record<string, unknown>>;

  const updatedAtBy = new Map<string, string>();
  for (const r of issuedFreshList) {
    updatedAtBy.set(`30/${r.id}`, (r.updated_at as string) ?? "");
  }
  for (const r of receivedFreshList) {
    updatedAtBy.set(`31/${r.id}`, (r.updated_at as string) ?? "");
  }
  for (const r of paymentsFreshList) {
    updatedAtBy.set(`35/${r.id}`, (r.updated_at as string) ?? "");
  }

  for (const upd of result.invoiceUpdates) {
    const isIssued = issuedRows.some((r) => r.id === upd.invoiceId);
    const tab = isIssued ? "30_invoices_out" : "31_invoices_in";
    const tabPrefix = isIssued ? "30" : "31";

    const row = isIssued
      ? issuedRows.find((r) => r.id === upd.invoiceId)
      : receivedRows.find((r) => r.id === upd.invoiceId);
    if (!row) continue;

    // Skip if status didn't actually change — saves us a write
    if (
      row.currentStatus === upd.newStatus &&
      row.currentPaymentId === (upd.matchedTransaction?.paymentId ?? "")
    ) {
      continue;
    }

    try {
      const expectedUpdatedAt =
        updatedAtBy.get(`${tabPrefix}/${upd.invoiceId}`) ?? "";

      await sheets.update(tab, upd.invoiceId, {
        payment_status: upd.newStatus,
        payment_id: upd.matchedTransaction?.paymentId ?? "",
        expected_updated_at: expectedUpdatedAt,
      });

      if (upd.matchedTransaction?.paymentId) {
        const payExpectedUpdatedAt =
          updatedAtBy.get(`35/${upd.matchedTransaction.paymentId}`) ?? "";
        await sheets.update(
          "35_payments",
          upd.matchedTransaction.paymentId,
          {
            matched_invoice_id: upd.invoiceId,
            classified_section: isIssued ? "invoice_out" : "invoice_in",
            expected_updated_at: payExpectedUpdatedAt,
          }
        );
      }
    } catch (err) {
      console.warn(`Failed to update ${tab}/${upd.invoiceId}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    parsed: {
      transactionCount: persistedTxs.length,
      format,
      period: { from: periodFrom, to: periodTo },
    },
    reconciled: result.summary,
  });
}
