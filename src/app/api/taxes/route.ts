/**
 * Taxes — CRUD on 37_taxes tab.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface TaxRow extends Record<string, string> {
  name: string;
  amount_cents: string;
  due_date: string;
  status: string;
}

interface ApiTax {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): TaxRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name) return null;

  return {
    name: b.name,
    amount_cents: String(
      typeof b.amount === "number" ? Math.round(b.amount * 100) : 0
    ),
    due_date: typeof b.due_date === "string" ? b.due_date : "",
    status: typeof b.status === "string" ? b.status : "sagatavots",
  };
}

function rowToApi(row: Record<string, unknown>): ApiTax {
  const amountCents = parseInt((row.amount_cents as string) || "0", 10);
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    amount: isNaN(amountCents) ? 0 : amountCents / 100,
    dueDate: (row.due_date as string) ?? "",
    status: (row.status as string) ?? "sagatavots",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { GET, POST } = makeListCreateHandlers<TaxRow, ApiTax>({
  tab: "37_taxes",
  responseKey: "taxes",
  singularKey: "tax",
  parseCreateBody,
  rowToApi,
});
