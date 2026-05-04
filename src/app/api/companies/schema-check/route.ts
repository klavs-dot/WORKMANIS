/**
 * GET /api/companies/schema-check?company_id=...
 *
 * Lightweight check: are this company's Sheet tabs in sync with
 * the latest sheets-schema.ts? Returns counts of missing tabs +
 * missing columns so the UI can show a banner like:
 *
 *   "Tabulas atpalikušas no jaunākās versijas. Spied 'Atjaunot
 *    tagad' lai pievienotu jaunās kolonnas."
 *
 * Sesija 7 — added because each session (2-6) introduced new
 * columns, and users had to manually find /iestatijumi → schema
 * repair to apply them. Without this check, Sesija 3+ features
 * silently fail (UI tries to render payment_status pill, but
 * column doesn't exist → field is empty → pill never appears).
 *
 * MUCH cheaper than /api/health (which counts rows). This only
 * reads the FIRST ROW of each tab to inspect its header line.
 *
 * Returns:
 *   {
 *     ok: boolean,           // true when schema is up to date
 *     missingTabs: string[], // tab names missing entirely
 *     driftingTabs: Array<{
 *       tab: string,
 *       missingColumns: string[],
 *     }>,
 *   }
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import { COMPANY_TABS } from "@/lib/sheets-schema";
import type { sheets_v4 } from "googleapis";

export const maxDuration = 30;

export async function GET(request: Request) {
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

  let cc;
  try {
    cc = await getCompanyClients(companyId);
  } catch (err) {
    if (err instanceof NoCompanyOAuthError) {
      return NextResponse.json(
        { error: "OAuth not connected", oauth_disconnected: true },
        { status: 412 }
      );
    }
    throw err;
  }

  // Read the spreadsheet metadata in ONE call — gives us all
  // sheet names and their first-row contents (which is the
  // header). Vastly cheaper than 25 individual values.get
  // calls (one per tab).
  let metadata;
  try {
    metadata = await cc.sheets.spreadsheets.get({
      spreadsheetId: cc.company.sheetId,
      includeGridData: true,
      // Only fetch the first row of each tab — header check
      // doesn't need data
      ranges: COMPANY_TABS.map((t) => `${t.name}!1:1`),
      fields:
        "sheets(properties(title),data(rowData(values(formattedValue))))",
    });
  } catch (err) {
    console.error("[schema-check] metadata fetch failed:", err);
    // If even the metadata read fails, fall back to "schema is
    // probably broken, recommend repair" rather than crashing.
    return NextResponse.json({
      ok: false,
      missingTabs: [],
      driftingTabs: [],
      error:
        err instanceof Error
          ? err.message
          : "Neizdevās pārbaudīt shēmu",
    });
  }

  const presentSheets = metadata.data.sheets ?? [];
  const presentByTitle = new Map<string, sheets_v4.Schema$Sheet>();
  for (const s of presentSheets) {
    const title = s.properties?.title;
    if (title) presentByTitle.set(title, s);
  }

  // The schema reconciler always prepends an 'id' + 'created_at'
  // + 'updated_at' + 'is_deleted' + 'deleted_at' set to every
  // tab. We only need to verify the SPEC columns from cols are
  // present — the system columns are guaranteed by provisioning.
  const missingTabs: string[] = [];
  const driftingTabs: Array<{ tab: string; missingColumns: string[] }> =
    [];

  for (const tab of COMPANY_TABS) {
    const sheet = presentByTitle.get(tab.name);
    if (!sheet) {
      missingTabs.push(tab.name);
      continue;
    }

    // Extract header row values
    const rowData = sheet.data?.[0]?.rowData;
    const headerRow = rowData?.[0]?.values ?? [];
    const presentColumns = new Set(
      headerRow
        .map((v) => v.formattedValue?.trim() ?? "")
        .filter(Boolean)
    );

    // Compare with spec — only flag missing if the schema
    // expects it. Extra columns in the user sheet (e.g. user
    // added something manually) are NOT flagged as drift —
    // we don't want to nag.
    const missingCols: string[] = [];
    for (const col of tab.cols) {
      if (!presentColumns.has(col)) missingCols.push(col);
    }
    if (missingCols.length > 0) {
      driftingTabs.push({ tab: tab.name, missingColumns: missingCols });
    }
  }

  return NextResponse.json({
    ok: missingTabs.length === 0 && driftingTabs.length === 0,
    missingTabs,
    driftingTabs,
  });
}
