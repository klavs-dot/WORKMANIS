/**
 * Server-side helper for store API routes.
 *
 * Every CRUD endpoint for per-company data (clients, employees,
 * assets, etc.) needs to resolve: given the authenticated user
 * and a company ID they're operating on, what's the Drive file ID
 * of that company's company.gsheet?
 *
 * Without this resolution, the SheetsClient can't know which
 * spreadsheet to talk to. And we can't blindly trust a company_id
 * or sheet_id passed from the client — that would let an attacker
 * write to someone else's sheet by guessing IDs.
 *
 * The trust chain here:
 *   1. User authenticates via Google OAuth
 *   2. Their session.user.email identifies the account folder
 *   3. That account folder's account-master.gsheet is the source
 *      of truth for what companies they own
 *   4. We look up the company ID IN THAT sheet and only then
 *      trust its sheet_id value
 *
 * This means the only spreadsheet a server-side API can ever
 * write to is one registered in the user's own account-master.
 * Even if client code sent a spoofed company_id, this function
 * would return null because that ID isn't in the user's registry.
 */

import { google } from "googleapis";

const ROOT_FOLDER_NAME = "WORKMANIS";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const ACCOUNT_MASTER_NAME = "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)";

export interface ResolvedCompany {
  companyId: string;
  sheetId: string;
  folderId: string;
  slug: string;
  name: string;
}

/**
 * Look up a company by ID within the user's account-master registry.
 * Returns null if the company doesn't belong to this user or the
 * user hasn't set up their platform root yet.
 */
export async function resolveCompany(
  accessToken: string,
  userEmail: string,
  companyId: string
): Promise<ResolvedCompany | null> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  // Walk: WORKMANIS/accounts/{email}/_account/WORKMANIS_ACCOUNT_MASTER
  const rootId = await findFolder(drive, ROOT_FOLDER_NAME, null);
  if (!rootId) return null;

  const accountsId = await findFolder(drive, "accounts", rootId);
  if (!accountsId) return null;

  const userAccountId = await findFolder(drive, userEmail, accountsId);
  if (!userAccountId) return null;

  const accountInternalId = await findFolder(drive, "_account", userAccountId);
  if (!accountInternalId) return null;

  const accountMasterId = await findSheet(
    drive,
    ACCOUNT_MASTER_NAME,
    accountInternalId
  );
  if (!accountMasterId) return null;

  // Read 01_companies tab and find the matching row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: accountMasterId,
    range: "01_companies!A:Z",
  });
  const rows = response.data.values ?? [];
  if (rows.length < 2) return null;

  const header = rows[0] as string[];
  const idCol = header.indexOf("id");
  const slugCol = header.indexOf("slug");
  const nameCol = header.indexOf("name");
  const folderCol = header.indexOf("folder_drive_id");
  const sheetCol = header.indexOf("sheet_id");
  const deletedCol = header.indexOf("deleted_at");

  if (idCol < 0 || sheetCol < 0 || folderCol < 0) return null;

  const match = rows
    .slice(1)
    .find(
      (r) =>
        r[idCol] === companyId &&
        !(deletedCol >= 0 && r[deletedCol]) // skip soft-deleted
    );
  if (!match) return null;

  return {
    companyId: match[idCol] as string,
    sheetId: match[sheetCol] as string,
    folderId: match[folderCol] as string,
    slug: slugCol >= 0 ? ((match[slugCol] as string) ?? "") : "",
    name: nameCol >= 0 ? ((match[nameCol] as string) ?? "") : "",
  };
}

// ============================================================
// Internal Drive lookup helpers
// ============================================================

async function findFolder(
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
  const result = await drive.files.list({
    q: query,
    fields: "files(id)",
    pageSize: 1,
  });
  return result.data.files?.[0]?.id ?? null;
}

async function findSheet(
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
  const result = await drive.files.list({
    q: query,
    fields: "files(id)",
    pageSize: 1,
  });
  return result.data.files?.[0]?.id ?? null;
}

function escapeForQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
