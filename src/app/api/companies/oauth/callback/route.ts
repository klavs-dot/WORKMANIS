/**
 * GET /api/companies/oauth/callback
 *
 * Step 2 of the per-company OAuth flow. Google redirects here
 * with ?code=... and ?state=... after the user has approved
 * the consent screen.
 *
 * Flow:
 *   1. Verify state HMAC (CSRF + tamper protection)
 *   2. Verify state.userEmail matches current NextAuth session
 *      (defense against state-stealing attacks)
 *   3. Exchange code for { access_token, refresh_token, scope }
 *   4. Fetch the chosen Gmail address from /userinfo
 *   5. Provision the company (Drive folder + sheet + tabs)
 *      using the NEWLY granted access_token (not the user's
 *      session token!) so files end up in the chosen Gmail
 *      account's Drive
 *   6. Save encrypted refresh_token in 04_company_oauth
 *   7. Redirect user back to /uznemumi with success flag
 *
 * Why provision here vs in a separate endpoint:
 *   - The newly granted access_token is freshest right now.
 *     Postponing provisioning means we'd need to refresh the
 *     token first, doubling the API surface for failures.
 *   - The user expects "after I click 'Approve' the company is
 *     ready" — splitting into 'OAuth done, now click Provision'
 *     would be confusing.
 *
 * Error handling:
 *   - state invalid → return 400 with explanation
 *   - code exchange fails → 502 (Google error)
 *   - provisioning fails → 502 + cleanup (don't leak partial
 *     state into the OAuth registry)
 *
 * On success: 302 redirect to /uznemumi?created=<company_id>
 * so the page can show a success toast + activate the new
 * company.
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { provisionCompany, ProvisioningError } from "@/lib/provisioning";
import { saveCompanyOAuth } from "@/lib/company-oauth-store";
import { verifyState } from "@/lib/oauth-state";

// Provisioning takes 10-20s; OAuth callback budget needs to
// cover token exchange (~1s) + provisioning + token save (~1s).
// 60s gives plenty of headroom for slow networks.
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User clicked "Cancel" on Google's consent screen
  if (error) {
    console.warn(`OAuth cancelled by user: ${error}`);
    return NextResponse.redirect(
      new URL(`/uznemumi?oauth_error=${encodeURIComponent(error)}`, url.origin)
    );
  }

  if (!code || !stateToken) {
    return failRedirect(url.origin, "Missing code or state from Google");
  }

  // Verify state (HMAC + age + structure)
  const state = verifyState(stateToken);
  if (!state) {
    return failRedirect(
      url.origin,
      "OAuth state nav derīgs (varbūt expired). Mēģini vēlreiz."
    );
  }

  // Verify session matches state.userEmail — prevents an attacker
  // from sending a victim a malicious callback URL with a
  // pre-baked state for someone else's account.
  const session = await auth();
  if (!session?.user?.email) {
    return failRedirect(url.origin, "Sesija beigusies. Pieslēdzies vēlreiz.");
  }
  if (session.user.email !== state.userEmail) {
    console.error(
      `OAuth state email mismatch: state=${state.userEmail} session=${session.user.email}`
    );
    return failRedirect(url.origin, "OAuth nepareizs lietotājs.");
  }
  if (!session.accessToken) {
    return failRedirect(url.origin, "Sesijas tokens trūkst.");
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    return failRedirect(
      url.origin,
      "Servera konfigurācijas kļūda (AUTH_GOOGLE_ID/SECRET)"
    );
  }

  const redirectUri = `${url.origin}/api/companies/oauth/callback`;

  // ───── Step 1: exchange code for tokens ─────
  let tokenData: {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    id_token?: string;
  };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return failRedirect(
        url.origin,
        `Google token exchange failed: ${tokenRes.status}`
      );
    }
    tokenData = (await tokenRes.json()) as typeof tokenData;
  } catch (err) {
    console.error("Token exchange error:", err);
    return failRedirect(
      url.origin,
      err instanceof Error ? err.message : "Token exchange failed"
    );
  }

  if (!tokenData.refresh_token) {
    // Should be impossible because we forced prompt=consent, but
    // surface clearly if it happens (e.g. user revoked then
    // reconsented through a back-channel that omitted
    // access_type=offline)
    return failRedirect(
      url.origin,
      "Google neatgrieza refresh token. Atkārto pieslēgšanos."
    );
  }

  // ───── Step 2: fetch chosen Gmail address from /userinfo ─────
  // The user might have picked a different Gmail account than
  // their NextAuth login — we need to know which one for the
  // OAuth row's gmail_address field.
  let chosenEmail: string;
  try {
    const userinfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    if (!userinfoRes.ok) {
      throw new Error(`userinfo fetch ${userinfoRes.status}`);
    }
    const userinfo = (await userinfoRes.json()) as { email?: string };
    if (!userinfo.email) {
      throw new Error("userinfo had no email");
    }
    chosenEmail = userinfo.email;
  } catch (err) {
    console.error("userinfo fetch error:", err);
    return failRedirect(
      url.origin,
      "Google e-pasta noskaidrošana neizdevās"
    );
  }

  // ───── Step 3: provision the company ─────
  // CRITICAL: we use the NEW access_token (the one tied to the
  // chosen Gmail account), NOT the session token. This means
  // Drive folders + Sheets are created in the chosen Gmail's
  // Drive — exactly what the user expects from a multi-Gmail
  // architecture.
  let provisionResult;
  try {
    provisionResult = await provisionCompany(
      {
        accessToken: tokenData.access_token,
        userEmail: chosenEmail,
      },
      {
        name: state.companyData.name,
        legal_name: state.companyData.legal_name,
        reg_number: state.companyData.reg_number,
        vat_number: state.companyData.vat_number,
        address: state.companyData.legal_address,
        iban: state.companyData.iban,
      }
    );
  } catch (err) {
    if (err instanceof ProvisioningError) {
      console.error("Provisioning error during OAuth:", err);
      return failRedirect(
        url.origin,
        `Uzņēmuma izveide neizdevās: ${err.message}`
      );
    }
    console.error("Unknown provisioning error:", err);
    return failRedirect(
      url.origin,
      err instanceof Error ? err.message : "Provisioning failed"
    );
  }

  // ───── Step 4: save encrypted refresh token ─────
  // Store the refresh token in account-master.gsheet/04_company_oauth
  // so future operations on this company can use this Gmail
  // account's tokens, not the login user's session.
  //
  // Note: we use chosenEmail (not state.userEmail) for both
  // userEmail (where the account-master sheet lives) and
  // gmail_address (which Gmail account this connects to).
  // This is correct because if the user picked a different
  // Gmail, we ALSO want their account-master in that Gmail's
  // Drive — provisioning created it there.
  try {
    await saveCompanyOAuth({
      userAccessToken: tokenData.access_token,
      userEmail: chosenEmail,
      companyId: provisionResult.accountMasterCompanyId,
      gmailAddress: chosenEmail,
      refreshToken: tokenData.refresh_token,
      grantedScopes: (tokenData.scope ?? "").split(/\s+/).filter(Boolean),
    });
  } catch (err) {
    // Provisioning succeeded but token save failed — this is
    // recoverable. The user can re-connect Gmail later. We log
    // and continue with success redirect since the company is
    // usable, just won't auto-scan emails until reconnected.
    console.error(
      `Provisioning succeeded but token save failed for ${chosenEmail}:`,
      err
    );
  }

  // ───── Success: redirect to /uznemumi ─────
  const successUrl = new URL("/uznemumi", url.origin);
  successUrl.searchParams.set("created", provisionResult.accountMasterCompanyId);
  successUrl.searchParams.set("gmail", chosenEmail);
  return NextResponse.redirect(successUrl);
}

/**
 * Helper to redirect back to /uznemumi with an error message
 * surfaced as a query param. The page can pick this up and
 * show a toast / inline error.
 */
function failRedirect(origin: string, message: string): NextResponse {
  const target = new URL("/uznemumi", origin);
  target.searchParams.set("oauth_error", message);
  return NextResponse.redirect(target);
}
