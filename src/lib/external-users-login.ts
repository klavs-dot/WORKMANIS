/**
 * External user login validation.
 *
 * Validates an email + password + ownerEmail against the owner's
 * account-master.gsheet/02_external_users tab. Returns the user
 * record on success, null on any failure (wrong password, user
 * doesn't exist, owner sheet not found, etc).
 *
 * ═══ Why this is a placeholder ═══
 *
 * To validate the password, this function needs to read the
 * owner's Sheet — which requires the owner's OAuth tokens. But
 * the external user logging in DOESN'T HAVE the owner's tokens.
 *
 * The proper solution is one of:
 *   1. Service account (owner shares Sheet with service account,
 *      system uses service account creds to read for all logins)
 *   2. Vercel KV / Postgres storing owner refresh tokens, indexed
 *      by ownerEmail
 *   3. Encrypted shared cookie carrying owner tokens
 *
 * None of these are wired up yet. So this function currently
 * always returns null — external user login will fail with
 * "Login vēl tiek izstrādāts" until Faze 2 of the auth feature.
 *
 * Once Faze 2 lands, this function will:
 *   1. Look up owner refresh token by ownerEmail
 *   2. Use it to read 02_external_users
 *   3. Find row matching email
 *   4. bcrypt.compare(password, row.password_hash)
 *   5. Return the user record on match
 *
 * Why isolate this in its own file: it's a server-only concern
 * with bcrypt + Sheets imports. Keeping it out of auth.ts means
 * auth.ts stays light enough for the edge runtime where Auth.js
 * runs middleware checks.
 */

import type { SessionRole } from "@/auth";

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
  // PLACEHOLDER — actual validation requires delegated Sheets
  // access for the owner. See module docstring above for what
  // Faze 2 will do.
  //
  // For now we always return null so logins fail safely. The
  // login UI shows a clear error message about this being WIP.
  console.log(
    `[external-login] Validation requested for ${args.email} (owner: ${args.ownerEmail}) — placeholder, always rejects`
  );
  return null;
}
