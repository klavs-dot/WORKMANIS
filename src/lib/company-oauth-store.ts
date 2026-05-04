/**
 * Per-company OAuth token storage.
 *
 * Reads from / writes to account-master.gsheet/04_company_oauth.
 * Each row stores the encrypted refresh token for one (company,
 * gmail_address) pair. There's typically one row per company,
 * but in the future we could support multiple Gmail accounts
 * connected to the same company (e.g. a CFO's Gmail for invoices,
 * an admin's Gmail for receipts) — the schema doesn't preclude it.
 *
 * Why the row keying is (company_id, gmail_address) and not just
 * company_id:
 *   - If the user deletes a company and re-creates it under a
 *     different Gmail, the old row's company_id might be reused
 *     (if we ever change ID generation) — the gmail_address
 *     prevents stale token reuse.
 *   - If a user reconnects the same Gmail (re-consent flow),
 *     we update by (company_id, gmail_address) match, never
 *     create a duplicate.
 *
 * Token rotation: Google may issue a new refresh_token at any
 * time. When we exchange a code for tokens, we always upsert —
 * never assume the old row is fine.
 *
 * This file is server-only (uses Drive API + decryption). Never
 * imported from client components.
 */

import { google } from "googleapis";
import { withRetry } from "./sheets-client";
import {
  encryptToken,
  decryptToken,
  type EncryptedToken,
} from "./token-encryption";

const ROOT_FOLDER_NAME = "WORKMANIS";
const ACCOUNT_MASTER_NAME = "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)";
const TAB_NAME = "04_company_oauth";

/**
 * Granted OAuth scopes — Google sends these back in the token
 * response after consent. We store them so the UI can show
 * "Gmail not granted, click to reconsent" when the user wants
 * to enable email scanning later. Stored space-separated to
 * match Google's wire format.
 */
export interface CompanyOAuthRecord {
  companyId: string;
  gmailAddress: string;
  /** Decrypted access token-producing refresh token */
  refreshToken: string;
  grantedScopes: string[];
  grantedAt: string;
  lastUsedAt: string;
}

/**
 * Walk Drive to find the account-master sheet ID for this user.
 * Same logic as resolveCompany but extracted because we need it
 * before any company exists (during OAuth callback when we
 * haven't yet provisioned anything).
 */
