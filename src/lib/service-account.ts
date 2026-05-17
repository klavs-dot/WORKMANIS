/**
 * Service account authentication helper.
 *
 * Used for delegated Sheets access when there's no user OAuth
 * session available — specifically for the external user login
 * flow (accountants and warehouse managers). They authenticate
 * with email + password, not Google OAuth, so we have no user
 * tokens to call Sheets with.
 *
 * The service account is granted READ access to each owner's
 * account-master sheet by the owner sharing the sheet with the
 * service account's email address. The sheet ID per owner is
 * stored in OWNER_SHEET_REGISTRY env variable (JSON map).
 *
 * Why service account and not OAuth-on-behalf-of:
 *   - OAuth-on-behalf-of requires the owner to be online to grant
 *     and refresh tokens. External users log in independently —
 *     the owner might not even be aware.
 *   - Service account auth is server-to-server, no user UI flow,
 *     works at any time.
 *   - Trade-off: the owner must explicitly share their sheet with
 *     the service account email. One-time setup step.
 *
 * Required env variables:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — JSON key file content (the entire
 *                                  JSON, base64-encoded for safe
 *                                  storage in Vercel env). Generated
 *                                  in Google Cloud Console:
 *                                    IAM → Service Accounts → [acct]
 *                                    → Keys → Add Key → JSON
 *   OWNER_SHEET_REGISTRY        — JSON map of ownerEmail to
 *                                  accountMasterSheetId. Populated
 *                                  by owner OAuth flow.
 *                                  Example:
 *                                  {"klavs@example.com": "1abc...xyz"}
 *
 * Granted scopes:
 *   spreadsheets — read 02_external_users for login validation
 *   spreadsheets — read 01_companies for allowed-company filtering
 *
 * Drive scope NOT needed: service account never walks the user's
 * Drive folder hierarchy. It reads a known sheet ID directly.
 */

import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Get a Google Sheets client authenticated as the service account.
 * Returns null if the service account isn't configured (env vars
 * missing) — caller should treat that as a clear configuration
 * error and surface a helpful message to the user/owner.
 */
export async function getServiceAccountSheetsClient(): Promise<ReturnType<
  typeof google.sheets
> | null> {
  const keyJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJsonBase64) {
    console.warn(
      "[service-account] GOOGLE_SERVICE_ACCOUNT_KEY env var not set"
    );
    return null;
  }

  let credentials: { client_email: string; private_key: string };
  try {
    const decoded = Buffer.from(keyJsonBase64, "base64").toString("utf8");
    credentials = JSON.parse(decoded);
  } catch (err) {
    console.error(
      "[service-account] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:",
      err
    );
    return null;
  }

  if (!credentials.client_email || !credentials.private_key) {
    console.error(
      "[service-account] Key JSON missing client_email or private_key"
    );
    return null;
  }

  const jwt = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
  });

  return google.sheets({ version: "v4", auth: jwt });
}

/**
 * Look up the account-master sheet ID for a given owner email.
 * Returns null if no entry exists — the owner hasn't been
 * registered in OWNER_SHEET_REGISTRY yet (this happens
 * automatically on owner Google OAuth login).
 */
export function getOwnerSheetId(ownerEmail: string): string | null {
  const registryJson = process.env.OWNER_SHEET_REGISTRY;
  if (!registryJson) return null;

  try {
    const registry = JSON.parse(registryJson) as Record<string, string>;
    return registry[ownerEmail.trim().toLowerCase()] ?? null;
  } catch (err) {
    console.error(
      "[service-account] Failed to parse OWNER_SHEET_REGISTRY:",
      err
    );
    return null;
  }
}

/**
 * Get the service account's email address — useful for showing
 * the owner exactly which email to share their sheet with during
 * setup. Read from the JSON key.
 */
export function getServiceAccountEmail(): string | null {
  const keyJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJsonBase64) return null;
  try {
    const decoded = Buffer.from(keyJsonBase64, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed.client_email ?? null;
  } catch {
    return null;
  }
}

/**
 * Reserved settings key for the warehouse sheet ID stored on the
 * `03_settings` tab of the owner's account-master sheet. Once
 * populated (by `getOrCreateWarehouseSheet` during owner-side
 * provisioning), a service-account-authenticated caller can read
 * this value to learn which sheet to query on behalf of an external
 * warehouse_manager session that has no Google OAuth credentials.
 *
 * Not yet wired end-to-end — see docs/EXTERNAL_USERS_GAP.md. This
 * helper exists so the data-storage side can land independently of
 * the route-handler refactor.
 */
export const WAREHOUSE_SHEET_SETTING_KEY = "warehouse_sheet_id";

/**
 * Read a single key from the owner's `03_settings` tab using service
 * account credentials. Returns null when:
 *   - service account isn't configured,
 *   - the owner doesn't have a registered account-master sheet,
 *   - the `03_settings` tab is empty / missing,
 *   - the key is absent.
 *
 * All failures degrade silently (return null) — the calling code is
 * expected to fall back to the legacy owner-OAuth path.
 */
export async function getOwnerSettingViaServiceAccount(
  ownerEmail: string,
  key: string
): Promise<string | null> {
  if (!ownerEmail || !key) return null;

  const sheetId = getOwnerSheetId(ownerEmail);
  if (!sheetId) return null;

  const sheets = await getServiceAccountSheetsClient();
  if (!sheets) return null;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "03_settings!A:Z",
    });
    const rows = response.data.values ?? [];
    if (rows.length < 2) return null;

    const header = rows[0].map((c) => String(c).trim().toLowerCase());
    const keyCol = header.indexOf("key");
    const valueCol = header.indexOf("value");
    if (keyCol === -1 || valueCol === -1) return null;

    for (const row of rows.slice(1)) {
      if (String(row[keyCol] ?? "").trim() === key) {
        const value = row[valueCol];
        return value ? String(value) : null;
      }
    }
    return null;
  } catch (err) {
    console.warn(
      `[service-account] Failed reading ${key} from owner ${ownerEmail}'s 03_settings:`,
      err
    );
    return null;
  }
}
