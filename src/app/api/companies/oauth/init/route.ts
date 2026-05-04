/**
 * GET /api/companies/oauth/init
 *
 * Step 1 of the per-company Gmail/Drive/Sheets OAuth flow.
 *
 * The user has clicked "Pievienot Gmail kontu šim uzņēmumam"
 * in the add-company wizard. We need to send them to Google's
 * consent screen so they can pick which Gmail account owns
 * this company's data and approve our scopes.
 *
 * Why this lives outside NextAuth:
 *   - NextAuth handles the LOGIN flow (identity only)
 *   - This is a SECONDARY OAuth flow for per-company Drive +
 *     Sheets + Gmail access
 *   - The user can connect a DIFFERENT Gmail account for each
 *     company — NextAuth's single-token model doesn't support that
 *   - We control the redirect URI and token storage manually,
 *     letting us encrypt and shard tokens by company
 *
 * Flow:
 *   1. User authenticated via NextAuth (login session exists)
 *   2. Client opens this endpoint with ?company_name=Mosphera
 *   3. We generate a state token (CSRF protection), store
 *      pending company creation data in it (signed JWT)
 *   4. Redirect to Google OAuth with all needed scopes
 *   5. Google shows account picker + consent screen
 *   6. Google redirects back to /api/companies/oauth/callback
 *      with code + state
 *   7. Callback validates state, exchanges code for tokens,
 *      provisions company + saves encrypted refresh token
 *
 * Why state instead of session storage:
 *   - The OAuth flow leaves and returns to our app, possibly
 *     across browser navigations. Session storage might not
 *     survive (e.g. iOS Safari clears it on cross-domain redirects)
 *   - State token is signed (HMAC) so the callback can verify
 *     the data wasn't tampered with
 *   - State is single-use: we burn it on callback success
 *
 * The state token contains the form data the user already
 * filled in (company name, legal name, etc.) so they don't
 * have to re-enter after returning from Google.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import {
  signState,
  type PendingCompanyState,
} from "@/lib/oauth-state";

const COMPANY_OAUTH_SCOPES = [
  // Drive: per-app file scope. Lets us create / read / write
  // ONLY files our app creates, never the user's other Drive
  // content. This is the strongest privacy guarantee Google
  // offers — even if WORKMANIS were compromised, attackers
  // could not read the user's other Drive files.
  "https://www.googleapis.com/auth/drive.file",
  // Sheets: needed for company.gsheet operations. Note that
  // drive.file already covers the gsheet itself, but the
  // Sheets API requires this scope explicitly to read/write
  // cells via the structured API rather than the raw file
  // download endpoint.
  "https://www.googleapis.com/auth/spreadsheets",
  // Gmail readonly: lets the AI invoice scanner search inbox
  // and read message bodies + attachments. Cannot send, modify,
  // or delete. The user reviews this on the consent screen
  // and can decline (we'll detect the missing scope later and
  // surface a "reconnect for email scanning" CTA).
  "https://www.googleapis.com/auth/gmail.readonly",
  // userinfo.email: lets us know which Gmail address the user
  // chose. Required because the user might pick a different
  // account from what they're logged into NextAuth with — we
  // need to record that choice in the OAuth row.
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

  const data = body as Partial<PendingCompanyState["companyData"]>;
  if (!data?.name || !data.legal_name || !data.reg_number) {
    return NextResponse.json(
      {
        error:
          "Trūkst obligātie lauki: nosaukums, juridiskais nosaukums, reģistrācijas Nr",
      },
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

  // Determine the redirect URI. We use the same origin as the
  // current request — this means it Just Works in dev
  // (localhost:3000), preview deploys (some-preview.vercel.app),
  // and prod (workmanis.vercel.app) without per-env config.
  // Just remember to register both URIs in Google Cloud Console.
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/companies/oauth/callback`;

  const state: PendingCompanyState = {
    userEmail: session.user.email,
    companyData: data as PendingCompanyState["companyData"],
    nonce: randomBytes(16).toString("base64url"),
    issuedAt: Date.now(),
  };
  const stateToken = signState(state);

  // Build Google OAuth URL
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: COMPANY_OAUTH_SCOPES.join(" "),
    state: stateToken,
    // access_type=offline + prompt=consent guarantees we get a
    // refresh_token. Without these, Google may omit refresh_token
    // on subsequent consents to the same user.
    access_type: "offline",
    prompt: "consent select_account",
    // login_hint suggests the Gmail account but doesn't force
    // it — the user can still pick a different one. We pass
    // their NextAuth email as a sensible default.
    login_hint: session.user.email,
    // include_granted_scopes lets users grant additional scopes
    // incrementally without reconfirming earlier ones
    include_granted_scopes: "true",
  });

  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

  // Return the URL — client opens it in a popup or full redirect
  return NextResponse.json({ oauthUrl, stateNonce: state.nonce });
}
