/**
 * POST /api/reconcile/run?company_id=<id>
 *
 * Re-runs bank reconciliation against existing data in the
 * company sheet. No file upload — this is for the case where:
 *
 *   - User uploaded a bank statement earlier, and AT THAT TIME
 *     some invoices were missing from the inbox / hadn't been
 *     manually added yet
 *   - Now those invoices exist (user added them via Izejošie tab,
 *     or they came in via the email-import robot)
 *   - User wants the reconciler to re-match without re-uploading
 *     the bank file
 *
 * UI: a small button "Atkārtot salīdzināšanu" on the rēķini page
 * next to the three robot mascots. Clicking it invokes this
 * endpoint and shows a toast with the result counts.
 *
 * Response shape mirrors /api/bank-statement/import.reconciled
 * so the same client toast logic can render both.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  runReconciliation,
} from "@/lib/reconcile-runner";
import { NoCompanyOAuthError } from "@/lib/company-clients";

// 90s — typical job is 10-30s on a company with ~100 invoices
// + ~200 payments. The 30s budget added on top covers the worst
// case where many invoices flip status and need writes.
export const maxDuration = 90;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }
  if (session.role && session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner may run reconciliation" },
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
    const result = await runReconciliation({
      companyId,
      actor: session.user.email,
    });
    return NextResponse.json({
      ok: true,
      reconciled: result.summary,
      latestStatementDate: result.latestStatementDate,
      hadNoStatements: result.hadNoStatements,
    });
  } catch (err) {
    if (err instanceof NoCompanyOAuthError) {
      return NextResponse.json(
        {
          error:
            "Šim uzņēmumam nav pievienots Gmail konts. Pirms salīdzināšanas savieno Gmail.",
          oauth_disconnected: true,
        },
        { status: 412 }
      );
    }
    console.error("Reconcile run failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Salīdzināšana neizdevās: ${err.message}`
            : "Salīdzināšana neizdevās",
      },
      { status: 500 }
    );
  }
}
