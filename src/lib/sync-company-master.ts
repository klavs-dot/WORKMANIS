/**
 * Helper for keeping the user's master 00_companies entry in
 * sync with per-company 01_requisites edits.
 *
 * The master sheet (account-master.gsheet/01_companies) lives in
 * the user's root Drive folder and stores the side-nav company
 * list. Each row caches a few identity fields (name, legal_name,
 * reg_number) for display so the side nav doesn't have to fetch
 * them from each company's own sheet on every render.
 *
 * When the user edits requisites for a company, those fields can
 * drift from what's in 00_companies. Without sync, the side nav
 * keeps showing the stale name even though the requisites modal
 * shows the new one. This helper closes that gap.
 *
 * Auth: writes happen with the SESSION token (the user's personal
 * OAuth that owns the master sheet), not the company-scoped token
 * used for per-company sheets.
 */

import { google } from "googleapis";

const ROOT_FOLDER_NAME = "WORKMANIS";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";

interface SyncFields {
  name?: string;
  legal_name?: string;
  reg_number?: string;
  vat_number?: string;
  // Sesija 7 — branding fields need to flow to master 01_companies
  // so the list endpoint (and consequently sidebar/topbar) can
  // show the accent color and logo without an extra requisites
  // fetch per company.
  brand_color?: string;
  logo_drive_id?: string;
}

/**
 * Find the master sheet ID via the same folder walk as
 * /api/companies/list. Returns null if the user hasn't
 * provisioned anything yet (in which case the master sheet
 * doesn't exist).
 */
async function findMasterSheetId(
  drive: ReturnType<typeof google.drive>,
  userEmail: string
): Promise<string | null> {
  const rootId = await findByName(drive, ROOT_FOLDER_NAME, null, FOLDER_MIME);
  if (!rootId) return null;

  const accountsId = await findByName(drive, "accounts", rootId, FOLDER_MIME);
  if (!accountsId) return null;

  const userAccountId = await findByName(
    drive,
    userEmail,
    accountsId,
    FOLDER_MIME
  );
  if (!userAccountId) return null;

  const accountInternalId = await findByName(
    drive,
    "_account",
    userAccountId,
    FOLDER_MIME
  );
  if (!accountInternalId) return null;

  const masterId = await findByName(
    drive,
    "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)",
    accountInternalId,
    SHEETS_MIME
  );
  return masterId;
}

async function findByName(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null,
  mimeType: string
): Promise<string | null> {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const queryParts = [
    `name = '${escaped}'`,
    `mimeType = '${mimeType}'`,
    "trashed = false",
  ];
  if (parentId) queryParts.push(`'${parentId}' in parents`);
  const search = await drive.files.list({
    q: queryParts.join(" and "),
    fields: "files(id)",
    pageSize: 1,
  });
  return search.data.files?.[0]?.id ?? null;
}

/**
 * Sync identity fields from 01_requisites into 00_companies.
 * Idempotent: if no row matches the given id, this is a no-op
 * (we don't create new rows here — that's the provisioning
 * endpoint's job). If no fields actually changed, also a no-op.
 *
 * Errors are NOT thrown — they're logged and swallowed. The
 * caller (PUT /requisites) shouldn't fail just because the
 * convenience-cache update couldn't complete.
 */
export async function syncCompanyFieldsToMaster(
  accessToken: string,
  userEmail: string,
  companyId: string,
  fields: SyncFields
): Promise<void> {
  try {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2 });
    const sheets = google.sheets({ version: "v4", auth: oauth2 });

    const masterId = await findMasterSheetId(drive, userEmail);
    if (!masterId) {
      console.warn(
        "[sync-master] master sheet not found — skipping sync"
      );
      return;
    }

    // The list endpoint uses 01_companies; provisioning.ts comment
    // also says 01_companies. Sticking with that.
    const tabName = "01_companies";
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: masterId,
      range: `${tabName}!A:Z`,
    });

    const rows = response.data.values ?? [];
    if (rows.length < 2) {
      console.warn(`[sync-master] ${tabName} is empty — skipping sync`);
      return;
    }

    let header = rows[0] as string[];
    const dataRows = rows.slice(1);

    // Sesija 7 — auto-add missing columns to the header. Older
    // account-master sheets were provisioned before brand_color
    // and logo_drive_id were fields on 01_companies. Without
    // these columns, sync silently dropped updates. Detect and
    // append them on the fly so existing accounts get retro-
    // upgraded the first time they save branding.
    const requestedKeys = Object.keys(fields).filter(
      (k) => fields[k as keyof SyncFields] !== undefined
    );
    const missingKeys = requestedKeys.filter(
      (k) => !header.includes(k)
    );
    if (missingKeys.length > 0) {
      const newHeader = [...header, ...missingKeys];
      console.log(
        `[sync-master] auto-adding columns to ${tabName}: ${missingKeys.join(", ")}`
      );
      await sheets.spreadsheets.values.update({
        spreadsheetId: masterId,
        range: `${tabName}!A1:${columnLetter(newHeader.length)}1`,
        valueInputOption: "RAW",
        requestBody: { values: [newHeader] },
      });
      header = newHeader;
    }

    const idCol = header.indexOf("id");
    if (idCol < 0) {
      console.warn(`[sync-master] no 'id' column in ${tabName} header`);
      return;
    }

    // Find the row whose id matches
    const targetIdx = dataRows.findIndex((r) => (r[idCol] ?? "") === companyId);
    if (targetIdx < 0) {
      console.warn(
        `[sync-master] no row with id=${companyId} in ${tabName}`
      );
      return;
    }

    const targetRow = dataRows[targetIdx];
    const sheetRowNumber = targetIdx + 2; // +1 for header, +1 for 1-indexed

    // Build per-cell updates only for the fields the caller wants
    // changed AND which actually differ from the current value.
    const updates: Array<{ col: number; value: string }> = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      const colIdx = header.indexOf(key);
      if (colIdx < 0) continue;
      const current = (targetRow[colIdx] ?? "") as string;
      if (current === value) continue;
      updates.push({ col: colIdx, value });
    }

    // Always bump updated_at when we touch the row, so callers
    // watching for changes via timestamps see the modification.
    const updatedAtCol = header.indexOf("updated_at");
    if (updates.length > 0 && updatedAtCol >= 0) {
      updates.push({
        col: updatedAtCol,
        value: new Date().toISOString(),
      });
    }

    if (updates.length === 0) return; // nothing to write

    // Use batchUpdate to write all changed cells in one API call.
    // Each update specifies a range like '01_companies!C5:C5' and
    // a single-cell value matrix.
    const data = updates.map((u) => ({
      range: `${tabName}!${columnLetter(u.col + 1)}${sheetRowNumber}`,
      values: [[u.value]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: masterId,
      requestBody: {
        valueInputOption: "RAW",
        data,
      },
    });

    console.log(
      `[sync-master] updated ${updates.length} fields for ${companyId}`
    );
  } catch (err) {
    console.error("[sync-master] sync failed (non-fatal):", err);
    // Swallow — this is a convenience cache, not source of truth.
  }
}

/**
 * Convert a 1-indexed column number to the A1 column letter
 * (1 → 'A', 26 → 'Z', 27 → 'AA', etc).
 */
function columnLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
