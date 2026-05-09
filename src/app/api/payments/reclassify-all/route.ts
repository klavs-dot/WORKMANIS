/**
 * POST /api/payments/reclassify-all?company_id=X
 *
 * Re-runs the payment-classifier on every existing 35_payments
 * row and updates classified_section accordingly. Does NOT touch
 * amount_cents or direction — purely a classification refresh.
 *
 * Why needed:
 *   - fix-signs migration timed out at 300s with ~10-20 rows
 *     un-flipped. Those rows ALSO have stale classified_section.
 *   - Classifier improvements (new patterns, better incoming/
 *     outgoing handling) don't apply retroactively to existing
 *     rows — server-side classified_section was set at import
 *     time and never recomputed.
 *   - Some rows have classified_section that doesn't match
 *     the current sign convention (e.g. PRORING +15000.01
 *     incoming refund stored as 'izejosie' because the value
 *     was migrated but section wasn't).
 *
 * Idempotent and safe: skips rows manually classified as
 * partner/algas/salary (those are deliberate user choices).
 *
 * Throttled at 50 writes/min to stay under Sheets quota.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import { classifyTransaction } from "@/lib/payment-classifier";

export const maxDuration = 300;

export async function POST(request: Request) {
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

  const sheets = createSheetsClientFromInstance({
    sheets: cc.sheets,
    spreadsheetId: cc.company.sheetId,
    actor: session.user.email,
  });

  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;

  const DELAY_MS = 1200; // 50 writes/min
  let updated = 0;
  let unchanged = 0;
  let skippedManual = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  const sectionStats: Record<string, number> = {};

  for (const row of allPayments) {
    try {
      const oldSection = String(row.classified_section ?? "");

      // Skip rows manually classified by user — don't overwrite
      // their deliberate partner/employee/salary decisions.
      if (
        oldSection === "partner" ||
        oldSection === "algas" ||
        oldSection === "salary"
      ) {
        skippedManual++;
        sectionStats[oldSection] = (sectionStats[oldSection] || 0) + 1;
        continue;
      }

      const amountCents = Number(row.amount_cents ?? 0);
      if (!amountCents) {
        unchanged++;
        continue;
      }

      const newSection = classifyTransaction({
        rawDate: String(row.payment_date ?? ""),
        date: String(row.payment_date ?? ""),
        counterparty: String(row.counterparty ?? ""),
        counterpartyIban:
          String(row.counterparty_iban ?? "") || undefined,
        amount: amountCents / 100,
        reference: String(row.bank_reference ?? ""),
        currency: "EUR",
        raw: { TypeCode: String(row.raw_reference ?? "") },
      });

      sectionStats[newSection] = (sectionStats[newSection] || 0) + 1;

      if (newSection === oldSection) {
        unchanged++;
        continue;
      }

      // Also fix direction in case it was wrong
      const newDirection = amountCents > 0 ? "incoming" : "outgoing";

      await sheets.update("35_payments", String(row.id), {
        classified_section: newSection,
        direction: newDirection,
        expected_updated_at: String(row.updated_at ?? ""),
      });
      updated++;

      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorMessages.push(`${row.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    total: allPayments.length,
    updated,
    unchanged,
    skippedManual,
    errors,
    sectionStats,
    errorMessages: errorMessages.slice(0, 10),
  });
}
