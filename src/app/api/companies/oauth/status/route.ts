/**
 * GET /api/companies/oauth/status?company_id=<id>
 *
 * Returns whether this company has Gmail/Drive/Sheets OAuth
 * connected, and if yes, which Gmail address. Used by the
 * /uznemumi page to render a per-row status chip:
 *
 *   connected: false                    → "Pievienot Gmail" button
 *   connected: true + missing scopes    → "Atjaunot piekļuvi" button
 *   connected: true + all scopes        → "Pievienots: x@y.com" badge
 *
 * Surfacing scopes lets the UI distinguish "Gmail granted" from
 * "Gmail-only Drive granted" — useful when the user declined
 * gmail.readonly at the consent screen but allowed Drive +
 * Sheets, in which case the email-import robot should be
 * disabled with a "needs gmail reconnect" hint.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkCompanyConnection } from "@/lib/company-clients";

export const maxDuration = 30;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role && session.role !== "owner") {
    // External users (accountant / warehouse_manager) don't need to
    // see Gmail connection state — only the owner manages OAuth.
    return NextResponse.json(
      { error: "Owner role required" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  try {
    const status = await checkCompanyConnection(companyId);
    if (!status.connected) {
      return NextResponse.json({ connected: false });
    }

    // Determine which key scopes are actually granted so the UI
    // can warn about partial grants. Google's scope strings are
    // long URLs; we check by substring rather than exact match
    // because some grants get the openid/email/profile shortcuts
    // instead of the full URL.
    const scopes = status.scopes.join(" ").toLowerCase();
    return NextResponse.json({
      connected: true,
      gmailAddress: status.gmailAddress,
      hasGmail: scopes.includes("gmail"),
      hasDrive: scopes.includes("drive"),
      hasSheets: scopes.includes("spreadsheets"),
    });
  } catch (err) {
    // Don't surface arbitrary error details to the client — log
    // server-side and return a neutral failure.
    console.error("OAuth status check failed:", err);
    return NextResponse.json(
      { connected: false, error: "Status pārbaude neizdevās" },
      { status: 500 }
    );
  }
}
