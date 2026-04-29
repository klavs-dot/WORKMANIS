/**
 * Bank-imported payments (transactions) — CRUD on 35_payments tab.
 *
 * Stores every transaction the user imports from a FIDAVISTA /
 * camt.053 / CSV bank statement. Used by the Visi maksājumi tab
 * and the four sub-tabs (Ienākošie, Izejošie, Automātiskie,
 * Fiziskie) to render bank-side data alongside the invoice-side
 * data they already have.
 *
 * The tab existed in the schema since the start but had no
 * endpoints — added now for the FIDAVISTA import flow.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface PaymentRow extends Record<string, string> {
  direction: string;
  category: string;
  invoice_out_id: string;
  invoice_in_id: string;
  salary_id: string;
  tax_id: string;
  counterparty: string;
  counterparty_iban: string;
  amount_cents: string;
  payment_date: string;
  bank_account_iban: string;
  bank_reference: string;
  source: string;
  imported_from_csv_filename: string;
  classified_section: string;
  matched_invoice_id: string;
  raw_reference: string;
}

interface ApiPayment {
  id: string;
  direction: string;
  category: string;
  invoiceOutId: string | undefined;
  invoiceInId: string | undefined;
  salaryId: string | undefined;
  taxId: string | undefined;
  counterparty: string;
  counterpartyIban: string | undefined;
  /** Amount in EUR (already divided by 100) */
  amount: number;
  paymentDate: string;
  bankAccountIban: string | undefined;
  bankReference: string | undefined;
  source: string;
  importedFromFilename: string | undefined;
  classifiedSection: string;
  matchedInvoiceId: string | undefined;
  rawReference: string;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): PaymentRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // counterparty + amount + payment_date are the minimum we need
  // to render a row meaningfully. Bank reference can be empty for
  // some POS transactions.
  if (typeof b.counterparty !== "string") return null;

  return {
    direction: typeof b.direction === "string" ? b.direction : "out",
    category: typeof b.category === "string" ? b.category : "",
    invoice_out_id:
      typeof b.invoice_out_id === "string" ? b.invoice_out_id : "",
    invoice_in_id:
      typeof b.invoice_in_id === "string" ? b.invoice_in_id : "",
    salary_id: typeof b.salary_id === "string" ? b.salary_id : "",
    tax_id: typeof b.tax_id === "string" ? b.tax_id : "",
    counterparty: b.counterparty,
    counterparty_iban:
      typeof b.counterparty_iban === "string" ? b.counterparty_iban : "",
    amount_cents: String(
      typeof b.amount === "number"
        ? Math.round(b.amount * 100)
        : typeof b.amount_cents === "string"
          ? parseInt(b.amount_cents, 10) || 0
          : 0
    ),
    payment_date: typeof b.payment_date === "string" ? b.payment_date : "",
    bank_account_iban:
      typeof b.bank_account_iban === "string" ? b.bank_account_iban : "",
    bank_reference:
      typeof b.bank_reference === "string" ? b.bank_reference : "",
    source: typeof b.source === "string" ? b.source : "bank_import",
    imported_from_csv_filename:
      typeof b.imported_from_csv_filename === "string"
        ? b.imported_from_csv_filename
        : "",
    classified_section:
      typeof b.classified_section === "string" ? b.classified_section : "",
    matched_invoice_id:
      typeof b.matched_invoice_id === "string" ? b.matched_invoice_id : "",
    raw_reference:
      typeof b.raw_reference === "string" ? b.raw_reference : "",
  };
}

function rowToApi(row: Record<string, unknown>): ApiPayment {
  const amountCents = parseInt((row.amount_cents as string) || "0", 10);
  return {
    id: row.id as string,
    direction: (row.direction as string) ?? "out",
    category: (row.category as string) ?? "",
    invoiceOutId:
      ((row.invoice_out_id as string) || undefined) as string | undefined,
    invoiceInId:
      ((row.invoice_in_id as string) || undefined) as string | undefined,
    salaryId:
      ((row.salary_id as string) || undefined) as string | undefined,
    taxId: ((row.tax_id as string) || undefined) as string | undefined,
    counterparty: (row.counterparty as string) ?? "",
    counterpartyIban:
      ((row.counterparty_iban as string) || undefined) as string | undefined,
    amount: isNaN(amountCents) ? 0 : amountCents / 100,
    paymentDate: (row.payment_date as string) ?? "",
    bankAccountIban:
      ((row.bank_account_iban as string) || undefined) as string | undefined,
    bankReference:
      ((row.bank_reference as string) || undefined) as string | undefined,
    source: (row.source as string) ?? "",
    importedFromFilename:
      ((row.imported_from_csv_filename as string) || undefined) as
        | string
        | undefined,
    classifiedSection: (row.classified_section as string) ?? "",
    matchedInvoiceId:
      ((row.matched_invoice_id as string) || undefined) as string | undefined,
    rawReference: (row.raw_reference as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { GET, POST } = makeListCreateHandlers<PaymentRow, ApiPayment>({
  tab: "35_payments",
  responseKey: "payments",
  singularKey: "payment",
  parseCreateBody,
  rowToApi,
});
