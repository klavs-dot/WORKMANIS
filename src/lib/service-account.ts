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
