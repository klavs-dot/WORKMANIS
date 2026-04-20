/**
 * Assets CRUD — POST/GET/PATCH/DELETE on 40_assets tab.
 *
 * Auth + tenancy:
 *   Every request reads session via auth(), resolves the given
 *   company_id via resolveCompany() (which walks the user's
 *   account-master registry), and only then opens a SheetsClient
 *   for that company. A forged company_id returns 404.
 *
 * Request shapes:
 *
 *   GET  /api/assets?company_id=cmp-190426-1
 *     → { assets: Asset[] }
 *
 *   POST /api/assets?company_id=...
 *     body: { category, name, comment, status, note, note_color,
 *             reminder_date? }
 *     → { asset: Asset }
 *
 *   PATCH /api/assets/:id?company_id=...
 *     body: { patch + expected_updated_at }
 *     → { asset: Asset }
 *
 *   DELETE /api/assets/:id?company_id=...&expected_updated_at=...
 *     → { ok: true }
 *
 * IDs follow the {prefix}-{DDMMYY}-{N} format established in
 * sheets-client.ts. Asset IDs are prefixed 'ass'.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient, OptimisticLockError } from "@/lib/sheets-client";

export const maxDuration = 30;

// ============================================================
// GET — list
// ============================================================

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    const rows = await client.list("40_assets");
    return NextResponse.json({
      assets: rows.map((r) =>
        rowToAsset(r as unknown as Record<string, unknown>)
      ),
    });
  } catch (err) {
    console.error("List assets failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ============================================================
// POST — create
// ============================================================

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = validateCreateBody(body);
  if (!data) {
    return NextResponse.json(
      { error: "Invalid asset data. Required: category, name, status" },
      { status: 400 }
    );
  }

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    const row = await client.create("40_assets", data);
    return NextResponse.json({
      asset: rowToAsset(row as unknown as Record<string, unknown>),
    });
  } catch (err) {
    console.error("Create asset failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ============================================================
// Validation and mapping
// ============================================================

interface AssetCreateInput {
  category: string;
  name: string;
  comment: string;
  status: string;
  note: string;
  note_color: string;
  reminder_date: string;
  folder_drive_id: string;
  acquired_date: string;
  acquired_cost_cents: string;
}

function validateCreateBody(body: unknown): AssetCreateInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.category !== "string" || !b.category) return null;
  if (typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.status !== "string" || !b.status) return null;

  return {
    category: b.category,
    name: (b.name as string).trim(),
    comment: typeof b.comment === "string" ? b.comment : "",
    status: b.status,
    note: typeof b.note === "string" ? b.note : "",
    note_color: typeof b.note_color === "string" ? b.note_color : "pelēka",
    reminder_date:
      typeof b.reminder_date === "string" ? b.reminder_date : "",
    folder_drive_id: "",
    acquired_date:
      typeof b.acquired_date === "string" ? b.acquired_date : "",
    acquired_cost_cents:
      typeof b.acquired_cost_cents === "number"
        ? String(b.acquired_cost_cents)
        : typeof b.acquired_cost_cents === "string"
          ? b.acquired_cost_cents
          : "",
  };
}

/**
 * Convert a Sheets row into the client-facing Asset shape.
 * Mirrors how the AssetProvider exposes data to components.
 */
function rowToAsset(row: Record<string, unknown>): {
  id: string;
  category: string;
  name: string;
  comment: string;
  status: string;
  note: string;
  noteColor: string;
  reminderDate: string | undefined;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id as string,
    category: (row.category as string) ?? "citi",
    name: (row.name as string) ?? "",
    comment: (row.comment as string) ?? "",
    status: (row.status as string) ?? "aktivs",
    note: (row.note as string) ?? "",
    noteColor: (row.note_color as string) ?? "pelēka",
    reminderDate: (row.reminder_date as string) || undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}
