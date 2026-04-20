/**
 * PATCH /api/assets/{id}?company_id=...
 * DELETE /api/assets/{id}?company_id=...&expected_updated_at=...
 *
 * Both use optimistic locking — the request must include
 * expected_updated_at that matches the current updated_at in Sheets.
 * Otherwise we return 409 Conflict and the client should refresh.
 *
 * Next.js 15 params API: params is a Promise. Must be awaited.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import {
  createSheetsClient,
  OptimisticLockError,
  RowNotFoundError,
} from "@/lib/sheets-client";

export const maxDuration = 30;

// ============================================================
// PATCH — update
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const patch = validateUpdateBody(body);
  if (!patch) {
    return NextResponse.json(
      { error: "Missing expected_updated_at" },
      { status: 400 }
    );
  }

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    const row = await client.update("40_assets", id, patch);
    return NextResponse.json({
      asset: rowToAsset(row as unknown as Record<string, unknown>),
    });
  } catch (err) {
    if (err instanceof OptimisticLockError) {
      return NextResponse.json(
        {
          error: "Conflict: row was modified by another user",
          code: "OPTIMISTIC_LOCK",
          actualUpdatedAt: err.actualUpdatedAt,
        },
        { status: 409 }
      );
    }
    if (err instanceof RowNotFoundError) {
      return NextResponse.json(
        { error: `Asset not found: ${id}` },
        { status: 404 }
      );
    }
    console.error("Update asset failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE — soft delete
// ============================================================

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  const expectedUpdatedAt = url.searchParams.get("expected_updated_at");
  if (!companyId || !expectedUpdatedAt) {
    return NextResponse.json(
      { error: "Missing company_id or expected_updated_at" },
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

    await client.softDelete("40_assets", id, expectedUpdatedAt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OptimisticLockError) {
      return NextResponse.json(
        {
          error: "Conflict: row was modified by another user",
          code: "OPTIMISTIC_LOCK",
          actualUpdatedAt: err.actualUpdatedAt,
        },
        { status: 409 }
      );
    }
    if (err instanceof RowNotFoundError) {
      return NextResponse.json(
        { error: `Asset not found: ${id}` },
        { status: 404 }
      );
    }
    console.error("Delete asset failed:", err);
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

function validateUpdateBody(
  body: unknown
): (Record<string, string> & { expected_updated_at: string }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.expected_updated_at !== "string" || !b.expected_updated_at) {
    return null;
  }

  // Allowed fields for patch. Anything else is ignored.
  const allowed = [
    "category",
    "name",
    "comment",
    "status",
    "note",
    "note_color",
    "reminder_date",
    "folder_drive_id",
    "acquired_date",
    "acquired_cost_cents",
  ] as const;

  const patch: Record<string, string> & { expected_updated_at: string } = {
    expected_updated_at: b.expected_updated_at,
  };

  for (const key of allowed) {
    const v = b[key];
    if (v === undefined) continue;
    if (typeof v === "string") {
      patch[key] = v;
    } else if (typeof v === "number") {
      patch[key] = String(v);
    }
    // Other types silently ignored
  }

  return patch;
}

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
