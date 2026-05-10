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
import { classifyTransaction } from "@/lib/payment-classifier";
import {
  reconcileBankAndInvoices,
  type BankTransaction,
  type IssuedInvoiceRow,
  type ReceivedInvoiceRow,
  type PaymentStatus,
} from "@/lib/bank-reconciler";
import {
  classifyOrphanTransaction,
  type KnownClient,
  type KnownSupplier,
  type KnownPartner,
  type KnownEmployee,
} from "@/lib/orphan-classifier";
import Anthropic from "@anthropic-ai/sdk";

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
  //
  // Sesija 7 hotfix — duplicate detection. If the user re-uploads
  // the same FIDAVISTA file (intentionally, to recover from a
  // partial import that hit Vercel's 300s timeout, or by mistake),
  // we skip rows that already exist in 35_payments.
  //
  // Match key: payment_date + amount_cents + counterparty.
  // This handles same-day same-amount duplicates (e.g. two ASANA
  // subscription charges on the same day for different products)
  // since the counterparty descriptor differs slightly enough
  // to avoid false-positive dedupe. If the bank ever issues two
  // truly identical transactions on the same date, the second
  // would be skipped — acceptable tradeoff for getting safe
  // re-import behaviour.
  const existingPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;
  const existingKeys = new Set(
    existingPayments.map(
      (r) =>
        `${r.payment_date ?? ""}|${r.amount_cents ?? ""}|${(r.counterparty as string ?? "").trim().toLowerCase()}`
    )
  );

  const persistedTxs: BankTransaction[] = [];
  let skippedDuplicates = 0;
  for (const tx of transactions) {
    try {
      const amountCents = Math.round(tx.amount * 100);
      const direction = amountCents >= 0 ? "incoming" : "outgoing";

      // Skip duplicates
      const key = `${tx.date ?? tx.rawDate}|${amountCents}|${tx.counterparty.trim().toLowerCase()}`;
      if (existingKeys.has(key)) {
        skippedDuplicates++;
        continue;
      }

      // Extract bank-supplied transaction type code. FIDAVISTA
      // saves it as raw.TypeCode (e.g. 'PMNTCCRDOTHR-Pirkums'
      // for online card purchase). This is THE field the
      // payment-classifier needs to bucket transactions into
      // automatiskie/fiziskie/izejosie. Without it, the classifier
      // falls back to counterparty-name pattern matching which
      // is much less accurate.
      const txType = tx.raw?.TypeCode ?? "";

      // Run the classifier ONCE during import so the stored
      // classified_section is correct from the start. Tabs still
      // re-classify client-side for safety, but having a sensible
      // initial value means even old payments get bucketed
      // properly the first time the user views them.
      const initialSection = classifyTransaction({
        rawDate: tx.rawDate ?? tx.date ?? "",
        date: tx.date ?? tx.rawDate ?? "",
        counterparty: tx.counterparty,
        counterpartyIban: tx.counterpartyIban,
        amount: tx.amount,
        reference: tx.reference,
        currency: tx.currency,
        raw: { TypeCode: txType },
      });

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
        // Initial bucket from classifier — overridden later if
        // we match an invoice (Step 5/6) or auto-classify
        // against known clients/suppliers (Step 7).
        classified_section: initialSection,
        matched_invoice_id: "",
        // CRITICAL: saglabājam īsto TypeCode (NEVIS payment
        // description). Klients-puse re-classify uz šī lauka.
        // Iepriekš te bija saglabāta tx.reference (tā pati kā
        // bank_reference) — tas izraisīja, ka kartes maksājumi
        // visi tika klasificēti kā 'izejosie' jo TypeCode
        // pattern matching neatrada `PMNTCCRDOTHR` u.tml.
        raw_reference: txType || tx.reference,
      });
      const id = (row as unknown as Record<string, unknown>).id as string;
      // Add the new key to the seen set so a same-batch duplicate
      // (rare but possible if file has same tx twice) doesn't
      // double-insert
      existingKeys.add(key);
      persistedTxs.push({
        paymentId: id,
        date: tx.date ?? tx.rawDate,
        counterparty: tx.counterparty,
        counterpartyIban: tx.counterpartyIban,
        amountCents,
        reference: tx.reference,
        currency: tx.currency,
        txType,
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

  // ───── Step 7: classify orphan transactions ─────
  //
  // Orphans are bank transactions where money moved but no
  // matching invoice existed in 30_invoices_out / 31_invoices_in.
  //
  // Sesija 5 enhancement: BEFORE marking as
  // 'maksajums_bez_rekina' (which puts them in the red banner
  // for manual upload), we run each through the classifier:
  //
  //   1. Tier 1 — IBAN match against known clients/suppliers
  //   2. Tier 2 — Reg/VAT number in bank reference
  //   3. Tier 3 — AI fuzzy match on counterparty name
  //
  // When the classifier returns a HIGH or MEDIUM confidence
  // match, we automatically:
  //   - Create a placeholder invoice row in 30_invoices_out
  //     (for incoming/clients) or 31_invoices_in (for outgoing/
  //     suppliers) with status='gaida_apmaksu' (mark not paid
  //     yet — the user will edit + finalize amounts when the
  //     real invoice arrives via email or upload)
  //   - Link the 35_payments row to it via matched_invoice_id
  //   - Set the invoice's payment_status='apmaksats' since the
  //     bank already confirmed the money moved
  //
  // When the classifier returns 'unknown' (no confident match),
  // we fall back to the original behaviour: tag the transaction
  // as 'maksajums_bez_rekina' so it appears in the red banner.
  //
  // The user can still manually upload an invoice to override
  // any auto-classification — or delete the auto-created
  // placeholder if it was wrong.

  // Load known clients + suppliers + partners + employees ONCE
  // for all classifications. The classifier accepts all four
  // lists; loading them all up-front avoids per-orphan Sheets reads.
  let knownClients: KnownClient[] = [];
  let knownSuppliers: KnownSupplier[] = [];
  let knownPartners: KnownPartner[] = [];
  let knownEmployees: KnownEmployee[] = [];
  try {
    const clientsRaw = (await sheets.list("10_clients")) as Array<
      Record<string, unknown>
    >;
    knownClients = clientsRaw
      .filter((r) => r.name)
      .map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        regNumber: String(r.reg_number ?? ""),
        vatNumber: String(r.vat_number ?? ""),
        iban: String(r.iban ?? ""),
      }));
    const suppliersRaw = (await sheets.list("12_suppliers")) as Array<
      Record<string, unknown>
    >;
    knownSuppliers = suppliersRaw
      .filter((r) => r.name)
      .map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        regNumber: String(r.reg_number ?? ""),
        vatNumber: String(r.vat_number ?? ""),
        iban: String(r.iban ?? ""),
        defaultExplanation: r.default_explanation
          ? String(r.default_explanation)
          : undefined,
        typicalAccountCode: r.typical_account_code
          ? String(r.typical_account_code)
          : undefined,
      }));

    // Partners — Sesija 6. Only those with IBAN saved are useful
    // for IBAN-tier matching; rows without IBAN can still be
    // matched by reg_number through tier 2.
    const partnersRaw = (await sheets.list("15_partners")) as Array<
      Record<string, unknown>
    >;
    knownPartners = partnersRaw
      .filter((r) => r.name)
      .map((r) => {
        const rawKind = String(r.partner_kind ?? "").toLowerCase();
        const kind: "partner" | "agent" =
          rawKind === "agent" ? "agent" : "partner";
        return {
          id: String(r.id ?? ""),
          name: String(r.name ?? ""),
          regNumber: String(r.reg_number ?? ""),
          iban: String(r.iban ?? ""),
          kind,
        };
      });

    // Employees — same idea. Salary payments are usually IBAN-
    // matched. We compose fullName from first_name + last_name
    // for AI prompts (we don't pass employees to AI, but kept
    // for symmetry / future use).
    const employeesRaw = (await sheets.list("20_employees")) as Array<
      Record<string, unknown>
    >;
    knownEmployees = employeesRaw
      .filter((r) => r.first_name || r.last_name)
      .map((r) => ({
        id: String(r.id ?? ""),
        fullName: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
        iban: String(r.iban ?? ""),
        personalCode: String(r.personal_code ?? ""),
      }));

    console.log(
      `[bank-import] classifier inputs: ${knownClients.length} clients, ${knownSuppliers.length} suppliers, ${knownPartners.length} partners, ${knownEmployees.length} employees`
    );
  } catch (err) {
    console.warn(
      "[bank-import] failed to load classifier inputs — orphans will all stay unclassified:",
      err
    );
  }

  // AI is optional — if we can't reach Anthropic, we still do
  // tier 1+2 deterministic matching, just lose tier 3 fuzzy.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey }) : undefined;
  if (!anthropic) {
    console.warn(
      "[bank-import] ANTHROPIC_API_KEY missing — fuzzy name matching disabled, only IBAN/reg deterministic match will run"
    );
  }

  let autoClassifiedCount = 0;

  for (const orphan of result.orphans) {
    if (!orphan.transaction.paymentId) continue;
    const expectedUpdatedAt =
      updatedAtBy.get(`35/${orphan.transaction.paymentId}`) ?? "";

    // Try to classify. If known counterparty → create invoice +
    // link; if unknown → tag as maksajums_bez_rekina (orphan UI).
    let classification;
    try {
      classification = await classifyOrphanTransaction({
        transaction: orphan.transaction,
        knownClients,
        knownSuppliers,
        knownPartners,
        knownEmployees,
        anthropic,
      });
    } catch (err) {
      console.warn(
        `Classification failed for ${orphan.transaction.paymentId}:`,
        err
      );
      classification = { kind: "unknown" as const };
    }

    if (classification.kind === "unknown") {
      // Tag as orphan — same as old Step 7 behaviour
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
      continue;
    }

    // Auto-classify: create a placeholder invoice row + link
    // the payment to it. The placeholder is intentionally
    // sparse — amount + counterparty + date are correct (from
    // bank), but invoice number / description / due date stay
    // empty so the user can edit them later when the real
    // invoice arrives.
    try {
      const tx = orphan.transaction;
      const absAmountCents = Math.abs(tx.amountCents);

      if (classification.kind === "client") {
        // Incoming payment → we issued an invoice to this client.
        // Auto-create a placeholder invoice + link the payment.
        const created = await sheets.create("30_invoices_out", {
          number: "(automātiski izveidots)",
          client: classification.entity.name,
          description: `Automātiski izveidots no bankas: ${tx.reference || tx.counterparty}`,
          amount_cents: String(absAmountCents),
          vat_cents: "0",
          issue_date: tx.date,
          due_date: tx.date,
          status: "apmaksats",
          delivery_note: "",
          pn_akts: "",
          pn_akts_source: "",
          pn_akts_file_name: "",
          file_drive_id: "",
          pn_akts_drive_id: "",
          delivery_note_drive_id: "",
          payment_status: "apmaksats",
          payment_id: tx.paymentId ?? "",
        });
        const createdInvoiceId = (
          created as unknown as Record<string, unknown>
        ).id as string;

        await sheets.update(
          "35_payments",
          orphan.transaction.paymentId,
          {
            matched_invoice_id: createdInvoiceId,
            classified_section: "invoice_out",
            payment_status: "",
            expected_updated_at: expectedUpdatedAt,
          }
        );
        autoClassifiedCount++;
        console.log(
          `[bank-import] auto-classified ${orphan.transaction.paymentId} → 30_invoices_out/${createdInvoiceId} (client ${classification.entity.name}, ${classification.confidence})`
        );
      } else if (classification.kind === "supplier") {
        // Outgoing payment → supplier sent us an invoice we paid
        const created = await sheets.create("31_invoices_in", {
          supplier: classification.entity.name,
          invoice_number: "(automātiski izveidots)",
          description: `Automātiski izveidots no bankas: ${tx.reference || tx.counterparty}`,
          amount_cents: String(absAmountCents),
          iban: classification.entity.iban || "",
          due_date: tx.date,
          status: "apmaksats",
          file_name: "",
          pn_akts: "",
          pn_akts_source: "",
          pn_akts_file_name: "",
          accounting_category: "",
          depreciation_period: "",
          accounting_explanation:
            classification.entity.defaultExplanation || "",
          accounting_updated_at: "",
          source_channel: "auto_bank",
          payment_evidence: "",
          file_drive_id: "",
          pn_akts_drive_id: "",
          payment_status: "apmaksats",
          payment_id: tx.paymentId ?? "",
        });
        const createdInvoiceId = (
          created as unknown as Record<string, unknown>
        ).id as string;

        await sheets.update(
          "35_payments",
          orphan.transaction.paymentId,
          {
            matched_invoice_id: createdInvoiceId,
            classified_section: "invoice_in",
            payment_status: "",
            expected_updated_at: expectedUpdatedAt,
          }
        );
        autoClassifiedCount++;
        console.log(
          `[bank-import] auto-classified ${orphan.transaction.paymentId} → 31_invoices_in/${createdInvoiceId} (supplier ${classification.entity.name}, ${classification.confidence})`
        );
      } else if (classification.kind === "partner") {
        // Sesija 6 — partner / agent payment.
        //
        // We do NOT create an invoice row here — partners don't
        // typically have invoices (commission-based or contract-
        // based payouts). Instead we tag the 35_payments row
        // directly with partner_id + payment_category. The UI
        // will render these as 'Komisija' or 'Partneru maksājums'
        // sections, separate from the invoice flow.
        const category =
          classification.entity.kind === "agent"
            ? "commission"
            : "partner_payment";
        await sheets.update(
          "35_payments",
          orphan.transaction.paymentId,
          {
            partner_id: classification.entity.id,
            payment_category: category,
            classified_section: "partner",
            payment_status: "",
            expected_updated_at: expectedUpdatedAt,
          }
        );
        autoClassifiedCount++;
        console.log(
          `[bank-import] auto-classified ${orphan.transaction.paymentId} → partner ${classification.entity.name} (${category}, ${classification.confidence})`
        );
      } else if (classification.kind === "employee") {
        // Sesija 6 — salary payment to an employee.
        //
        // Same as partner: no invoice row. We tag with
        // employee_id + payment_category='salary'. The bookkeeper
        // export aggregates these per employee per period for
        // the monthly salary report.
        await sheets.update(
          "35_payments",
          orphan.transaction.paymentId,
          {
            employee_id: classification.entity.id,
            payment_category: "salary",
            // UI tab key is 'algas' (Latvian) — store this same
            // value in classified_section so the algas-tab can
            // filter by it. payment_category stays 'salary' as
            // the bookkeeper-facing label.
            classified_section: "algas",
            payment_status: "",
            expected_updated_at: expectedUpdatedAt,
          }
        );
        autoClassifiedCount++;
        console.log(
          `[bank-import] auto-classified ${orphan.transaction.paymentId} → employee ${classification.entity.fullName} (salary, ${classification.confidence})`
        );
      }
    } catch (err) {
      console.warn(
        `Failed to auto-classify ${orphan.transaction.paymentId}:`,
        err
      );
      // Fallback: tag as orphan so user can deal with it manually
      try {
        await sheets.update(
          "35_payments",
          orphan.transaction.paymentId,
          {
            payment_status: "maksajums_bez_rekina",
            expected_updated_at: expectedUpdatedAt,
          }
        );
      } catch {
        // Ignore — already logged above
      }
    }
  }

  return NextResponse.json({
    ok: true,
    parsed: {
      transactionCount: persistedTxs.length,
      skippedDuplicates,
      format,
      period: { from: periodFrom, to: periodTo },
    },
    reconciled: {
      ...result.summary,
      autoClassified: autoClassifiedCount,
    },
  });
}
