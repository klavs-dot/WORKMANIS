/**
 * Clients CRUD — POST/GET on 10_clients tab.
 *
 * Mirrors /api/assets shape:
 *   GET  /api/clients?company_id=...          → { clients: Client[] }
 *   POST /api/clients?company_id=...           → { client: Client }
 *
 * Client row special handling:
 *   - `keywords`: array of strings → serialized as comma-separated
 *     in the sheet column (human-readable in Sheets UI)
 *   - `notes`: array of note objects → serialized as JSON string
 *     in a dedicated 'notes_json' usage of the `notes` column
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient } from "@/lib/sheets-client";

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

    const rows = await client.list("10_clients");
    return NextResponse.json({
      clients: rows.map((r) =>
        rowToClient(r as unknown as Record<string, unknown>)
      ),
    });
  } catch (err) {
    console.error("List clients failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
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
      { error: "Invalid client data. Required: type, name, country, country_code" },
      { status: 400 }
    );
  }

  try {
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    const row = await client.create("10_clients", data);
    return NextResponse.json({
      client: rowToClient(row as unknown as Record<string, unknown>),
    });
  } catch (err) {
    console.error("Create client failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ============================================================
// Validation + row mapping
// ============================================================

interface ClientCreateInput {
  type: string;
  name: string;
  reg_number: string;
  vat_number: string;
  personal_code: string;
  country_code: string;
  address: string;
  iban: string;
  email: string;
  phone: string;
  contact_person: string;
  notes: string; // JSON-serialized array of { id, body, createdAt, updatedAt? }
  tags: string; // comma-separated keywords
  first_invoice_date: string;
  total_invoiced_cents: string;
}

function validateCreateBody(body: unknown): ClientCreateInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.type !== "string" || !b.type) return null;
  if (typeof b.name !== "string" || !b.name.trim()) return null;

  const keywords = Array.isArray(b.keywords) ? (b.keywords as string[]) : [];
  const notes = Array.isArray(b.notes) ? b.notes : [];

  return {
    type: b.type,
    name: (b.name as string).trim(),
    reg_number: typeof b.reg_number === "string" ? b.reg_number : "",
    vat_number: typeof b.vat_number === "string" ? b.vat_number : "",
    personal_code: "",
    country_code: typeof b.country_code === "string" ? b.country_code : "LV",
    address: typeof b.address === "string" ? b.address : "",
    iban: typeof b.iban === "string" ? b.iban : "",
    email: typeof b.email === "string" ? b.email : "",
    phone: typeof b.phone === "string" ? b.phone : "",
    contact_person: "",
    notes: JSON.stringify(notes),
    tags: keywords.join(","),
    first_invoice_date: "",
    total_invoiced_cents: "0",
  };
}

/**
 * Convert a sheet row into the shape expected by the ClientsProvider.
 * Handles keyword + notes deserialization from their serialized forms.
 */
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
    // Malformed notes JSON — start fresh rather than crash
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
    country: "Latvija", // derived; country_code is the source of truth
    countryCode: (row.country_code as string) ?? "LV",
    keywords,
    status: "aktivs", // default; real status column doesn't exist in schema yet
    notes: parsedNotes,
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}
