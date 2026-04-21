/**
 * Invoices-out — PATCH and DELETE on 30_invoices_out/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiInvoiceOut {
  id: string;
  number: string;
  client: string;
  description: string;
  amount: number;
  vat: number;
  date: string;
  dueDate: string;
  status: string;
  deliveryNote: string | undefined;
  pnAkts: string | undefined;
  pnAktsSource: string | undefined;
  pnAktsFileName: string | undefined;
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

  // Scalar strings
  const stringFields = [
    "number",
    "client",
    "description",
    "status",
    "delivery_note",
    "pn_akts",
    "pn_akts_source",
    "pn_akts_file_name",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  // Date fields — client may send 'date' for issue_date
  if (typeof b.date === "string") patch.issue_date = b.date;
  if (typeof b.issue_date === "string") patch.issue_date = b.issue_date;
  if (typeof b.due_date === "string") patch.due_date = b.due_date;

  // Numeric amount/vat — convert to cents if float provided
  if (typeof b.amount === "number") {
    patch.amount_cents = String(Math.round(b.amount * 100));
  } else if (typeof b.amount_cents === "string") {
    patch.amount_cents = b.amount_cents;
  }
  if (typeof b.vat === "number") {
    patch.vat_cents = String(Math.round(b.vat * 100));
  } else if (typeof b.vat_cents === "string") {
    patch.vat_cents = b.vat_cents;
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiInvoiceOut {
  const amountCents = parseInt((row.amount_cents as string) || "0", 10);
  const vatCents = parseInt((row.vat_cents as string) || "0", 10);
  return {
    id: row.id as string,
    number: (row.number as string) ?? "",
    client: (row.client as string) ?? "",
    description: (row.description as string) ?? "",
    amount: isNaN(amountCents) ? 0 : amountCents / 100,
    vat: isNaN(vatCents) ? 0 : vatCents / 100,
    date: (row.issue_date as string) ?? "",
    dueDate: (row.due_date as string) ?? "",
    status: (row.status as string) ?? "gaidam_apmaksu",
    deliveryNote:
      ((row.delivery_note as string) || undefined) as string | undefined,
    pnAkts: ((row.pn_akts as string) || undefined) as string | undefined,
    pnAktsSource:
      ((row.pn_akts_source as string) || undefined) as string | undefined,
    pnAktsFileName:
      ((row.pn_akts_file_name as string) || undefined) as
        | string
        | undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiInvoiceOut>({
  tab: "30_invoices_out",
  singularKey: "invoice",
  entityName: "Invoice",
  parseUpdateBody,
  rowToApi,
});
