/**
 * Warehouse employees — CRUD on 04_warehouse_employees tab.
 *
 * Stores credentials for warehouse_manager external users. The login
 * flow itself is wired through /api/auth (Credentials provider) and
 * src/lib/external-users-login.ts.
 *
 * Passwords are hashed with bcryptjs (cost 10) before persisting; the
 * plaintext password is never stored or returned. The API response
 * intentionally omits the password column so an authenticated owner
 * can't accidentally surface other employees' credentials in the
 * admin UI.
 *
 * Existing rows that pre-date this hashing migration will fail
 * bcrypt.compare() on login — the owner must re-issue passwords for
 * those employees via PATCH.
 */

import * as bcrypt from "bcryptjs";
import { makeWarehouseListCreateHandlers } from "@/lib/warehouse-routes";

export const maxDuration = 30;

interface EmployeeRow extends Record<string, string> {
  email: string;
  /** Stored value is a bcrypt hash, not plaintext. */
  password: string;
  role: string;
  active: string;
}

export interface ApiEmployee {
  id: string;
  email: string;
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
    password: bcrypt.hashSync(b.password as string, 10),
    role: typeof b.role === "string" ? b.role : "Noliktavas atbildīgais",
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
    role: (row.role as string) ?? "Noliktavas atbildīgais",
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
