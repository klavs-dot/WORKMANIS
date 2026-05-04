/**
 * runReconciliation — reusable wrapper around the bank-reconciler
 * that fetches inputs from Sheets, runs the matcher, and writes
 * back results.
 *
 * Sesija 5 of the rēķini-redesign. Originally lived inline in
 * /api/bank-statement/import (Sesija 3) but the user now needs to
 * trigger reconciliation independently of statement import:
 *
 *   - After uploading a statement (Session 3 — happens automatically)
 *   - After manually adding a missed invoice (Session 5 — needs a
 *     button "Atkārtot salīdzināšanu")
 *   - On-demand to verify status (Session 5+)
 *
 * Lifting the logic into a library makes those use cases trivial:
 *   - bank-statement/import: parses+persists, then calls this
 *   - reconcile/run: just calls this directly
 *   - future ones: same
 *
 * The function is async + sequential by design — Sheets writes
 * don't parallelize safely (last-write-wins on the same range
 * loses data) and the workload is small enough (typically <200
 * invoices, <300 transactions per company) that sequential is
 * fine. Pre-reads updated_at maps once so we don't blow the
 * 300/min Sheets read quota.
 */

import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import { getCompanyClients } from "@/lib/company-clients";
import {
  reconcileBankAndInvoices,
  type BankTransaction,
  type IssuedInvoiceRow,
  type ReceivedInvoiceRow,
  type PaymentStatus,
  type ReconcileResult,
} from "@/lib/bank-reconciler";

export interface RunReconcileInput {
  companyId: string;
  /** Email of the user triggering this run — written to audit log */
  actor: string;
}

export type RunReconcileResult = ReconcileResult & {
  /**
   * Latest period_to from 39_bank_statements. Returned so callers
   * can show "Last bank statement: 2026-04-30" in the UI.
   * Undefined when no statements have been uploaded yet.
   */
  latestStatementDate?: string;
  /** True when no bank statements were on file at all — UI may
   *  surface a hint that reconciliation results will all be
   *  'nav_salidzinats' until one is uploaded. */
  hadNoStatements: boolean;
};

