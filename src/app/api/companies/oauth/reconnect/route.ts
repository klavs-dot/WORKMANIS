/**
 * POST /api/companies/oauth/reconnect
 *
 * Starts an OAuth flow for an EXISTING company. Use this when:
 *   - The user previously declined Gmail scope and wants to add it
 *   - The refresh token was revoked (e.g. via myaccount.google.com)
 *   - The user wants to switch the company to a different Gmail account
 *
 * Differs from /init in that it doesn't carry company form data
 * (the company already exists). Instead it carries existingCompanyId
 * which the callback uses to:
 *   1. Skip provisioning (no new Drive folder / Sheet)
 *   2. Update the 04_company_oauth row in place rather than insert
 *
 * Request body: { company_id: string }
 * Response:     { oauthUrl: string }
 *
 * The redirect flow is identical to /init from here on:
 *   client → window.location.href = oauthUrl
 *   Google consent screen
 *   → /api/companies/oauth/callback
 *   → redirect back to /uznemumi?reconnected=ID
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import {
  signState,
  type PendingCompanyState,
} from "@/lib/oauth-state";

const COMPANY_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { company_id: companyId } =
    (body as { company_id?: string }) ?? {};
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Google OAuth nav konfigurēts (AUTH_GOOGLE_ID trūkst)" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/companies/oauth/callback`;

  // Build a reconnect-mode state. companyData is left empty — the
  // callback won't read it because mode=reconnect skips
  // provisioning. We carry the existingCompanyId so the callback
  // can target the right OAuth row when saving new tokens.
  const state: PendingCompanyState = {
    userEmail: session.user.email,
    mode: "reconnect",
    existingCompanyId: companyId,
    companyData: {
      // Empty placeholders — required by the type, ignored at callback
      name: "",
      legal_name: "",
      reg_number: "",
    },
    nonce: randomBytes(16).toString("base64url"),
    issuedAt: Date.now(),
  };
  const stateToken = signState(state);

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: COMPANY_OAUTH_SCOPES.join(" "),
    state: stateToken,
    access_type: "offline",
    // 'consent' here even on reconnect — we WANT a fresh
    // refresh_token even if the user has already approved this
    // app for this Google account. Without prompt=consent, Google
    // sometimes omits refresh_token on subsequent grants.
    prompt: "consent select_account",
    login_hint: session.user.email,
    include_granted_scopes: "true",
  });

  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;
  return NextResponse.json({ oauthUrl });
}
