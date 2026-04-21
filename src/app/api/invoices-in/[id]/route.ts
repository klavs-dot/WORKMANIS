/**
 * Invoices-in — PATCH and DELETE on 31_invoices_in/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiInvoiceIn {
  id: string;
  supplier: string;
  invoiceNumber: string;
  description: string | undefined;
  amount: number;
  iban: string;
  dueDate: string;
  status: string;
  fileName: string | undefined;
  pnAkts: string | undefined;
  pnAktsSource: string | undefined;
  pnAktsFileName: string | undefined;
  accountingMeta:
    | {
        category: string;
        depreciationPeriod: number | undefined;
        explanation: string;
        updatedAt: string;
      }
    | undefined;
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

  const stringFields = [
    "supplier",
    "invoice_number",
    "description",
    "iban",
    "due_date",
    "status",
    "file_name",
    "pn_akts",
    "pn_akts_source",
    "pn_akts_file_name",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  if (typeof b.amount === "number") {
    patch.amount_cents = String(Math.round(b.amount * 100));
  } else if (typeof b.amount_cents === "string") {
    patch.amount_cents = b.amount_cents;
  }

  // Handle accounting metadata — nested object or clear
  if (b.accounting_meta === null) {
    // Explicit clear
    patch.accounting_category = "";
    patch.depreciation_period = "";
    patch.accounting_explanation = "";
    patch.accounting_updated_at = "";
  } else if (b.accounting_meta && typeof b.accounting_meta === "object") {
    const meta = b.accounting_meta as Record<string, unknown>;
    if (typeof meta.category === "string") {
      patch.accounting_category = meta.category;
    }
    if (typeof meta.depreciationPeriod === "number") {
      patch.depreciation_period = String(meta.depreciationPeriod);
    }
    if (typeof meta.explanation === "string") {
      patch.accounting_explanation = meta.explanation;
    }
    if (typeof meta.updatedAt === "string") {
      patch.accounting_updated_at = meta.updatedAt;
    }
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiInvoiceIn {
  const amountCents = parseInt((row.amount_cents as string) || "0", 10);
  const category = (row.accounting_category as string) || "";
  const depPeriodStr = (row.depreciation_period as string) || "";
  const depPeriod = depPeriodStr ? parseInt(depPeriodStr, 10) : NaN;

  return {
    id: row.id as string,
    supplier: (row.supplier as string) ?? "",
    invoiceNumber: (row.invoice_number as string) ?? "",
    description:
      ((row.description as string) || undefined) as string | undefined,
    amount: isNaN(amountCents) ? 0 : amountCents / 100,
    iban: (row.iban as string) ?? "",
    dueDate: (row.due_date as string) ?? "",
    status: (row.status as string) ?? "apstiprinat_banka",
    fileName:
      ((row.file_name as string) || undefined) as string | undefined,
    pnAkts: ((row.pn_akts as string) || undefined) as string | undefined,
    pnAktsSource:
      ((row.pn_akts_source as string) || undefined) as string | undefined,
    pnAktsFileName:
      ((row.pn_akts_file_name as string) || undefined) as
        | string
        | undefined,
    accountingMeta: category
      ? {
          category,
          depreciationPeriod: isNaN(depPeriod) ? undefined : depPeriod,
          explanation: (row.accounting_explanation as string) ?? "",
          updatedAt: (row.accounting_updated_at as string) ?? "",
        }
      : undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiInvoiceIn>({
  tab: "31_invoices_in",
  singularKey: "invoice",
  entityName: "Invoice",
  parseUpdateBody,
  rowToApi,
});
