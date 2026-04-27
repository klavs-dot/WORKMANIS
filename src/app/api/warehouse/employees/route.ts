/**
 * Warehouse employees — CRUD on 04_warehouse_employees tab.
 *
 * NOTE: This stores credentials but does NOT yet wire up an
 * authentication flow for warehouse employees. Login + role-based
 * access control are deferred to a future commit. For now this is
 * a record-keeping list only.
 *
 * Password storage is plain text in the sheet (per user's MVP
 * acknowledgement). When auth is wired, swap the create/update
 * handlers to bcrypt the password before storing.
 */

import { makeWarehouseListCreateHandlers } from "@/lib/warehouse-routes";

export const maxDuration = 30;

interface EmployeeRow extends Record<string, string> {
  email: string;
  password: string;
  role: string;
  active: string;
}

export interface ApiEmployee {
  id: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function parseCreateBody(body: unknown): EmployeeRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.email !== "string" || !b.email.trim()) return null;
  if (typeof b.password !== "string" || !b.password.trim()) return null;
  return {
    email: (b.email as string).trim().toLowerCase(),
    password: b.password as string,
    role: typeof b.role === "string" ? b.role : "Noliktavas darbinieks",
    active:
      typeof b.active === "boolean"
        ? b.active
          ? "1"
          : "0"
        : "1",
  };
}

function rowToApi(row: Record<string, unknown>): ApiEmployee {
  return {
    id: row.id as string,
    email: (row.email as string) ?? "",
    password: (row.password as string) ?? "",
    role: (row.role as string) ?? "Noliktavas darbinieks",
    active: row.active === "1" || row.active === "true",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

export const { GET, POST } = makeWarehouseListCreateHandlers<
  EmployeeRow,
  ApiEmployee
>({
  tab: "04_warehouse_employees",
  responseKey: "employees",
  parseCreateBody,
  rowToApi,
});
