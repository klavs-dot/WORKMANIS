/**
 * GET /api/companies/list
 *
 * Returns the authenticated user's companies as registered in their
 * account-master.gsheet/01_companies tab.
 *
 * If the user has never added a company:
 *   - No account-master.gsheet exists yet
 *   - We return an empty array (NOT an error — empty state is normal)
 *
 * Response shape:
 *   { companies: Array<{
 *       id, slug, name, legalName, regNumber, vatNumber,
 *       folderId, sheetId, status
 *     }> }
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import {
  getServiceAccountSheetsClient,
  getOwnerSheetId,
} from "@/lib/service-account";

const ROOT_FOLDER_NAME = "WORKMANIS";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Sesija 7 Faze 2 part 3 — branch by role.
  //
  // Owner: walk Drive with their OAuth token to find their
  //   account-master sheet, then read 01_companies. Same as
  //   before (the existing flow).
  //
  // External user (accountant / warehouse_manager): no OAuth
  //   token to walk Drive with. Use the service account, look
  //   up the OWNER's sheet ID from session.ownerEmail, and
  //   read 01_companies from there. For warehouse_manager,
  //   filter to allowedCompanyIds (accountant sees all).
  const role = session.role ?? "owner";

  if (role !== "owner") {
    return readCompaniesViaServiceAccount(
      session.ownerEmail ?? "",
      role,
      session.allowedCompanyIds ?? []
    );
  }

  // Owner flow needs accessToken
  if (!session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: session.accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });
    const sheets = google.sheets({ version: "v4", auth: oauth2 });

    // Find account-master.gsheet via folder walk:
    //   WORKMANIS/accounts/{email}/_account/account-master.gsheet
    // If any folder in the chain is missing, user hasn't set anything up
    // yet — return empty list.

    const rootId = await findFolderByName(drive, ROOT_FOLDER_NAME, null);
    if (!rootId) return NextResponse.json({ companies: [] });

    const accountsId = await findFolderByName(drive, "accounts", rootId);
    if (!accountsId) return NextResponse.json({ companies: [] });

    const userAccountId = await findFolderByName(
      drive,
      session.user.email,
      accountsId
    );
    if (!userAccountId) return NextResponse.json({ companies: [] });

    const accountInternalId = await findFolderByName(
      drive,
      "_account",
      userAccountId
    );
    if (!accountInternalId) return NextResponse.json({ companies: [] });

    const accountMasterId = await findSheetByName(
      drive,
      "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)",
      accountInternalId
    );
    if (!accountMasterId) return NextResponse.json({ companies: [] });

    // Read 01_companies tab
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: accountMasterId,
      range: "01_companies!A:Z",
    });

    const rows = response.data.values ?? [];
    if (rows.length < 2) return NextResponse.json({ companies: [] });

    const header = rows[0] as string[];
    const dataRows = rows.slice(1);

    const companies = dataRows
      .map((r) => parseCompanyRow(header, r))
      // Hide soft-deleted
      .filter((c) => c !== null && !c.deletedAt);

    return NextResponse.json({ companies });
  } catch (err) {
    console.error("List companies failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Unknown error listing companies",
      },
      { status: 500 }
    );
  }
}

/**
 * Sesija 7 — read companies for an external user via service
 * account. The session carries ownerEmail (set at login time)
 * which is looked up in OWNER_SHEET_REGISTRY to find the
 * account-master sheet ID. Service account must have been
 * granted read access to that sheet during the setup wizard.
 *
 * For warehouse_manager role, filter to allowedCompanyIds.
 * For accountant role, return all (empty array means 'all').
 */
async function readCompaniesViaServiceAccount(
  ownerEmail: string,
  role: string,
  allowedCompanyIds: string[]
) {
  if (!ownerEmail) {
    console.warn("[list-companies] external user has no ownerEmail");
    return NextResponse.json({ companies: [] });
  }

  const sheetId = getOwnerSheetId(ownerEmail);
  if (!sheetId) {
    console.warn(
      `[list-companies] no sheet registered for owner=${ownerEmail}`
    );
    return NextResponse.json({ companies: [] });
  }

  const sheets = await getServiceAccountSheetsClient();
  if (!sheets) {
    console.error("[list-companies] service account not configured");
    return NextResponse.json(
      { error: "Sistēmas konfigurācija nepilnīga" },
      { status: 500 }
    );
  }

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "01_companies!A:Z",
    });
    const rows = response.data.values ?? [];
    if (rows.length < 2) return NextResponse.json({ companies: [] });

    const header = rows[0] as string[];
    const dataRows = rows.slice(1);

    let companies = dataRows
      .map((r) => parseCompanyRow(header, r as string[]))
      .filter((c) => c !== null && !c.deletedAt) as CompanyRow[];

    // Filter for warehouse_manager — restrict to allowed companies
    if (role === "warehouse_manager" && allowedCompanyIds.length > 0) {
      companies = companies.filter((c) =>
        allowedCompanyIds.includes(c.id)
      );
    }

    return NextResponse.json({ companies });
  } catch (err) {
    console.error(
      `[list-companies] failed reading owner sheet ${sheetId}:`,
      err
    );
    return NextResponse.json(
      {
        error:
          "Nevarēja nolasīt uzņēmumu sarakstu. Pārbaudi, vai sheet ir koplietots ar service account.",
      },
      { status: 500 }
    );
  }
}

// ============================================================
// Helpers
// ============================================================

async function findFolderByName(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const parentClause = parentId
    ? `'${parentId}' in parents`
    : `'root' in parents`;

  const query = [
    `name = '${escapeForQuery(name)}'`,
    parentClause,
    `mimeType = '${FOLDER_MIME}'`,
    `trashed = false`,
  ].join(" and ");

  const search = await drive.files.list({
    q: query,
    fields: "files(id)",
    pageSize: 1,
  });

  return search.data.files?.[0]?.id ?? null;
}

async function findSheetByName(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string | null> {
  const query = [
    `name = '${escapeForQuery(name)}'`,
    `'${parentId}' in parents`,
    `mimeType = '${SHEETS_MIME}'`,
    `trashed = false`,
  ].join(" and ");

  const search = await drive.files.list({
    q: query,
    fields: "files(id)",
    pageSize: 1,
  });

  return search.data.files?.[0]?.id ?? null;
}

interface CompanyRow {
  id: string;
  slug: string;
  name: string;
  legalName: string;
  regNumber: string;
  vatNumber: string | null;
  folderId: string;
  sheetId: string;
  status: string;
  brandColor: string;
  logoDriveId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}

function parseCompanyRow(
  header: string[],
  row: string[]
): CompanyRow | null {
  const col = (name: string): string => {
    const idx = header.indexOf(name);
    if (idx < 0) return "";
    return (row[idx] ?? "") as string;
  };

  const id = col("id");
  if (!id) return null; // skip malformed rows

  return {
    id,
    slug: col("slug"),
    name: col("name"),
    legalName: col("legal_name"),
    regNumber: col("reg_number"),
    vatNumber: col("vat_number") || null,
    folderId: col("folder_drive_id"),
    sheetId: col("sheet_id"),
    status: col("status"),
    // Sesija 7 — include branding so sidebar/topbar can show
    // accent color and logo immediately after page load.
    // Without these, useCompany() context had brandColor=undefined
    // until the requisites modal triggered a fresh load.
    brandColor: col("brand_color"),
    logoDriveId: col("logo_drive_id"),
    createdAt: col("created_at"),
    updatedAt: col("updated_at"),
    deletedAt: col("deleted_at"),
  };
}

function escapeForQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
