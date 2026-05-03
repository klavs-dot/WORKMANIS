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
 *
 * Caching: resolveCompany is called on EVERY API request that
 * touches a company sheet. Doing 5 Drive lookups + 1 Sheets read
 * per request adds up fast — under load this alone can saturate
 * the Drive API quota. We cache resolved companies per (user,
 * companyId) pair for a short window, since the underlying
 * registry data changes only when the user creates / renames /
 * deletes companies.
 */

import { google } from "googleapis";
import { withRetry } from "./sheets-client";

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
 * Module-level cache. Lives across requests within a single
 * Vercel function instance (warm starts share state). Keyed by
 * "{userEmail}:{companyId}" so different users / companies
 * don't collide.
 *
 * TTL: 5 minutes. The underlying data (company registry in
 * account-master.gsheet) only changes when the user creates,
 * renames, or deletes a company — events that the user
 * initiated and can wait 5 min to see propagate.
 */
const RESOLVE_CACHE = new Map<
  string,
  { value: ResolvedCompany | null; expiresAt: number }
>();
const RESOLVE_TTL_MS = 5 * 60 * 1000;

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
  const cacheKey = `${userEmail}:${companyId}`;
  const cached = RESOLVE_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  // Walk: WORKMANIS/accounts/{email}/_account/WORKMANIS_ACCOUNT_MASTER
  // Each step wrapped in withRetry so a transient Drive rate limit
  // doesn't fail the whole request — just back off and try again.
  const rootId = await withRetry(
    () => findFolder(drive, ROOT_FOLDER_NAME, null),
    "find root folder"
  );
  if (!rootId) {
    cacheNullResult(cacheKey);
    return null;
  }

  const accountsId = await withRetry(
    () => findFolder(drive, "accounts", rootId),
    "find accounts folder"
  );
  if (!accountsId) {
    cacheNullResult(cacheKey);
    return null;
  }

  const userAccountId = await withRetry(
    () => findFolder(drive, userEmail, accountsId),
    "find user folder"
  );
  if (!userAccountId) {
    cacheNullResult(cacheKey);
    return null;
  }

  const accountInternalId = await withRetry(
    () => findFolder(drive, "_account", userAccountId),
    "find _account folder"
  );
  if (!accountInternalId) {
    cacheNullResult(cacheKey);
    return null;
  }

  const accountMasterId = await withRetry(
    () => findSheet(drive, ACCOUNT_MASTER_NAME, accountInternalId),
    "find account-master"
  );
  if (!accountMasterId) {
    cacheNullResult(cacheKey);
    return null;
  }

  // Read 01_companies tab and find the matching row
  const response = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: accountMasterId,
        range: "01_companies!A:Z",
      }),
    "read 01_companies"
  );
  const rows = response.data.values ?? [];
  if (rows.length < 2) {
    cacheNullResult(cacheKey);
    return null;
  }

  const header = rows[0] as string[];
  const idCol = header.indexOf("id");
  const slugCol = header.indexOf("slug");
  const nameCol = header.indexOf("name");
  const folderCol = header.indexOf("folder_drive_id");
  const sheetCol = header.indexOf("sheet_id");
  const deletedCol = header.indexOf("deleted_at");

  if (idCol < 0 || sheetCol < 0 || folderCol < 0) {
    cacheNullResult(cacheKey);
    return null;
  }

  const match = rows
    .slice(1)
    .find(
      (r) =>
        r[idCol] === companyId &&
        !(deletedCol >= 0 && r[deletedCol]) // skip soft-deleted
    );
  if (!match) {
    cacheNullResult(cacheKey);
    return null;
  }

  const result: ResolvedCompany = {
    companyId: match[idCol] as string,
    sheetId: match[sheetCol] as string,
    folderId: match[folderCol] as string,
    slug: slugCol >= 0 ? ((match[slugCol] as string) ?? "") : "",
    name: nameCol >= 0 ? ((match[nameCol] as string) ?? "") : "",
  };
  RESOLVE_CACHE.set(cacheKey, {
    value: result,
    expiresAt: Date.now() + RESOLVE_TTL_MS,
  });
  return result;
}

/**
 * Cache a null result for a shorter TTL than success. Negative
 * results are still worth caching (avoids hammering the API for
 * a deleted/typo'd company) but a shorter TTL means the user
 * sees recovery faster after fixing whatever was wrong.
 */
function cacheNullResult(cacheKey: string) {
  RESOLVE_CACHE.set(cacheKey, {
    value: null,
    expiresAt: Date.now() + 30 * 1000, // 30s for negatives
  });
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
