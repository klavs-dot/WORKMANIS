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
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import { COMPANY_TABS } from "@/lib/sheets-schema";

// 60s — health check reads ~25 tabs in parallel, but if any tab
// has thousands of rows the per-tab read can take 2-3s. Was 30s
// which was tight; bumped after seeing timeout errors in prod.
export const maxDuration = 60;

interface TabReport {
  tab: string;
  prefix: string;
  rowCount?: number;
  deletedCount?: number;
  error?: string;
}

export async function GET(request: Request) {
  // Wrap EVERYTHING in try/catch so the user always gets a
  // proper JSON error response instead of a Vercel-generated
  // empty 500 page.
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

    // Per-company OAuth: use the company's own Gmail tokens, not
    // the login session's tokens. This is what makes the multi-
    // Gmail architecture actually work — the company sheet lives
    // in the connected Gmail's Drive, so we need that account's
    // access token to read it.
    let cc;
    try {
      cc = await getCompanyClients(companyId);
    } catch (err) {
      if (err instanceof NoCompanyOAuthError) {
        return NextResponse.json(
          {
            error:
              "Šim uzņēmumam nav pievienots Gmail konts. Atveriet uzņēmumu un pievienojiet Gmail.",
            oauth_disconnected: true,
          },
          { status: 412 }
        );
      }
      throw err;
    }

    const client = createSheetsClientFromInstance({
      sheets: cc.sheets,
      spreadsheetId: cc.company.sheetId,
      actor: session.user.email,
    });

    // Read every tab's counts. We chunk these into batches of 5
    // rather than all-parallel because Sheets API has a 300/min
    // read quota per user, and 25 simultaneous reads is enough
    // to trip that limit when other operations (email-import,
    // schema repair) are running concurrently.
    //
    // Per-tab errors are caught individually so one broken tab
    // doesn't tank the whole report.
    const CHUNK_SIZE = 5;
    const reports: TabReport[] = [];
    for (let i = 0; i < COMPANY_TABS.length; i += CHUNK_SIZE) {
      const chunk = COMPANY_TABS.slice(i, i + CHUNK_SIZE);
      const chunkReports = await Promise.all(
        chunk.map(async (tab): Promise<TabReport> => {
          try {
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
      reports.push(...chunkReports);
      // Brief pause between chunks to spread the API load
      if (i + CHUNK_SIZE < COMPANY_TABS.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    const totalRows = reports.reduce((sum, r) => sum + (r.rowCount ?? 0), 0);
    const totalErrors = reports.filter((r) => r.error).length;

    // Check spreadsheet metadata (title, modified time) using
    // the company's own Sheets client — same auth as everything
    // above, no separate OAuth setup needed.
    let sheetTitle: string | undefined;
    try {
      const meta = await cc.sheets.spreadsheets.get({
        spreadsheetId: cc.company.sheetId,
        fields: "properties.title",
      });
      sheetTitle = meta.data.properties?.title ?? undefined;
    } catch {
      // non-critical
    }

    return NextResponse.json({
      ok: true,
      company: {
        id: cc.company.companyId,
        name: cc.company.name,
        sheetId: cc.company.sheetId,
        sheetTitle,
        gmailAddress: cc.gmailAddress,
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
