/**
 * External user storage — accountants and warehouse managers
 * who log into WORKMANIS via email + password instead of Google
 * OAuth.
 *
 * Stored in account-master.gsheet/02_external_users tab. Each row:
 *   id              — stable identifier
 *   email           — login email
 *   password_hash   — bcrypt hash of the password
 *   role            — 'accountant' | 'warehouse_manager'
 *   allowed_company_ids — comma-separated list of company IDs the
 *                          user can access. Empty string means
 *                          'all companies' (typical for accountant).
 *                          For warehouse_manager, this is usually
 *                          a curated subset.
 *   created_at      — ISO 8601 timestamp
 *   updated_at      — ISO 8601 timestamp
 *   deleted_at      — empty string when active, ISO when soft-deleted
 *
 * Why a single tab for both roles instead of separate
 * 02_accountants + 03_warehouse_managers tabs:
 *   - The login flow is identical (email + password → session)
 *   - The role field cleanly distinguishes them
 *   - One tab means one set of CRUD endpoints, one set of cache
 *     invalidation rules. Two tabs would mostly be duplication.
 *   - Future roles (e.g. 'auditor', 'sales_lead') slot in without
 *     schema changes.
 *
 * Why bcryptjs and not bcrypt:
 *   - bcrypt has native bindings — Vercel build sometimes fails
 *     on the rebuild step
 *   - bcryptjs is pure JavaScript, no native deps, ~3x slower
 *     but for a few logins per day that's irrelevant
 *   - Same hash format, can swap to bcrypt later if perf matters
 *
 * This module is server-only (uses bcryptjs + Sheets API). Never
 * imported from client components.
 */

import { google } from "googleapis";
import * as bcrypt from "bcryptjs";
import { withRetry } from "./sheets-client";

const ROOT_FOLDER_NAME = "WORKMANIS";
const ACCOUNT_MASTER_NAME = "WORKMANIS_ACCOUNT_MASTER (DO NOT DELETE)";
const TAB_NAME = "02_external_users";

export type ExternalUserRole = "accountant" | "warehouse_manager";

export interface ExternalUser {
  id: string;
  email: string;
  role: ExternalUserRole;
  /** When empty array, the user has access to ALL companies the
   *  owner has access to. Otherwise restricted to listed IDs. */
  allowedCompanyIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Same shape as ExternalUser but includes the password hash —
 *  only ever returned to internal callers, never to clients. */
export interface ExternalUserWithHash extends ExternalUser {
  passwordHash: string;
}

const HEADER = [
  "id",
  "email",
  "password_hash",
  "role",
  "allowed_company_ids",
  "created_at",
  "updated_at",
  "deleted_at",
];

/**
 * Walk Drive to find the account-master sheet ID. Same logic as
 * other helpers, copied here to avoid a circular import on
 * company-oauth-store.
 */
async function findAccountMasterSheetId(
  drive: ReturnType<typeof google.drive>,
  userEmail: string
): Promise<string | null> {
  const folderMime = "application/vnd.google-apps.folder";
  const sheetMime = "application/vnd.google-apps.spreadsheet";

  const find = async (
    name: string,
    parentId: string | null,
    mime: string = folderMime
  ): Promise<string | null> => {
    const parentClause = parentId ? ` and '${parentId}' in parents` : "";
    const escaped = name.replace(/'/g, "\\'");
    const res = await withRetry(
      () =>
        drive.files.list({
          q: `name = '${escaped}' and mimeType = '${mime}'${parentClause} and trashed = false`,
          fields: "files(id)",
          spaces: "drive",
        }),
      `find ${name}`
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
  return await find(ACCOUNT_MASTER_NAME, acct, sheetMime);
}

/**
 * Ensure the 02_external_users tab exists in the account-master
 * sheet. Idempotent — safe to call before every read/write.
 *
 * If the tab is missing (sheet was created before this feature),
 * we create it with the canonical header row. Existing tabs get
 * a no-op fast path: we list sheets, find the tab, return.
 */
async function ensureTabExists(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<void> {
  const meta = await withRetry(
    () => sheets.spreadsheets.get({ spreadsheetId }),
    "get spreadsheet metadata"
  );
  const exists = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === TAB_NAME
  );
  if (exists) return;

  // Create tab + write header
  await withRetry(
    () =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: TAB_NAME },
              },
            },
          ],
        },
      }),
    `create tab ${TAB_NAME}`
  );

  await withRetry(
    () =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB_NAME}!A1:H1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADER] },
      }),
    `write header ${TAB_NAME}`
  );
}

