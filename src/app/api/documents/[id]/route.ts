/**
 * PATCH /api/documents/{id}?company_id=...
 * DELETE /api/documents/{id}?company_id=...&expected_updated_at=...
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

    const row = await client.update("50_documents", id, patch);
    return NextResponse.json({
      document: rowToDocument(row as unknown as Record<string, unknown>),
    });
  } catch (err) {
    if (err instanceof OptimisticLockError) {
      return NextResponse.json(
        {
          error: "Conflict",
          code: "OPTIMISTIC_LOCK",
          actualUpdatedAt: err.actualUpdatedAt,
        },
        { status: 409 }
      );
    }
    if (err instanceof RowNotFoundError) {
      return NextResponse.json(
        { error: `Document not found: ${id}` },
        { status: 404 }
      );
    }
    console.error("Update document failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

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

    await client.softDelete("50_documents", id, expectedUpdatedAt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OptimisticLockError) {
      return NextResponse.json(
        { error: "Conflict", code: "OPTIMISTIC_LOCK" },
        { status: 409 }
      );
    }
    if (err instanceof RowNotFoundError) {
      return NextResponse.json(
        { error: `Document not found: ${id}` },
        { status: 404 }
      );
    }
    console.error("Delete document failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ============================================================
// Validation + mapping
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

  const stringFields = [
    "kind",
    "language",
    "subject",
    "body",
    "issued_date",
  ] as const;
  for (const key of stringFields) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
  }

  // Party objects get flattened into columns
  if (b.sender && typeof b.sender === "object") {
    const sender = b.sender as Record<string, unknown>;
    if (typeof sender.kind === "string") patch.sender_kind = sender.kind;
    if (typeof sender.refId === "string") patch.sender_id = sender.refId;
    if (typeof sender.displayName === "string")
      patch.sender_name = sender.displayName;
    if (typeof sender.addressLine === "string")
      patch.sender_address = sender.addressLine;
  }
  if (b.recipient && typeof b.recipient === "object") {
    const recipient = b.recipient as Record<string, unknown>;
    if (typeof recipient.kind === "string")
      patch.recipient_kind = recipient.kind;
    if (typeof recipient.refId === "string")
      patch.recipient_id = recipient.refId;
    if (typeof recipient.displayName === "string")
      patch.recipient_name = recipient.displayName;
    if (typeof recipient.addressLine === "string")
      patch.recipient_address = recipient.addressLine;
  }

  if (typeof b.has_physical_signature === "boolean") {
    patch.has_physical_signature = b.has_physical_signature ? "TRUE" : "FALSE";
  }

  return patch;
}

function rowToDocument(row: Record<string, unknown>): {
  id: string;
  type: string;
  title: string;
  documentDate: string;
  language: string;
  sender: {
    kind: string;
    refId?: string;
    displayName: string;
    addressLine?: string;
  };
  recipient: {
    kind: string;
    refId?: string;
    displayName: string;
    addressLine?: string;
  };
  body: string;
  hasPhysicalSignature: boolean;
  pdfFileName?: string;
  pdfGeneratedAt?: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id as string,
    type: (row.kind as string) ?? "iesniegums",
    title: (row.subject as string) ?? "",
    documentDate: (row.issued_date as string) ?? "",
    language: (row.language as string) ?? "lv",
    sender: {
      kind: (row.sender_kind as string) ?? "manual",
      refId: ((row.sender_id as string) || undefined) as string | undefined,
      displayName: (row.sender_name as string) ?? "",
      addressLine: ((row.sender_address as string) || undefined) as
        | string
        | undefined,
    },
    recipient: {
      kind: (row.recipient_kind as string) ?? "manual",
      refId: ((row.recipient_id as string) || undefined) as
        | string
        | undefined,
      displayName: (row.recipient_name as string) ?? "",
      addressLine: ((row.recipient_address as string) || undefined) as
        | string
        | undefined,
    },
    body: (row.body as string) ?? "",
    hasPhysicalSignature:
      (row.has_physical_signature as string) === "TRUE",
    pdfFileName: undefined,
    pdfGeneratedAt: undefined,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}
