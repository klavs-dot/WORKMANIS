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

const ROOT_FOLDER_NAME = "WORKMANIS";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
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
    createdAt: col("created_at"),
    updatedAt: col("updated_at"),
    deletedAt: col("deleted_at"),
  };
}

function escapeForQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