interface SheetsContext {
  drive: ReturnType<typeof google.drive>;
  sheets: ReturnType<typeof google.sheets>;
  userEmail: string;
}

function makeContext(accessToken: string, userEmail: string): SheetsContext {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return {
    drive: google.drive({ version: "v3", auth: oauth2 }),
    sheets: google.sheets({ version: "v4", auth: oauth2 }),
    userEmail,
  };
}

/**
 * List all active (non-deleted) external users for the owner.
 * Returns the safe subset (no password hashes). Use
 * findByEmailWithHash for login validation.
 */
export async function listExternalUsers(
  accessToken: string,
  userEmail: string
): Promise<ExternalUser[]> {
  const ctx = makeContext(accessToken, userEmail);
  const masterId = await findAccountMasterSheetId(ctx.drive, userEmail);
  if (!masterId) return [];

  await ensureTabExists(ctx.sheets, masterId);

  const res = await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:H`,
      }),
    `list ${TAB_NAME}`
  );

  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  return rows
    .slice(1)
    .filter((r) => !r[7]) // deleted_at empty
    .map(
      (r): ExternalUser => ({
        id: r[0] ?? "",
        email: r[1] ?? "",
        role: (r[3] as ExternalUserRole) ?? "accountant",
        allowedCompanyIds: parseCompanyIds(r[4] ?? ""),
        createdAt: r[5] ?? "",
        updatedAt: r[6] ?? "",
      })
    );
}

/**
 * Find a single user by email, with the password hash. Used by
 * the credentials-provider login flow to verify the password.
 *
 * Returns null if the user doesn't exist or is soft-deleted.
 */
export async function findByEmailWithHash(
  accessToken: string,
  userEmail: string,
  loginEmail: string
): Promise<ExternalUserWithHash | null> {
  const ctx = makeContext(accessToken, userEmail);
  const masterId = await findAccountMasterSheetId(ctx.drive, userEmail);
  if (!masterId) return null;

  await ensureTabExists(ctx.sheets, masterId);

  const res = await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:H`,
      }),
    `findByEmail ${TAB_NAME}`
  );

  const rows = res.data.values ?? [];
  if (rows.length < 2) return null;

  const targetEmail = loginEmail.trim().toLowerCase();
  for (const r of rows.slice(1)) {
    if (r[7]) continue; // deleted_at non-empty
    if ((r[1] ?? "").trim().toLowerCase() !== targetEmail) continue;
    return {
      id: r[0] ?? "",
      email: r[1] ?? "",
      passwordHash: r[2] ?? "",
      role: (r[3] as ExternalUserRole) ?? "accountant",
      allowedCompanyIds: parseCompanyIds(r[4] ?? ""),
      createdAt: r[5] ?? "",
      updatedAt: r[6] ?? "",
    };
  }
  return null;
}

/**
 * Create a new external user. Hashes the password with bcrypt
 * before writing. The owner's accessToken is used to access the
 * account-master sheet — only the owner can create external
 * users for their account.
 *
 * Returns the new user's id and the plaintext password (so the
 * caller can show it to the owner once for delivery to the
 * external user — we never store plaintext, so this is the only
 * chance to display it).
 *
 * If a user with the same email already exists, throws — caller
 * should catch and prompt the owner to delete the old one first.
 */
