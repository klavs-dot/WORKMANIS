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
 *   - HMAC-SHA256 over base64url(payload) using AUTH_SECRET as key
 *   - Verifying the HMAC proves the data wasn't tampered with
 *   - 10-minute TTL prevents replay attacks where an attacker
 *     somehow captures a valid state and tries to reuse it later
 *   - State includes userEmail; callback verifies it matches
 *     the current NextAuth session, blocking cross-user attacks
 *
 * Wire format:
 *   v2 (current): `v2.<base64url(gzip(JSON))>.<base64url(HMAC)>`
 *   v1 (legacy):  `<base64url(JSON)>.<base64url(HMAC)>`
 *
 * v2 was introduced after a 2KB-ish risk: company forms with long
 * legal/delivery addresses + a few Latvian-character-heavy strings
 * could push the raw-JSON token past Google's recommended state
 * parameter ceiling. Gzipping the JSON before encoding shaves
 * 40-70% off typical payloads. We still accept v1 tokens for the
 * 10-minute window during a rolling deploy.
 */

import { createHmac } from "crypto";
import { gzipSync, gunzipSync } from "zlib";

const STATE_VERSION = "v2";
/**
 * Soft warning threshold — actual Google `state` param limit is
 * ~2KB. We log a warning over 1500 chars so we notice creeping
 * payload growth before it actually breaks.
 */
const STATE_WARN_BYTES = 1500;

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
 * Sign a state object with HMAC-SHA256 over the gzipped JSON
 * payload. Output:
 *   v2.<base64url(gzip(JSON))>.<base64url(HMAC)>
 */
export function signState(state: PendingCompanyState): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET not set — cannot sign OAuth state");
  }
  const json = JSON.stringify(state);
  const compressed = gzipSync(Buffer.from(json, "utf8"));
  const b64 = compressed.toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  const token = `${STATE_VERSION}.${b64}.${sig}`;
  if (token.length > STATE_WARN_BYTES) {
    console.warn(
      `[oauth-state] Token is ${token.length} bytes (${Math.round((token.length / 2048) * 100)}% of Google's 2KB ceiling); consider trimming companyData fields.`
    );
  }
  return token;
}

/**
 * Constant-time HMAC compare. Returns false on length mismatch or
 * any byte difference.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Verify and decode a state string. Accepts both wire formats:
 *   v2.<base64url(gzip(JSON))>.<base64url(HMAC)>  (current)
 *   <base64url(JSON)>.<base64url(HMAC)>           (legacy, accepted
 *                                                  during rollover)
 *
 * Returns null on:
 *   - missing AUTH_SECRET
 *   - malformed token (wrong number of parts)
 *   - HMAC mismatch (tampered)
 *   - state older than 10 minutes (replay protection)
 *   - gzip / JSON parse failure
 */
export function verifyState(token: string): PendingCompanyState | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const parts = token.split(".");

  let payload: string;
  let sig: string;
  let isV2: boolean;
  if (parts.length === 3 && parts[0] === STATE_VERSION) {
    payload = parts[1];
    sig = parts[2];
    isV2 = true;
  } else if (parts.length === 2) {
    payload = parts[0];
    sig = parts[1];
    isV2 = false;
  } else {
    return null;
  }

  const expectedSig = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  if (!constantTimeEqual(sig, expectedSig)) return null;

  try {
    const raw = Buffer.from(payload, "base64url");
    const json = isV2
      ? gunzipSync(raw).toString("utf8")
      : raw.toString("utf8");
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
