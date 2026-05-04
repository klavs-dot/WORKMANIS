/**
 * Get authenticated Google API clients for a specific company.
 *
 * This is the core helper that other code calls to operate on
 * company data using the COMPANY's OAuth tokens (not the
 * login user's session token).
 *
 * The flow:
 *   1. Load the encrypted refresh_token from
 *      04_company_oauth (using user's session to read the sheet)
 *   2. Decrypt it
 *   3. Exchange refresh_token → fresh access_token via Google
 *   4. Return google.drive() / google.sheets() / google.gmail()
 *      clients pre-configured with that access_token
 *
 * Callers should use these clients for ALL operations on a
 * given company, not the user's session-bound clients. That's
 * what makes the multi-Gmail architecture work — files live
 * in the chosen Gmail's Drive, not the login user's.
 *
 * Why we don't cache access tokens:
 *   - Access tokens expire in 1 hour — caching them in memory
 *     across requests is fine in theory but risks stale-token
 *     errors after Vercel function cold starts
 *   - The refresh request is fast (~200ms) and only needed once
 *     per request anyway
 *   - Adding a cache would mean cache invalidation logic, key
 *     management, etc. — not worth it at this scale
 *
 * If we ever need this, we can add a per-instance LRU keyed by
 * (companyId, gmailAddress) with TTL=55min.
 */

import { google } from "googleapis";
import { auth } from "@/auth";
import { resolveCompany } from "./resolve-company";
import { loadCompanyOAuth } from "./company-oauth-store";

export interface CompanyClients {
  /** Drive v3 client tied to the company's Gmail */
  drive: ReturnType<typeof google.drive>;
  /** Sheets v4 client tied to the company's Gmail */
  sheets: ReturnType<typeof google.sheets>;
  /** Gmail v1 client tied to the company's Gmail */
  gmail: ReturnType<typeof google.gmail>;
  /** The fresh access token, in case callers need it directly */
  accessToken: string;
  /** The Gmail address that owns this company */
  gmailAddress: string;
  /** The company metadata from resolveCompany */
  company: {
    companyId: string;
    sheetId: string;
    folderId: string;
    name: string;
    slug: string;
  };
  /** Scopes actually granted at consent time — useful for
   *  surfacing "needs reconsent" UX when Gmail isn't allowed */
  grantedScopes: string[];
}

/**
 * Custom error thrown when a company has no OAuth row. Callers
 * can catch this specifically to show a "reconnect Gmail" CTA
 * rather than a generic 500.
 */
export class NoCompanyOAuthError extends Error {
  constructor(public readonly companyId: string) {
    super(`Company ${companyId} has no OAuth tokens connected`);
    this.name = "NoCompanyOAuthError";
  }
}

/**
 * Get authenticated clients for the given company. Throws
 * NoCompanyOAuthError if no Gmail is connected, or generic
 * Error for other failures (network, decryption, etc.).
 *
 * IMPORTANT: this requires an active NextAuth session — it
 * uses the user's session token to find the account-master
 * sheet and read the encrypted token row. The returned
 * clients are NOT tied to that session; they use the
 * company's own OAuth credentials.
 */
export async function getCompanyClients(
  companyId: string
): Promise<CompanyClients> {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    throw new Error("Not authenticated");
  }

  // Resolve company — confirms user owns it, gets folder/sheet IDs
  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  // Load encrypted OAuth record from account-master
  const oauth = await loadCompanyOAuth({
    userAccessToken: session.accessToken,
    userEmail: session.user.email,
    companyId,
  });
  if (!oauth) {
    throw new NoCompanyOAuthError(companyId);
  }

  // Exchange refresh token for fresh access token
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "AUTH_GOOGLE_ID/SECRET not set — cannot refresh OAuth tokens"
    );
  }

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: oauth.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!refreshRes.ok) {
    const errText = await refreshRes.text();
    // Common case: user revoked access from
    // myaccount.google.com → refresh_token is dead. Surface
    // this clearly so UI can prompt reconnection.
    if (refreshRes.status === 400 && errText.includes("invalid_grant")) {
      throw new NoCompanyOAuthError(companyId);
    }
    throw new Error(
      `Token refresh failed (${refreshRes.status}): ${errText}`
    );
  }

  const tokenData = (await refreshRes.json()) as {
    access_token: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokenData.access_token) {
    throw new Error("Token refresh returned no access_token");
  }

  // Build clients with the fresh access token
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: tokenData.access_token });

  return {
    drive: google.drive({ version: "v3", auth: oauth2 }),
    sheets: google.sheets({ version: "v4", auth: oauth2 }),
    gmail: google.gmail({ version: "v1", auth: oauth2 }),
    accessToken: tokenData.access_token,
    gmailAddress: oauth.gmailAddress,
    company: {
      companyId: company.companyId,
      sheetId: company.sheetId,
      folderId: company.folderId,
      name: company.name,
      slug: company.slug,
    },
    grantedScopes: oauth.grantedScopes,
  };
}

/**
 * Quick check whether a company has Gmail/Drive/Sheets
 * connected. Useful for UI to show "reconnect" CTAs without
 * paying the full token refresh cost.
 *
 * Returns:
 *   { connected: false }                              - no row
 *   { connected: true, scopes: [...] }                - row exists
 */
export async function checkCompanyConnection(
  companyId: string
): Promise<
  | { connected: false }
  | { connected: true; gmailAddress: string; scopes: string[] }
> {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return { connected: false };
  }

  const oauth = await loadCompanyOAuth({
    userAccessToken: session.accessToken,
    userEmail: session.user.email,
    companyId,
  });
  if (!oauth) return { connected: false };

  return {
    connected: true,
    gmailAddress: oauth.gmailAddress,
    scopes: oauth.grantedScopes,
  };
}
