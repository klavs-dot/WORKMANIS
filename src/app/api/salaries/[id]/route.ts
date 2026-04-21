/**
 * Salaries — PATCH and DELETE on 36_salaries/{id}
 *
 * Note: client store auto-stamps paidAt when status flips to
 * 'izmaksats'. Server accepts paid_at as explicit field; client
 * is responsible for sending the timestamp.
 */

import { makeUpdateDeleteHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface ApiSalary {
  id: string;
  employeeId: string | undefined;
  employee: string;
  amount: number;
  period: string;
  type: string;
  status: string;
  paidAt: string | undefined;
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
    "employee_id",
    "period",
    "type",
    "status",
    "paid_at",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  // Client might send 'employee' (display name)
  if (typeof b.employee === "string") patch.employee_name = b.employee;

  if (typeof b.amount === "number") {
    patch.amount_cents = String(Math.round(b.amount * 100));
  } else if (typeof b.amount_cents === "string") {
    patch.amount_cents = b.amount_cents;
  }

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiSalary {
  const amountCents = parseInt((row.amount_cents as string) || "0", 10);
  return {
    id: row.id as string,
    employeeId:
      ((row.employee_id as string) || undefined) as string | undefined,
    employee: (row.employee_name as string) ?? "",
    amount: isNaN(amountCents) ? 0 : amountCents / 100,
    period: (row.period as string) ?? "",
    type: (row.type as string) ?? "darba_alga",
    status: (row.status as string) ?? "sagatavots",
    paidAt: ((row.paid_at as string) || undefined) as string | undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { PATCH, DELETE } = makeUpdateDeleteHandlers<ApiSalary>({
  tab: "36_salaries",
  singularKey: "salary",
  entityName: "Salary",
  parseUpdateBody,
  rowToApi,
});
