import * as bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { makeWarehouseUpdateDeleteHandlers } from "@/lib/warehouse-routes";

export const maxDuration = 30;

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

interface ApiEmployee {
  id: string;
  email: string;
  role: string;
  active: boolean;
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

  if (typeof b.email === "string") patch.email = b.email.trim().toLowerCase();
  if (typeof b.password === "string" && b.password.trim()) {
    // Hash before persisting; we never store plaintext (see comment
    // in parent route's file header).
    patch.password = bcrypt.hashSync(b.password, 10);
  }
  if (typeof b.role === "string") patch.role = b.role;
  // Booleans encode as "TRUE"/"FALSE" to match the rest of the schema.
  if (typeof b.active === "boolean") patch.active = b.active ? "TRUE" : "FALSE";

  return patch;
}

function rowToApi(row: Record<string, unknown>): ApiEmployee {
  const activeRaw = String(row.active ?? "").toLowerCase();
  return {
    id: row.id as string,
    email: (row.email as string) ?? "",
    role: (row.role as string) ?? "Noliktavas atbildīgais",
    active:
      activeRaw === "true" || activeRaw === "1" || activeRaw === "yes",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

const handlers = makeWarehouseUpdateDeleteHandlers<ApiEmployee>({
  tab: "04_warehouse_employees",
  parseUpdateBody,
  rowToApi,
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbidden = await requireOwner();
  if (forbidden) return forbidden;
  return handlers.PATCH(request, ctx);
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbidden = await requireOwner();
  if (forbidden) return forbidden;
  return handlers.DELETE(request, ctx);
}
