/**
 * Salaries — CRUD on 36_salaries tab.
 */

import { makeListCreateHandlers } from "@/lib/store-routes";

export const maxDuration = 30;

interface SalaryRow extends Record<string, string> {
  employee_id: string;
  employee_name: string;
  amount_cents: string;
  period: string;
  type: string;
  status: string;
  paid_at: string;
}

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

function parseCreateBody(body: unknown): SalaryRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.employee !== "string" || !b.employee) return null;

  return {
    employee_id: typeof b.employee_id === "string" ? b.employee_id : "",
    employee_name: b.employee as string,
    amount_cents: String(
      typeof b.amount === "number" ? Math.round(b.amount * 100) : 0
    ),
    period: typeof b.period === "string" ? b.period : "",
    type: typeof b.type === "string" ? b.type : "darba_alga",
    status: typeof b.status === "string" ? b.status : "sagatavots",
    paid_at: typeof b.paid_at === "string" ? b.paid_at : "",
  };
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

export const { GET, POST } = makeListCreateHandlers<SalaryRow, ApiSalary>({
  tab: "36_salaries",
  responseKey: "salaries",
  singularKey: "salary",
  parseCreateBody,
  rowToApi,
});
