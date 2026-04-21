/**
 * POST /api/companies/repair?company_id=...
 *
 * Reconciles a company's Sheets tabs against the current schema.
 * Adds missing columns in-place (preserving existing row data).
 * Adds missing tabs if any.
 *
 * This is the migration path for companies provisioned on an
 * older schema version after sheets-schema.ts has been updated.
 *
 * Scope: only affects company.gsheet. Does not touch Drive folder
 * structure (if subfolders change, a separate migration would be
 * needed — not implemented because the subfolder list is stable).
 *
 * Idempotent — calling repair on an already up-to-date company is
 * a no-op (every reconciliation step is a no-op if headers match).
 *
 * No body needed; the endpoint reads sheets-schema.ts to know
 * what the target schema is.
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { COMPANY_TABS } from "@/lib/sheets-schema";

// Reuse the private helpers from provisioning.ts by re-implementing
// them here inline. We can't import private fns and we don't want
// to export them (they're provisioning-internal). Alternative would
// be extracting to a shared module; deferred for now since the
// duplication is small.
//
// Actually — let's just export ensureTabsAndHeaders from provisioning.
// It's a provisioning primitive, and sharing reduces drift.

import { reconcileSchemaForSheet } from "@/lib/provisioning";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }

  const company = await resolveCompany(
    session.accessToken,
    session.user.email,
    companyId
  );
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const oauth2 = new google.auth.OAuth2();
    oauth2.setCredentials({ access_token: session.accessToken });
    const sheets = google.sheets({ version: "v4", auth: oauth2 });

    await reconcileSchemaForSheet(
      sheets,
      company.sheetId,
      COMPANY_TABS.map((t) => ({ name: t.name, cols: [...t.cols] }))
    );

    return NextResponse.json({
      ok: true,
      message: `Schema reconciled for ${company.name}`,
    });
  } catch (err) {
    console.error("Repair failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
