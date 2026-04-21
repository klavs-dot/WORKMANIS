/**
 * Invoices-out — CRUD on 30_invoices_out tab.
 *
 * These are invoices YOU issue to YOUR clients (money coming in).
 * Maps to billing-store's `incoming` entity. Despite the
 * counter-intuitive naming in the store (incoming = money
 * incoming), the schema follows standard accounting convention
 * (invoices_out = issued, invoices_in = received).
 *
 * Amount stored in cents (integer) for precision.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface InvoiceOutRow extends Record<string, string> {
  number: string;
  client: string;
  description: string;
  amount_cents: string;
  vat_cents: string;
  issue_date: string;
  due_date: string;
  status: string;
  delivery_note: string;
  pn_akts: string;
  pn_akts_source: string;
  pn_akts_file_name: string;
}

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

function parseCreateBody(body: unknown): InvoiceOutRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.number !== "string" || !b.number) return null;
  if (typeof b.client !== "string" || !b.client) return null;

  return {
    number: b.number,
    client: b.client,
    description: typeof b.description === "string" ? b.description : "",
    amount_cents: String(
      typeof b.amount === "number" ? Math.round(b.amount * 100) : 0
    ),
    vat_cents: String(
      typeof b.vat === "number" ? Math.round(b.vat * 100) : 0
    ),
    issue_date: typeof b.date === "string" ? b.date : "",
    due_date: typeof b.due_date === "string" ? b.due_date : "",
    status: typeof b.status === "string" ? b.status : "gaidam_apmaksu",
    delivery_note:
      typeof b.delivery_note === "string" ? b.delivery_note : "",
    pn_akts: typeof b.pn_akts === "string" ? b.pn_akts : "",
    pn_akts_source:
      typeof b.pn_akts_source === "string" ? b.pn_akts_source : "",
    pn_akts_file_name:
      typeof b.pn_akts_file_name === "string" ? b.pn_akts_file_name : "",
  };
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

export const { GET, POST } = makeListCreateHandlers<
  InvoiceOutRow,
  ApiInvoiceOut
>({
  tab: "30_invoices_out",
  responseKey: "invoices",
  singularKey: "invoice",
  parseCreateBody,
  rowToApi,
});
