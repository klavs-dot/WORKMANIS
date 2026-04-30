/**
 * Invoices-in — CRUD on 31_invoices_in tab.
 *
 * These are invoices you RECEIVE from suppliers (money going out).
 * Maps to billing-store's 'received' entity (ReceivedInvoice).
 *
 * Optional accounting metadata (category, depreciation period,
 * explanation) is flattened onto the row rather than a separate
 * 38_accounting_meta table.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface InvoiceInRow extends Record<string, string> {
  supplier: string;
  invoice_number: string;
  description: string;
  amount_cents: string;
  iban: string;
  due_date: string;
  status: string;
  file_name: string;
  pn_akts: string;
  pn_akts_source: string;
  pn_akts_file_name: string;
  accounting_category: string;
  depreciation_period: string;
  accounting_explanation: string;
  accounting_updated_at: string;
  source_channel: string;
  payment_evidence: string;
  file_drive_id: string;
  pn_akts_drive_id: string;
}

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
  sourceChannel: string | undefined;
  paymentEvidence: string | undefined;
  fileDriveId: string | undefined;
  pnAktsDriveId: string | undefined;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): InvoiceInRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.supplier !== "string" || !b.supplier) return null;

  const meta = (b.accounting_meta as Record<string, unknown>) ?? {};

  return {
    supplier: b.supplier,
    invoice_number:
      typeof b.invoice_number === "string" ? b.invoice_number : "",
    description: typeof b.description === "string" ? b.description : "",
    amount_cents: String(
      typeof b.amount === "number" ? Math.round(b.amount * 100) : 0
    ),
    iban: typeof b.iban === "string" ? b.iban : "",
    due_date: typeof b.due_date === "string" ? b.due_date : "",
    status:
      typeof b.status === "string" ? b.status : "apstiprinat_banka",
    file_name: typeof b.file_name === "string" ? b.file_name : "",
    pn_akts: typeof b.pn_akts === "string" ? b.pn_akts : "",
    pn_akts_source:
      typeof b.pn_akts_source === "string" ? b.pn_akts_source : "",
    pn_akts_file_name:
      typeof b.pn_akts_file_name === "string" ? b.pn_akts_file_name : "",
    accounting_category:
      typeof meta.category === "string" ? meta.category : "",
    depreciation_period:
      typeof meta.depreciationPeriod === "number"
        ? String(meta.depreciationPeriod)
        : "",
    accounting_explanation:
      typeof meta.explanation === "string" ? meta.explanation : "",
    accounting_updated_at:
      typeof meta.updatedAt === "string" ? meta.updatedAt : "",
    source_channel:
      typeof b.source_channel === "string" ? b.source_channel : "manual",
    payment_evidence:
      typeof b.payment_evidence === "string" ? b.payment_evidence : "",
    file_drive_id:
      typeof b.file_drive_id === "string" ? b.file_drive_id : "",
    pn_akts_drive_id:
      typeof b.pn_akts_drive_id === "string" ? b.pn_akts_drive_id : "",
  };
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
    sourceChannel:
      ((row.source_channel as string) || undefined) as string | undefined,
    paymentEvidence:
      ((row.payment_evidence as string) || undefined) as string | undefined,
    fileDriveId:
      ((row.file_drive_id as string) || undefined) as string | undefined,
    pnAktsDriveId:
      ((row.pn_akts_drive_id as string) || undefined) as string | undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { GET, POST } = makeListCreateHandlers<
  InvoiceInRow,
  ApiInvoiceIn
>({
  tab: "31_invoices_in",
  responseKey: "invoices",
  singularKey: "invoice",
  parseCreateBody,
  rowToApi,
});
