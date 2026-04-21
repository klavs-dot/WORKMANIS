/**
 * Taxes — PATCH and DELETE on 37_taxes/{id}
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiTax {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
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

  if (typeof b.name === "string") patch.name = b.name;
  if (typeof b.due_date === "string") patch.due_date = b.due_date;
  if (typeof b.status === "string") patch.status = b.status;
  if (typeof b.amount === "number") {
    patch.amount_cents = String(Math.round(b.amount * 100));
  } else if (typeof b.amount_cents === "string") {
    patch.amount_cents = b.amount_cents;
  }

  return patch;
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

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiTax>({
  tab: "37_taxes",
  singularKey: "tax",
  entityName: "Tax",
  parseUpdateBody,
  rowToApi,
});
