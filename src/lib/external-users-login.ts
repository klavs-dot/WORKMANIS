/**
 * External user login validation via service account.
 *
 * Validates email + password + ownerEmail against the owner's
 * account-master.gsheet/02_external_users tab. Returns the user
 * record on success, null on any failure.
 *
 * How it works:
 *   1. Look up owner sheet ID from OWNER_SHEET_REGISTRY env var.
 *      (Populated by the owner during service-account setup.)
 *   2. Get a Sheets API client authenticated as the service
 *      account (must have read access to the owner's sheet —
 *      owner explicitly shares it during setup).
 *   3. Read 02_external_users rows from that sheet.
 *   4. Find the row matching email (case-insensitive).
 *   5. Verify the row is not soft-deleted.
 *   6. bcrypt.compare(password, row.password_hash).
 *   7. On match: return the user record (id, email, role,
 *      ownerEmail, allowedCompanyIds).
 *
 * Returns null on ANY failure — wrong password, user doesn't
 * exist, owner not registered, service account misconfigured.
 * The login UI shows a generic "Nepareizs e-pasts vai parole"
 * to avoid information leakage about which step failed.
 */

import * as bcrypt from "bcryptjs";
import type { SessionRole } from "@/auth";
import {
  getServiceAccountSheetsClient,
  getOwnerSheetId,
} from "./service-account";

const TAB_NAME = "02_external_users";

/**
 * A pre-computed bcrypt hash used to equalise timing between "user
 * exists" and "user doesn't exist" code paths. Without this, an
 * attacker can probe valid emails by measuring response latency:
 * existing users → ~100 ms (bcrypt.compare), missing users → ~5 ms.
 * Hashing a throwaway password against this fixed hash burns the
 * same CPU so both branches finish in similar time.
 */
const DUMMY_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export interface ExternalUserLoginResult {
  id: string;
  email: string;
  role: SessionRole;
  ownerEmail: string;
  allowedCompanyIds: string[];
}

export async function validateExternalUserLogin(args: {
  email: string;
  password: string;
  ownerEmail: string;
}): Promise<ExternalUserLoginResult | null> {
  const email = args.email.trim().toLowerCase();
  const ownerEmail = args.ownerEmail.trim().toLowerCase();

  // 1. Look up owner sheet ID
  const sheetId = getOwnerSheetId(ownerEmail);
  if (!sheetId) {
    console.log(
      `[external-login] Owner ${ownerEmail} not in OWNER_SHEET_REGISTRY`
    );
    return null;
  }

  // 2. Get Sheets client as service account
  const sheets = await getServiceAccountSheetsClient();
  if (!sheets) {
    console.error(
      "[external-login] Service account not configured — login will fail"
    );
    return null;
  }

  // 3. Read 02_external_users rows
  let rows: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${TAB_NAME}!A:H`,
    });
    rows = (res.data.values ?? []) as string[][];
  } catch (err) {
    console.error(
      `[external-login] Failed to read ${TAB_NAME} from ${sheetId}:`,
      err
    );
    return null;
  }

  if (rows.length < 2) {
    // No users registered yet
    return null;
  }

  // 4. Find row by email (skip header at index 0)
  // Row schema: id | email | password_hash | role | allowed_company_ids
  //              | created_at | updated_at | deleted_at
  const matched = rows.slice(1).find((r) => {
    const rowEmail = (r[1] ?? "").trim().toLowerCase();
    const deletedAt = (r[7] ?? "").trim();
    return rowEmail === email && !deletedAt;
  });

  // 5. bcrypt verify — always run a compare to equalise timing
  // between matched/unmatched users (timing-oracle hardening).
  const passwordHash = matched?.[2] ?? "";
  let isValid = false;
  try {
    isValid = await bcrypt.compare(
      args.password,
      passwordHash || DUMMY_HASH
    );
  } catch (err) {
    console.error("[external-login] bcrypt.compare failed:", err);
    return null;
  }

  if (!matched || !passwordHash || !isValid) {
    // Don't differentiate between missing user / missing hash /
    // wrong password — the response time is identical (we ran
    // bcrypt.compare in every branch).
    return null;
  }

  // 6. Success — build login result
  const role = (matched[3] as SessionRole) ?? "warehouse_manager";
  if (role !== "accountant" && role !== "warehouse_manager") {
    console.error(`[external-login] Invalid role for ${email}: ${role}`);
    return null;
  }

  const allowedCompanyIds = (matched[4] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: matched[0] ?? "",
    email: matched[1] ?? "",
    role,
    ownerEmail,
    allowedCompanyIds,
  };
}
