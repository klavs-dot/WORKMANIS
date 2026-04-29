import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

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

function parseUpdateBody(
  body: unknown
): (Record<string, string> & { expected_updated_at: string }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.expected_updated_at !== "string" || !b.expected_updated_at) {
    return null;
  }

  const patch: Record<string, string> & { expected_updated_at: string } = {
    expected_updated_at: b.expected_updated_at,
  };

  // Most fields are write-once at import time. The interesting
  // updates are matched_invoice_id (when user attaches a receipt
  // after the fact) and category (manual reclassification).
  const stringFields = [
    "direction",
    "category",
    "invoice_out_id",
    "invoice_in_id",
    "salary_id",
    "tax_id",
    "counterparty",
    "counterparty_iban",
    "payment_date",
    "bank_account_iban",
    "bank_reference",
    "source",
    "classified_section",
    "matched_invoice_id",
    "raw_reference",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  if (typeof b.amount === "number") {
    patch.amount_cents = String(Math.round(b.amount * 100));
  }

  return patch;
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

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiPayment>({
  tab: "35_payments",
  singularKey: "payment",
  entityName: "Payment",
  parseUpdateBody,
  rowToApi,
});