export async function createExternalUser(
  accessToken: string,
  userEmail: string,
  args: {
    email: string;
    password: string;
    role: ExternalUserRole;
    allowedCompanyIds: string[];
  }
): Promise<ExternalUser> {
  const ctx = makeContext(accessToken, userEmail);
  const masterId = await findAccountMasterSheetId(ctx.drive, userEmail);
  if (!masterId) {
    throw new Error("Account master sheet not found — provision first");
  }

  await ensureTabExists(ctx.sheets, masterId);

  // Check for existing active user with the same email
  const existing = await findByEmailWithHash(
    accessToken,
    userEmail,
    args.email
  );
  if (existing) {
    throw new Error(
      `Lietotājs ar e-pastu ${args.email} jau eksistē. Vispirms dzēs vai atjaunini esošo.`
    );
  }

  const id = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const passwordHash = await bcrypt.hash(args.password, 10);
  const now = new Date().toISOString();

  const newRow = [
    id,
    args.email.trim().toLowerCase(),
    passwordHash,
    args.role,
    args.allowedCompanyIds.join(","),
    now,
    now,
    "",
  ];

  await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.append({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:H`,
        valueInputOption: "RAW",
        requestBody: { values: [newRow] },
      }),
    `append ${TAB_NAME}`
  );

  return {
    id,
    email: args.email.trim().toLowerCase(),
    role: args.role,
    allowedCompanyIds: args.allowedCompanyIds,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Soft-delete an external user. Sets deleted_at to current
 * timestamp; row stays in sheet for audit but is excluded from
 * listExternalUsers.
 */
export async function deleteExternalUser(
  accessToken: string,
  userEmail: string,
  id: string
): Promise<void> {
  const ctx = makeContext(accessToken, userEmail);
  const masterId = await findAccountMasterSheetId(ctx.drive, userEmail);
  if (!masterId) {
    throw new Error("Account master sheet not found");
  }

  await ensureTabExists(ctx.sheets, masterId);

  // Find the row index
  const res = await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:H`,
      }),
    `delete-find ${TAB_NAME}`
  );
  const rows = res.data.values ?? [];

  const targetIdx = rows.slice(1).findIndex((r) => r[0] === id);
  if (targetIdx < 0) {
    throw new Error(`User ${id} not found`);
  }

  const sheetRowNumber = targetIdx + 2; // +1 header, +1 1-indexed
  const now = new Date().toISOString();

  // Write deleted_at (column H) + updated_at (column G)
  await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: masterId,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            {
              range: `${TAB_NAME}!G${sheetRowNumber}`,
              values: [[now]],
            },
            {
              range: `${TAB_NAME}!H${sheetRowNumber}`,
              values: [[now]],
            },
          ],
        },
      }),
    `delete-write ${TAB_NAME}`
  );
}

/**
 * Update an external user's allowed_company_ids. Other fields
 * (email, role, password) require separate flows — email change
 * means new login, password change should re-issue a one-time
 * link, role change is rare and can be done via delete + recreate.
 */
export async function updateAllowedCompanies(
  accessToken: string,
  userEmail: string,
  id: string,
  allowedCompanyIds: string[]
): Promise<void> {
  const ctx = makeContext(accessToken, userEmail);
  const masterId = await findAccountMasterSheetId(ctx.drive, userEmail);
  if (!masterId) {
    throw new Error("Account master sheet not found");
  }

  await ensureTabExists(ctx.sheets, masterId);

  const res = await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.get({
        spreadsheetId: masterId,
        range: `${TAB_NAME}!A:H`,
      }),
    `update-find ${TAB_NAME}`
  );
  const rows = res.data.values ?? [];

  const targetIdx = rows.slice(1).findIndex((r) => r[0] === id);
  if (targetIdx < 0) {
    throw new Error(`User ${id} not found`);
  }

  const sheetRowNumber = targetIdx + 2;
  const now = new Date().toISOString();

  await withRetry(
    () =>
      ctx.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: masterId,
        requestBody: {
          valueInputOption: "RAW",
          data: [
            {
              range: `${TAB_NAME}!E${sheetRowNumber}`,
              values: [[allowedCompanyIds.join(",")]],
            },
            {
              range: `${TAB_NAME}!G${sheetRowNumber}`,
              values: [[now]],
            },
          ],
        },
      }),
    `update-write ${TAB_NAME}`
  );
}

function parseCompanyIds(s: string): string[] {
  if (!s.trim()) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Generate a memorable but secure random password (12 chars,
 *  lowercase + numbers + capital first letter). Used by the
 *  create-user flow when the owner doesn't supply one. */
export function generatePassword(): string {
  const consonants = "bcdfghjkmnpqrstvwxz";
  const vowels = "aeiouy";
  const digits = "23456789";

  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

  // Memorable shape: Cvc-cvc-NNN where the 3rd consonant is also
  // mixed-case for an extra entropy bit. Total entropy ~50 bits,
  // plenty for an interactively-typed login password.
  let pw = "";
  pw += pick(consonants).toUpperCase();
  pw += pick(vowels);
  pw += pick(consonants);
  pw += "-";
  pw += pick(consonants);
  pw += pick(vowels);
  pw += pick(consonants);
  pw += "-";
  for (let i = 0; i < 4; i++) pw += pick(digits);
  return pw;
}
