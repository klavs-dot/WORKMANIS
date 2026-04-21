/**
 * GET /api/health?company_id=...
 *
 * Returns a health report for the active company's Sheets data.
 * Lists every tab defined in sheets-schema.ts and reports:
 *   - rowCount: number of non-deleted rows in that tab
 *   - deletedCount: number of soft-deleted rows
 *
 * Purely diagnostic. No writes. Safe to call anytime.
 *
 * Intended as a reassurance tool after major migrations: the user
 * can click 'Pārbaudīt datu saskaņotību' and see that e.g.
 * 30_invoices_out has 3 rows, matching what they see in /rekini.
 *
 * Runs all tab reads in parallel via Promise.all. For Mosphera
 * with ~20 tabs, finishes in ~2-3 seconds (Sheets API is the
 * bottleneck; reading is sequential per HTTP request but we
 * batch across tabs).
 *
 * Tabs with read errors are reported as { error: "..." } rather
 * than failing the whole endpoint — partial reports are more
 * useful than no report.
 */

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { resolveCompany } from "@/lib/resolve-company";
import { createSheetsClient } from "@/lib/sheets-client";
import { COMPANY_TABS } from "@/lib/sheets-schema";

export const maxDuration = 30;

interface TabReport {
  tab: string;
  prefix: string;
  rowCount?: number;
  deletedCount?: number;
  error?: string;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json({ error: "Missing company_id" }, { status: 400 });
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
    const client = createSheetsClient({
      accessToken: session.accessToken,
      spreadsheetId: company.sheetId,
      actor: session.user.email,
    });

    // Read every tab's counts in parallel, catching errors per-tab
    // so one broken tab doesn't tank the whole report.
    const reports: TabReport[] = await Promise.all(
      COMPANY_TABS.map(async (tab): Promise<TabReport> => {
        try {
          // Use includeDeleted=true to get both counts at once
          const allRows = await client.list(tab.name, {
            includeDeleted: true,
          });
          const active = allRows.filter((r) => !r.deleted_at);
          return {
            tab: tab.name,
            prefix: tab.idPrefix,
            rowCount: active.length,
            deletedCount: allRows.length - active.length,
          };
        } catch (err) {
          return {
            tab: tab.name,
            prefix: tab.idPrefix,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      })
    );

    const totalRows = reports.reduce((sum, r) => sum + (r.rowCount ?? 0), 0);
    const totalErrors = reports.filter((r) => r.error).length;

    // Check spreadsheet metadata (title, modified time)
    let sheetTitle: string | undefined;
    try {
      const oauth2 = new google.auth.OAuth2();
      oauth2.setCredentials({ access_token: session.accessToken });
      const sheets = google.sheets({ version: "v4", auth: oauth2 });
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: company.sheetId,
        fields: "properties.title",
      });
      sheetTitle = meta.data.properties?.title ?? undefined;
    } catch {
      // non-critical
    }

    return NextResponse.json({
      ok: true,
      company: {
        id: company.companyId,
        name: company.name,
        sheetId: company.sheetId,
        sheetTitle,
      },
      summary: {
        tabsChecked: reports.length,
        totalActiveRows: totalRows,
        tabsWithErrors: totalErrors,
      },
      tabs: reports,
    });
  } catch (err) {
    console.error("Health check failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