export async function runReconciliation(
  input: RunReconcileInput
): Promise<RunReconcileResult> {
  const cc = await getCompanyClients(input.companyId);
  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: input.actor,
  });

  // ───── Load all the inputs ─────
  const [
    issuedRaw,
    receivedRaw,
    paymentsRaw,
    statementsRaw,
  ] = await Promise.all([
    sheets.list("30_invoices_out") as Promise<
      Array<Record<string, unknown>>
    >,
    sheets.list("31_invoices_in") as Promise<
      Array<Record<string, unknown>>
    >,
    sheets.list("35_payments") as Promise<
      Array<Record<string, unknown>>
    >,
    sheets.list("39_bank_statements") as Promise<
      Array<Record<string, unknown>>
    >,
  ]);

  // Latest statement covers the most recent period_to. If user
  // uploaded multiple statements out of order, take the max.
  const periodTos = statementsRaw
    .map((r) => (r.period_to as string) || "")
    .filter(Boolean)
    .sort();
  const latestStatementDate =
    periodTos.length > 0 ? periodTos[periodTos.length - 1] : undefined;

  const issuedRows: IssuedInvoiceRow[] = issuedRaw.map((r) => ({
    id: String(r.id ?? ""),
    number: String(r.number ?? ""),
    client: String(r.client ?? ""),
    amountCents: Number(r.amount_cents ?? 0) || 0,
    issueDate: String(r.issue_date ?? ""),
    dueDate: String(r.due_date ?? ""),
    currentStatus: (r.payment_status as PaymentStatus) ?? "",
    currentPaymentId: String(r.payment_id ?? ""),
  }));

  const receivedRows: ReceivedInvoiceRow[] = receivedRaw.map((r) => ({
    id: String(r.id ?? ""),
    invoiceNumber: String(r.invoice_number ?? ""),
    supplier: String(r.supplier ?? ""),
    amountCents: Number(r.amount_cents ?? 0) || 0,
    dueDate: String(r.due_date ?? ""),
    currentStatus: (r.payment_status as PaymentStatus) ?? "",
    currentPaymentId: String(r.payment_id ?? ""),
  }));

  // 35_payments rows need to look like BankTransaction. We carry
  // the row id forward as paymentId so the reconciler can link
  // matched invoices back to the right payment.
  const transactions: BankTransaction[] = paymentsRaw.map((r) => {
    const amountCents = Number(r.amount_cents ?? 0) || 0;
    return {
      paymentId: String(r.id ?? ""),
      date: String(r.payment_date ?? ""),
      counterparty: String(r.counterparty ?? ""),
      counterpartyIban: (r.counterparty_iban as string) || undefined,
      amountCents,
      reference: String(r.bank_reference ?? r.raw_reference ?? ""),
      currency: "EUR",
    };
  });

  // ───── Run the matcher ─────
  const result = reconcileBankAndInvoices({
    issuedInvoices: issuedRows,
    receivedInvoices: receivedRows,
    bankTransactions: transactions,
    latestStatementDate,
  });

  // ───── Pre-read updated_at maps once ─────
  const updatedAtBy = new Map<string, string>();
  for (const r of issuedRaw) {
    updatedAtBy.set(`30/${r.id}`, (r.updated_at as string) ?? "");
  }
  for (const r of receivedRaw) {
    updatedAtBy.set(`31/${r.id}`, (r.updated_at as string) ?? "");
  }
  for (const r of paymentsRaw) {
    updatedAtBy.set(`35/${r.id}`, (r.updated_at as string) ?? "");
  }

  // ───── Write back invoice updates ─────
  for (const upd of result.invoiceUpdates) {
    const isIssued = issuedRows.some((r) => r.id === upd.invoiceId);
    const tab = isIssued ? "30_invoices_out" : "31_invoices_in";
    const tabPrefix = isIssued ? "30" : "31";

    const row = isIssued
      ? issuedRows.find((r) => r.id === upd.invoiceId)
      : receivedRows.find((r) => r.id === upd.invoiceId);
    if (!row) continue;

    // No-op if status didn't change
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
            // Clear the orphan tag if this transaction was previously
            // marked as orphan but now matched a freshly-added invoice
            payment_status: "",
            expected_updated_at: payExpectedUpdatedAt,
          }
        );
      }
    } catch (err) {
      console.warn(`Failed to update ${tab}/${upd.invoiceId}:`, err);
    }
  }

  // ───── Tag (or re-tag) orphan transactions ─────
  // We deliberately don't UNTAG here — only tag fresh orphans.
  // Untagging happens above when a transaction matches an
  // invoice (we set payment_status='' alongside matched_invoice_id).
  for (const orphan of result.orphans) {
    if (!orphan.transaction.paymentId) continue;
    // Skip if already tagged (idempotent: re-runs don't churn)
    const paymentRaw = paymentsRaw.find(
      (r) => r.id === orphan.transaction.paymentId
    );
    if (paymentRaw?.payment_status === "maksajums_bez_rekina") continue;
    if (paymentRaw?.payment_status === "sasaistits") continue;
    // 'sasaistits' means user already manually attached an invoice
    // — don't downgrade them back to orphan even though the
    // reconciler doesn't see a match (the manual link bypasses
    // the matcher).

    const expectedUpdatedAt =
      updatedAtBy.get(`35/${orphan.transaction.paymentId}`) ?? "";
    try {
      await sheets.update(
        "35_payments",
        orphan.transaction.paymentId,
        {
          payment_status: "maksajums_bez_rekina",
          expected_updated_at: expectedUpdatedAt,
        }
      );
    } catch (err) {
      console.warn(
        `Failed to tag orphan ${orphan.transaction.paymentId}:`,
        err
      );
    }
  }

  return {
    ...result,
    latestStatementDate,
    hadNoStatements: !latestStatementDate,
  };
}
