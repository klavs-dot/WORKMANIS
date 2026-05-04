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
import { auth } from "@/auth";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import { COMPANY_TABS } from "@/lib/sheets-schema";
import { reconcileSchemaForSheet } from "@/lib/provisioning";

// 300s — schema repair iterates through ~25 tabs, each requiring
// 1-3 Sheets API calls.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
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

    // Per-company OAuth — schema repair writes to the company
    // sheet, which lives in the connected Gmail's Drive
    let cc;
    try {
      cc = await getCompanyClients(companyId);
    } catch (err) {
      if (err instanceof NoCompanyOAuthError) {
        return NextResponse.json(
          {
            error:
              "Šim uzņēmumam nav pievienots Gmail konts.",
            oauth_disconnected: true,
          },
          { status: 412 }
        );
      }
      throw err;
    }

    await reconcileSchemaForSheet(
      cc.sheets,
      cc.company.sheetId,
      COMPANY_TABS.map((t) => ({ name: t.name, cols: [...t.cols] }))
    );

    return NextResponse.json({
      ok: true,
      message: `Schema reconciled for ${cc.company.name}`,
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
