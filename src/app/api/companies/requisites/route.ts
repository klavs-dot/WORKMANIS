/**
 * GET /api/companies/requisites?company_id=X
 * PUT /api/companies/requisites?company_id=X
 *
 * Read and write the active company's full requisites (legal
 * name, addresses, bank info, logo) which live in the
 * 01_requisites tab of the company's gsheet.
 *
 * Single-row tab — we store ONE requisites record per company
 * and upsert (insert if missing, update if present). The id is
 * deterministic ('req-001') so we always know which row to hit.
 *
 * Why a separate tab from account-master/01_companies:
 *   account-master/01_companies = registry, just the keys
 *     needed to FIND each company (id, slug, sheet_id, folder_id).
 *     Lives in the user's account-master.gsheet.
 *   company.gsheet/01_requisites = full identity for THIS company.
 *     Source of truth for invoice PDFs, copy-requisites, etc.
 *
 * Splitting them lets us share a registry across companies while
 * keeping each company's full requisites scoped to its own sheet
 * (which is also where its invoices, payments, etc. live).
 *
 * Errors:
 *   - 401 if not authenticated
 *   - 400 if missing company_id or invalid PUT body
 *   - 404 if company not found in registry
 *   - 502 on Sheets API failure
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient } from "@/lib/sheets-client";

export const maxDuration = 30;

// We always use this id for the single requisites row. Picked at
// schema-design time and shouldn't change — clients (including
// any future schema repair logic) can assume it's stable.
const REQUISITES_ROW_ID = "req-001";

interface RequisitesBody {
  name?: string;
  legalName?: string;
  regNumber?: string;
  vatNumber?: string;
  legalAddress?: string;
  deliveryAddress?: string;
  contactEmail?: string;
  invoiceEmail?: string;
  iban?: string;
  bankName?: string;
  swift?: string;
  phone?: string;
  website?: string;
  logoDriveId?: string;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
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

  const sheets = createSheetsClient({
    accessToken: session.accessToken,
    spreadsheetId: company.sheetId,
    actor: session.user.email,
  });

  try {
    const rows = await sheets.list("01_requisites");
    const row =
      (rows as Array<Record<string, unknown>>).find(
        (r) => r.id === REQUISITES_ROW_ID
      ) ?? (rows as Array<Record<string, unknown>>)[0];

    if (!row) {
      // No requisites set yet — return empty defaults so the UI
      // can render the form with all blank fields rather than
      // crashing on undefined.
      return NextResponse.json({ requisites: emptyRequisites() });
    }

    return NextResponse.json({ requisites: rowToApi(row) });
  } catch (err) {
    console.error("Failed to read 01_requisites:", err);
    // If the tab doesn't exist yet (user hasn't run schema repair
    // since this feature was added), return empty defaults rather
    // than a 502 — the UI can still show the form
    return NextResponse.json({ requisites: emptyRequisites() });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  let body: RequisitesBody;
  try {
    body = (await request.json()) as RequisitesBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
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

  const sheets = createSheetsClient({
    accessToken: session.accessToken,
    spreadsheetId: company.sheetId,
    actor: session.user.email,
  });

  // Map API → row columns
  const rowData: Record<string, string> = {
    name: (body.name ?? "").trim(),
    legal_name: (body.legalName ?? "").trim(),
    reg_number: (body.regNumber ?? "").trim(),
    vat_number: (body.vatNumber ?? "").trim(),
    legal_address: (body.legalAddress ?? "").trim(),
    delivery_address: (body.deliveryAddress ?? "").trim(),
    contact_email: (body.contactEmail ?? "").trim(),
    invoice_email: (body.invoiceEmail ?? "").trim(),
    iban: (body.iban ?? "").trim(),
    bank_name: (body.bankName ?? "").trim(),
    swift: (body.swift ?? "").trim(),
    phone: (body.phone ?? "").trim(),
    website: (body.website ?? "").trim(),
    logo_drive_id: (body.logoDriveId ?? "").trim(),
  };

  try {
    // Upsert: if a row with our deterministic id exists, update
    // it; otherwise create. We don't use sheets.create here for
    // the update case because that would generate a new id; we
    // want REQUISITES_ROW_ID always.
    const existing = await sheets.list("01_requisites");
    const existingRow = (existing as Array<Record<string, unknown>>).find(
      (r) => r.id === REQUISITES_ROW_ID
    );

    if (existingRow) {
      // sheets.update expects expected_updated_at INSIDE the patch
      // for optimistic locking. We pass the row's current
      // updated_at so the call succeeds. Concurrent edits would
      // throw OptimisticLockError which the catch block surfaces
      // as a 502; that's acceptable for requisites since they
      // change infrequently.
      await sheets.update("01_requisites", REQUISITES_ROW_ID, {
        ...rowData,
        expected_updated_at: (existingRow.updated_at as string) ?? "",
      });
    } else {
      // First-ever save — append the row with our fixed id. We
      // use createWithFixedId here because the standard create()
      // helper auto-generates ids; we want REQUISITES_ROW_ID.
      await sheets.createWithFixedId(
        "01_requisites",
        REQUISITES_ROW_ID,
        rowData
      );
    }

    return NextResponse.json({
      ok: true,
      requisites: { ...rowData, id: REQUISITES_ROW_ID, ...body },
    });
  } catch (err) {
    console.error("Failed to upsert 01_requisites:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Saglabāšana neizdevās: ${err.message}`
            : "Saglabāšana neizdevās",
      },
      { status: 502 }
    );
  }
}

function emptyRequisites() {
  return {
    name: "",
    legalName: "",
    regNumber: "",
    vatNumber: "",
    legalAddress: "",
    deliveryAddress: "",
    contactEmail: "",
    invoiceEmail: "",
    iban: "",
    bankName: "",
    swift: "",
    phone: "",
    website: "",
    logoDriveId: "",
  };
}

function rowToApi(row: Record<string, unknown>) {
  return {
    name: (row.name as string) ?? "",
    legalName: (row.legal_name as string) ?? "",
    regNumber: (row.reg_number as string) ?? "",
    vatNumber: (row.vat_number as string) ?? "",
    legalAddress: (row.legal_address as string) ?? "",
    deliveryAddress: (row.delivery_address as string) ?? "",
    contactEmail: (row.contact_email as string) ?? "",
    invoiceEmail: (row.invoice_email as string) ?? "",
    iban: (row.iban as string) ?? "",
    bankName: (row.bank_name as string) ?? "",
    swift: (row.swift as string) ?? "",
    phone: (row.phone as string) ?? "",
    website: (row.website as string) ?? "",
    logoDriveId: (row.logo_drive_id as string) ?? "",
  };
}
