/**
 * PATCH /api/clients/{id}?company_id=...
 * DELETE /api/clients/{id}?company_id=...&expected_updated_at=...
 *
 * Mirrors /api/assets/[id] pattern. See that file for rationale
 * on optimistic locking + error shapes.
 *
 * Note: notes array and keywords array are serialized specially
 * (JSON and comma-separated) when writing, deserialized on read.
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
    return NextResponse.json({ error: "Missing company_id" }, { status: 400 });
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

    const row = await client.update("10_clients", id, patch);
    return NextResponse.json({
      client: rowToClient(row as unknown as Record<string, unknown>),
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
        { error: `Client not found: ${id}` },
        { status: 404 }
      );
    }
    console.error("Update client failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
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

    await client.softDelete("10_clients", id, expectedUpdatedAt);
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
        { error: `Client not found: ${id}` },
        { status: 404 }
      );
    }
    console.error("Delete client failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ============================================================
// Validation + row mapping (same shape as /api/clients)
// ============================================================

function validateUpdateBody(
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

  // Scalar fields
  const stringFields = [
    "type",
    "name",
    "reg_number",
    "vat_number",
    "personal_code",
    "country_code",
    "address",
    "iban",
    "email",
    "phone",
    "contact_person",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  // Array fields — serialize
  if (Array.isArray(b.keywords)) {
    patch.tags = (b.keywords as string[]).join(",");
  }
  if (Array.isArray(b.notes)) {
    patch.notes = JSON.stringify(b.notes);
  }

  return patch;
}

function rowToClient(row: Record<string, unknown>): {
  id: string;
  type: string;
  name: string;
  regNumber: string | undefined;
  vatNumber: string | undefined;
  legalAddress: string | undefined;
  bankAccount: string | undefined;
  country: string;
  countryCode: string;
  keywords: string[];
  status: string;
  notes: Array<{ id: string; body: string; createdAt: string; updatedAt?: string }>;
  createdAt: string;
  updatedAt: string;
} {
  const tags = (row.tags as string) ?? "";
  const keywords = tags
    ? tags
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  let parsedNotes: Array<{
    id: string;
    body: string;
    createdAt: string;
    updatedAt?: string;
  }> = [];
  try {
    const raw = (row.notes as string) ?? "";
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsedNotes = parsed;
    }
  } catch {
    parsedNotes = [];
  }

  return {
    id: row.id as string,
    type: (row.type as string) ?? "juridiska",
    name: (row.name as string) ?? "",
    regNumber: ((row.reg_number as string) || undefined) as string | undefined,
    vatNumber: ((row.vat_number as string) || undefined) as string | undefined,
    legalAddress: ((row.address as string) || undefined) as string | undefined,
    bankAccount: ((row.iban as string) || undefined) as string | undefined,
    country: "Latvija",
    countryCode: (row.country_code as string) ?? "LV",
    keywords,
    status: "aktivs",
    notes: parsedNotes,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}
