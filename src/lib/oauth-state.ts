/**
 * OAuth state signing/verification — used by the per-company
 * OAuth flow (init/route.ts and callback/route.ts).
 *
 * Why this lives outside the route files: Next.js route handlers
 * can only export HTTP method names (GET/POST/etc.) and a small
 * set of config exports (maxDuration, runtime). Exporting
 * arbitrary helpers like signState/verifyState fails the build.
 * So the helpers move to /lib and both routes import from here.
 *
 * The state token carries the company form data through Google's
 * OAuth round-trip. Without it, the user would have to refill
 * the form after returning from Google — bad UX.
 *
 * Security model:
 *   - HMAC-SHA256 over base64url(JSON) using AUTH_SECRET as key
 *   - Verifying the HMAC proves the data wasn't tampered with
 *   - 10-minute TTL prevents replay attacks where an attacker
 *     somehow captures a valid state and tries to reuse it later
 *   - State includes userEmail; callback verifies it matches
 *     the current NextAuth session, blocking cross-user attacks
 */

import { createHmac } from "crypto";

export interface PendingCompanyState {
  /** Owner email — matches NextAuth session, prevents cross-user state hijack */
  userEmail: string;
  /**
   * Flow mode:
   *   "create"    — provisions a new company in chosen Gmail's Drive
   *                 (default; companyData is required)
   *   "reconnect" — refreshes OAuth tokens for an EXISTING company
   *                 (existingCompanyId is required; companyData ignored)
   *
   * Optional for backwards compatibility — if absent, treated as "create"
   * to match pre-Sesija-3 callbacks still in flight.
   */
  mode?: "create" | "reconnect";
  /**
   * For reconnect mode only — the company we're refreshing tokens
   * for. Callback validates this exists in the user's account-master
   * before saving new tokens (prevents state-token spoofing).
   */
  existingCompanyId?: string;
  /** Company form data carried through the OAuth round-trip (create mode) */
  companyData: {
    name: string;
    legal_name: string;
    reg_number: string;
    vat_number?: string;
    legal_address?: string;
    delivery_address?: string;
    contact_email?: string;
    invoice_email?: string;
    iban?: string;
    bank_name?: string;
    swift?: string;
    phone?: string;
    website?: string;
    brand_color?: string;
  };
  /** Random nonce for CSRF — verified on callback */
  nonce: string;
  /** When state was issued — reject if older than 10 min */
  issuedAt: number;
}

/**
 * Sign a state object with HMAC-SHA256. Output:
 *   <base64url(JSON)>.<base64url(HMAC)>
 */
export function signState(state: PendingCompanyState): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET not set — cannot sign OAuth state");
  }
  const json = JSON.stringify(state);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

/**
 * Verify and decode a state string. Returns null on:
 *   - missing AUTH_SECRET
 *   - malformed token (wrong number of parts)
 *   - HMAC mismatch (tampered)
 *   - state older than 10 minutes (replay protection)
 *   - JSON parse failure
 */
export function verifyState(token: string): PendingCompanyState | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [b64, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(b64).digest("base64url");

  // Constant-time compare to prevent timing attacks
  if (sig.length !== expectedSig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    const state = JSON.parse(json) as PendingCompanyState;
    // Reject states older than 10 min
    if (Date.now() - state.issuedAt > 10 * 60 * 1000) {
      console.warn(
        `OAuth state expired: issued ${
          Math.round((Date.now() - state.issuedAt) / 1000)
        }s ago`
      );
      return null;
    }
    return state;
  } catch {
    return null;
  }
}
