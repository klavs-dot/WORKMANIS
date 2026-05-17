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
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { makeWarehouseListCreateHandlers } from "@/lib/warehouse-routes";

export const maxDuration = 30;

/**
 * Mutations on warehouse credentials require owner role — these rows
 * grant warehouse_manager login access to the entire noliktava sheet,
 * so an unprivileged user creating one would be a privilege
 * escalation. Reads are owner-only too (the list contains
 * credential hashes' metadata even though the hash itself is stripped
 * from the API response).
 */
async function requireOwner(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role && session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner may manage warehouse employees" },
      { status: 403 }
    );
  }
  return null;
}

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
    // Booleans encode as "TRUE"/"FALSE" to match the convention used
    // by 20_employees.ovp_passed/safety_passed and
    // 50_documents.signed/has_physical_signature. Reader still
    // accepts legacy "1"/"0" rows for backwards compatibility.
    active:
      typeof b.active === "boolean"
        ? b.active
          ? "TRUE"
          : "FALSE"
        : "TRUE",
  };
}

function rowToApi(row: Record<string, unknown>): ApiEmployee {
  const activeRaw = String(row.active ?? "").toLowerCase();
  return {
    id: row.id as string,
    email: (row.email as string) ?? "",
    role: (row.role as string) ?? "Noliktavas atbildīgais",
    // Accept both the new "TRUE"/"FALSE" convention and legacy
    // "1"/"true" values so old rows continue to deserialise.
    active:
      activeRaw === "true" || activeRaw === "1" || activeRaw === "yes",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

const handlers = makeWarehouseListCreateHandlers<EmployeeRow, ApiEmployee>({
  tab: "04_warehouse_employees",
  responseKey: "employees",
  parseCreateBody,
  rowToApi,
});

export async function GET() {
  const forbidden = await requireOwner();
  if (forbidden) return forbidden;
  return handlers.GET();
}

export async function POST(request: Request) {
  const forbidden = await requireOwner();
  if (forbidden) return forbidden;
  return handlers.POST(request);
}