async function findAccountMasterSheetId(
  drive: ReturnType<typeof google.drive>,
  userEmail: string
): Promise<string | null> {
  const folderMime = "application/vnd.google-apps.folder";
  const sheetMime = "application/vnd.google-apps.spreadsheet";

  const find = async (name: string, parentId: string | null) => {
    const parentClause = parentId ? ` and '${parentId}' in parents` : "";
    const escaped = name.replace(/'/g, "\\'");
    const res = await withRetry(
      () =>
        drive.files.list({
          q: `name = '${escaped}' and mimeType = '${folderMime}'${parentClause} and trashed = false`,
          fields: "files(id)",
          spaces: "drive",
        }),
      `find folder ${name}`
    );
    return res.data.files?.[0]?.id ?? null;
  };

  const root = await find(ROOT_FOLDER_NAME, null);
  if (!root) return null;
  const accounts = await find("accounts", root);
  if (!accounts) return null;
  const userFolder = await find(userEmail, accounts);
  if (!userFolder) return null;
  const acct = await find("_account", userFolder);
  if (!acct) return null;

  const escapedMaster = ACCOUNT_MASTER_NAME.replace(/'/g, "\\'");
  const sheetRes = await withRetry(
    () =>
      drive.files.list({
        q: `name = '${escapedMaster}' and mimeType = '${sheetMime}' and '${acct}' in parents and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    "find account-master"
  );
  return sheetRes.data.files?.[0]?.id ?? null;
}

/**
 * Save (or update) a company's OAuth tokens. Encrypts the
 * refresh token before writing.
 *
 * If a row for (company_id, gmail_address) already exists, it
 * gets updated (new token + new timestamps). Otherwise a new
 * row is appended. This handles re-consent gracefully — user
 * doesn't get a duplicate row each time they refresh.
 *
 * The userAccessToken parameter is the LOGIN session token —
 * needed to find/write to the account-master sheet (which lives
 * in the user's own Drive). NOT the per-company token; that's
 * what we're storing.
 */
export async function saveCompanyOAuth(args: {
  userAccessToken: string;
  userEmail: string;
  companyId: string;
  gmailAddress: string;
  refreshToken: string;
  grantedScopes: string[];
}): Promise<void> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: args.userAccessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  const masterId = await findAccountMasterSheetId(drive, args.userEmail);
  if (!masterId) {
    throw new Error(
      "Account-master sheet not found — user has no WORKMANIS root yet"
    );
  }

  const encrypted = encryptToken(args.refreshToken);
  const now = new Date().toISOString();

  // Read existing rows to find a match for upsert
  const valuesRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:Z`,
      }),
    `read ${TAB_NAME}`
  );
  const rows = valuesRes.data.values ?? [];

  const header =
    rows.length > 0
      ? (rows[0] as string[])
      : [
          "id",
          "created_at",
          "updated_at",
          "deleted_at",
          "company_id",
          "gmail_address",
          "refresh_token_encrypted",
          "iv",
          "auth_tag",
          "granted_scopes",
          "granted_at",
          "last_used_at",
        ];
  const idx = (col: string) => header.indexOf(col);

  // Find existing match (company_id + gmail_address)
  let matchIndex = -1;
  if (rows.length > 1 && idx("company_id") >= 0 && idx("gmail_address") >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (
        r[idx("company_id")] === args.companyId &&
        r[idx("gmail_address")] === args.gmailAddress &&
        !r[idx("deleted_at")]
      ) {
        matchIndex = i;
        break;
      }
    }
  }

  const buildRowValues = (id: string, createdAt: string): string[] => {
    const row = new Array(header.length).fill("");
    row[idx("id")] = id;
    row[idx("created_at")] = createdAt;
    row[idx("updated_at")] = now;
    row[idx("deleted_at")] = "";
    row[idx("company_id")] = args.companyId;
    row[idx("gmail_address")] = args.gmailAddress;
    row[idx("refresh_token_encrypted")] = encrypted.ciphertext;
    row[idx("iv")] = encrypted.iv;
    row[idx("auth_tag")] = encrypted.authTag;
    row[idx("granted_scopes")] = args.grantedScopes.join(" ");
    row[idx("granted_at")] = createdAt;
    row[idx("last_used_at")] = now;
    return row;
  };

  if (matchIndex >= 0) {
    // Update existing row in place — preserves the original
    // granted_at so we can audit when the connection started
    const existing = rows[matchIndex];
    const id = existing[idx("id")] as string;
    const createdAt = (existing[idx("created_at")] as string) || now;
    const newRow = buildRowValues(id, createdAt);
    // Keep original granted_at if present
    if (existing[idx("granted_at")]) {
      newRow[idx("granted_at")] = existing[idx("granted_at")] as string;
    }
    // sheet rows are 1-indexed; matchIndex is 0-indexed within
    // values array (where rows[0] is header). matchIndex + 1
    // gives the actual sheet row number.
    const sheetRowNum = matchIndex + 1;
    await withRetry(
      () =>
        sheets.spreadsheets.values.update({
          spreadsheetId: masterId,
          range: `${TAB_NAME}!A${sheetRowNum}:Z${sheetRowNum}`,
          valueInputOption: "RAW",
          requestBody: { values: [newRow] },
        }),
      `update ${TAB_NAME} row`
    );
  } else {
    // Append new row
    const newId = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newRow = buildRowValues(newId, now);
    await withRetry(
      () =>
        sheets.spreadsheets.values.append({
          spreadsheetId: masterId,
          range: `${TAB_NAME}!A:Z`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [newRow] },
        }),
      `append ${TAB_NAME}`
    );
  }
}

/**
 * Retrieve a company's OAuth credentials. Returns null if no
 * row found (company has no Gmail connected).
 *
 * Updates last_used_at on success — useful for audit and for
 * future "this connection is stale, please reconnect" UX.
 */
