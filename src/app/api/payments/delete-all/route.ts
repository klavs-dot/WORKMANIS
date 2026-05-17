/**
 * POST /api/payments/delete-all?company_id=X&confirm=YES
 *
 * Soft-deletes ALL payment rows for a company. Used to wipe
 * the slate before a clean bank-statement re-import.
 *
 * Required query params:
 *   company_id — which company's payments to delete
 *   confirm    — must be exactly "YES" (safety guard against
 *                accidental triggering)
 *
 * Why this exists:
 *   After multiple sign-fix migrations and reclassify passes,
 *   the dataset can become inconsistent — some rows correctly
 *   migrated, others left with stale signs. Rather than
 *   surgically identifying which rows are wrong (impossible
 *   without the original CorD field which we don't store),
 *   the simplest path to a clean state is: delete all, then
 *   re-import the original FIDAVISTA file with the now-correct
 *   parser. The re-import goes through the canonical pipeline
 *   (parser → classifier → store) so every row gets correct
 *   sign + classification.
 *
 * Throttled at 50 deletes/min to stay under Sheets quota.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role !== "owner") {
    console.warn(
      `[delete-all] Forbidden attempt by ${session.user.email} role=${session.role}`
    );
    return NextResponse.json(
      { error: "Only the owner may bulk-delete payments" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id");
  const confirm = url.searchParams.get("confirm");

  if (!companyId) {
    return NextResponse.json(
      { error: "Missing company_id" },
      { status: 400 }
    );
  }
  if (confirm !== "YES") {
    return NextResponse.json(
      {
        error:
          "Confirmation required. Pass &confirm=YES to actually delete.",
      },
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

  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: session.user.email,
  });

  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;

  const DELAY_MS = 1200; // 50 deletes/min
  // Leave ~10s of headroom before Vercel kills the function so we can
  // return a clean truncation result instead of timing out mid-loop
  // and hiding which rows were actually deleted.
  const STARTED_AT = Date.now();
  const BUDGET_MS = (maxDuration - 10) * 1000;
  let deleted = 0;
  let errors = 0;
  let truncated = false;
  const errorMessages: string[] = [];

  for (const row of allPayments) {
    if (Date.now() - STARTED_AT > BUDGET_MS) {
      truncated = true;
      break;
    }
    try {
      await sheets.softDelete(
        "35_payments",
        String(row.id),
        String(row.updated_at ?? "")
      );
      deleted++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorMessages.push(`${row.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    errors,
    truncated,
    totalRows: allPayments.length,
    remaining: truncated ? allPayments.length - deleted - errors : 0,
    errorMessages: errorMessages.slice(0, 10),
    ...(truncated && {
      message: `Process truncated after ${deleted} of ${allPayments.length} rows due to time limit — re-run to continue.`,
    }),
  });
}
