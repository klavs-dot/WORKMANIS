/**
 * Warehouse Sheet bootstrap.
 *
 * Looks up or creates the global 'Workmanis_noliktava' Sheet for the
 * authenticated user. Per the user's spec, this is a single sheet
 * shared across all companies (intentionally distinct from the per-
 * company sheets used elsewhere in WORKMANIS).
 *
 * Caches the discovered sheet ID in localStorage on the client (via
 * the route handler) so we don't have to do a Drive search on every
 * request.
 *
 * Pattern: same idempotent 'find then create' approach as the per-
 * company provisioning, just without the folder hierarchy. The sheet
 * lives at the user's Drive root by default — they can move it
 * anywhere they want without breaking anything (we look it up by
 * name, not path).
 */

import { google, type sheets_v4 } from "googleapis";
import { ensureTabsAndHeaders } from "./provisioning";
import { WAREHOUSE_SHEET_NAME, WAREHOUSE_TABS } from "./warehouse-schema";

/**
 * Get the spreadsheet ID for the user's warehouse sheet, creating
 * the sheet (and all required tabs/headers) if it doesn't exist yet.
 *
 * Idempotent: safe to call on every request. The Drive search is
 * the slow path (~200ms); subsequent ensure-tabs is cheap.
 */
export async function getOrCreateWarehouseSheet(
  accessToken: string
): Promise<string> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  // Search for an existing sheet by name. drive.file scope only sees
  // files our app created or that the user explicitly opened via
  // Picker — fine here, since this sheet is created BY the app.
  const search = await drive.files.list({
    q: `name = '${escapeForQuery(WAREHOUSE_SHEET_NAME)}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });

  let sheetId = search.data.files?.[0]?.id;

  if (!sheetId) {
    // Create the spreadsheet at Drive root. User can move it later.
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title: WAREHOUSE_SHEET_NAME } },
    });
    sheetId = created.data.spreadsheetId;
    if (!sheetId) {
      throw new Error("Warehouse sheet creation returned no ID");
    }
  }

  // Ensure all 5 tabs exist with correct headers. Idempotent — does
  // nothing if everything is already in place.
  await ensureTabsAndHeaders(
    sheets,
    sheetId,
    WAREHOUSE_TABS.map((t) => ({ name: t.name, cols: [...t.cols] }))
  );

  return sheetId;
}

function escapeForQuery(s: string): string {
  return s.replace(/'/g, "\\'");
}