export async function loadCompanyOAuth(args: {
  userAccessToken: string;
  userEmail: string;
  companyId: string;
}): Promise<CompanyOAuthRecord | null> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: args.userAccessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  const masterId = await findAccountMasterSheetId(drive, args.userEmail);
  if (!masterId) return null;

  const valuesRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:Z`,
      }),
    `read ${TAB_NAME}`
  );
  const rows = valuesRes.data.values ?? [];
  if (rows.length < 2) return null;

  const header = rows[0] as string[];
  const idx = (col: string) => header.indexOf(col);
  if (idx("company_id") < 0 || idx("refresh_token_encrypted") < 0) {
    return null;
  }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (
      r[idx("company_id")] === args.companyId &&
      !r[idx("deleted_at")]
    ) {
      const encrypted: EncryptedToken = {
        ciphertext: r[idx("refresh_token_encrypted")] as string,
        iv: r[idx("iv")] as string,
        authTag: r[idx("auth_tag")] as string,
      };

      let refreshToken: string;
      try {
        refreshToken = decryptToken(encrypted);
      } catch (err) {
        console.error(
          `Failed to decrypt OAuth token for company ${args.companyId}:`,
          err
        );
        return null;
      }

      // Update last_used_at — fire and forget. If this fails it's
      // just a missed timestamp, not a fatal error for the caller.
      const sheetRowNum = i + 1;
      const lastUsedCol = idx("last_used_at");
      if (lastUsedCol >= 0) {
        const colLetter = String.fromCharCode(65 + lastUsedCol);
        sheets.spreadsheets.values
          .update({
            spreadsheetId: masterId,
            range: `${TAB_NAME}!${colLetter}${sheetRowNum}`,
            valueInputOption: "RAW",
            requestBody: { values: [[new Date().toISOString()]] },
          })
          .catch((err) => {
            console.warn("Failed to update last_used_at:", err);
          });
      }

      return {
        companyId: r[idx("company_id")] as string,
        gmailAddress: r[idx("gmail_address")] as string,
        refreshToken,
        grantedScopes: ((r[idx("granted_scopes")] as string) || "")
          .split(/\s+/)
          .filter(Boolean),
        grantedAt: (r[idx("granted_at")] as string) || "",
        lastUsedAt: (r[idx("last_used_at")] as string) || "",
      };
    }
  }
  return null;
}

/**
 * Soft-delete a company's OAuth row. Called from the company
 * delete endpoint so revoked Gmail connections don't linger
 * after a company is removed.
 *
 * We soft-delete (deleted_at = now) rather than hard-delete to
 * preserve audit history — useful for "when did this company's
 * Gmail get disconnected" questions later.
 */
export async function deleteCompanyOAuth(args: {
  userAccessToken: string;
  userEmail: string;
  companyId: string;
}): Promise<void> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: args.userAccessToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const sheets = google.sheets({ version: "v4", auth: oauth2 });

  const masterId = await findAccountMasterSheetId(drive, args.userEmail);
  if (!masterId) return;

  const valuesRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:Z`,
      }),
    `read ${TAB_NAME}`
  );
  const rows = valuesRes.data.values ?? [];
  if (rows.length < 2) return;

  const header = rows[0] as string[];
  const idx = (col: string) => header.indexOf(col);
  if (idx("company_id") < 0 || idx("deleted_at") < 0) return;

  const now = new Date().toISOString();
  const deletedColLetter = String.fromCharCode(65 + idx("deleted_at"));
  const updatedColLetter = String.fromCharCode(65 + idx("updated_at"));

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[idx("company_id")] === args.companyId && !r[idx("deleted_at")]) {
      const sheetRowNum = i + 1;
      // Update deleted_at + updated_at columns
      try {
        await withRetry(
          () =>
            sheets.spreadsheets.values.update({
              spreadsheetId: masterId,
              range: `${TAB_NAME}!${deletedColLetter}${sheetRowNum}`,
              valueInputOption: "RAW",
              requestBody: { values: [[now]] },
            }),
          `soft-delete ${TAB_NAME} row`
        );
        if (idx("updated_at") >= 0) {
          await withRetry(
            () =>
              sheets.spreadsheets.values.update({
                spreadsheetId: masterId,
                range: `${TAB_NAME}!${updatedColLetter}${sheetRowNum}`,
                valueInputOption: "RAW",
                requestBody: { values: [[now]] },
              }),
            `update updated_at`
          );
        }
      } catch (err) {
        console.warn(
          `Failed to soft-delete OAuth row for ${args.companyId}:`,
          err
        );
      }
      // Don't break — there may be multiple gmail addresses for
      // the same company. Soft-delete all of them.
    }
  }
}
