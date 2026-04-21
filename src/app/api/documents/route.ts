/**
 * Documents CRUD — POST/GET on 50_documents tab.
 *
 * Row layout flattens sender and recipient parties into
 * dedicated columns (sender_kind, sender_id, sender_name,
 * sender_address, and the same for recipient). This makes
 * documents searchable by party name directly in Sheets.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient } from "@/lib/sheets-client";

export const maxDuration = 30;

export async function GET(request: Request) {
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

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    const rows = await client.list("50_documents");
    return NextResponse.json({
      documents: rows.map((r) =>
        rowToDocument(r as unknown as Record<string, unknown>)
      ),
    });
  } catch (err) {
    console.error("List documents failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

  const data = validateCreateBody(body);
  if (!data) {
    return NextResponse.json(
      { error: "Invalid document data" },
      { status: 400 }
    );
  }

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    const row = await client.create("50_documents", data);
    return NextResponse.json({
      document: rowToDocument(row as unknown as Record<string, unknown>),
    });
  } catch (err) {
    console.error("Create document failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ============================================================
// Validation + mapping
// ============================================================

interface DocumentCreateInput {
  kind: string;
  language: string;
  sender_kind: string;
  sender_id: string;
  sender_name: string;
  sender_address: string;
  recipient_kind: string;
  recipient_id: string;
  recipient_name: string;
  recipient_address: string;
  subject: string;
  body: string;
  issued_date: string;
  pdf_drive_id: string;
  signed: string;
  has_physical_signature: string;
  signed_drive_id: string;
}

function validateCreateBody(body: unknown): DocumentCreateInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.kind !== "string" || !b.kind) return null;
  if (typeof b.subject !== "string") return null;
  if (typeof b.body !== "string") return null;

  const sender = (b.sender as Record<string, unknown>) ?? {};
  const recipient = (b.recipient as Record<string, unknown>) ?? {};

  return {
    kind: b.kind,
    language: typeof b.language === "string" ? b.language : "lv",
    sender_kind: typeof sender.kind === "string" ? sender.kind : "",
    sender_id: typeof sender.refId === "string" ? sender.refId : "",
    sender_name:
      typeof sender.displayName === "string" ? sender.displayName : "",
    sender_address:
      typeof sender.addressLine === "string" ? sender.addressLine : "",
    recipient_kind:
      typeof recipient.kind === "string" ? recipient.kind : "",
    recipient_id:
      typeof recipient.refId === "string" ? recipient.refId : "",
    recipient_name:
      typeof recipient.displayName === "string"
        ? recipient.displayName
        : "",
    recipient_address:
      typeof recipient.addressLine === "string"
        ? recipient.addressLine
        : "",
    subject: (b.subject as string).trim(),
    body: b.body as string,
    issued_date:
      typeof b.issued_date === "string" ? b.issued_date : "",
    pdf_drive_id: "",
    signed: "FALSE",
    has_physical_signature:
      b.has_physical_signature === true ||
      b.has_physical_signature === "TRUE"
        ? "TRUE"
        : "FALSE",
    signed_drive_id: "",
  };
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
