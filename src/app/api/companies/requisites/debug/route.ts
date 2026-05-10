/**
 * GET /api/companies/requisites/debug?company_id=X
 *
 * Returns ALL rows from 01_requisites (not just the resolved
 * winner from /requisites). Used to diagnose situations where
 * stale rows from previous schema versions / template seeds are
 * shadowing the user's current data.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import { getCompanyClients } from "@/lib/company-clients";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
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

  const cc = await getCompanyClients(companyId);
  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: session.user.email,
  });

  const rows = await sheets.list("01_requisites");
  return NextResponse.json({ rows, sheetId: cc.company.sheetId });
}
