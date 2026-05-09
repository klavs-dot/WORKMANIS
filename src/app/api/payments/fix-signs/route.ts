/**
 * POST /api/payments/fix-signs?company_id=X
 *
 * One-shot migration to flip the sign of all existing 35_payments
 * rows. Used after the 2026-05-09 hotfix that unified the
 * positive=incoming convention across parsers, reconciler, and UI.
 *
 * Before the fix:
 *   FIDAVISTA D-transaction (we paid out) → amount = +5510 (wrong)
 *   FIDAVISTA C-transaction (we received) → amount = -5510 (wrong)
 *
 * After the fix:
 *   FIDAVISTA D-transaction (we paid out) → amount = -5510 (correct)
 *   FIDAVISTA C-transaction (we received) → amount = +5510 (correct)
 *
 * This endpoint flips amount_cents on every existing row AND
 * re-derives:
 *   - direction: 'incoming' if positive, 'outgoing' if negative
 *   - classified_section: re-runs classifier with new sign
 *
 * Why a one-shot migration vs re-import:
 *   Re-importing would lose any manual edits the user made
 *   (matched_invoice_id, partner_id, employee_id, manual
 *   uploaded invoices, AI category overrides). Flipping the
 *   sign in place preserves all that.
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

  // Load all payments
  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;

  let flipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  for (const row of allPayments) {
    try {
      const oldAmount = Number(row.amount_cents ?? 0);
      if (!oldAmount) continue; // skip zero-amount rows

      const newAmount = -oldAmount;
      const newDirection = newAmount > 0 ? "incoming" : "outgoing";

      // Re-classify with the new sign
      const newSection = classifyTransaction({
        rawDate: String(row.payment_date ?? ""),
        date: String(row.payment_date ?? ""),
        counterparty: String(row.counterparty ?? ""),
        counterpartyIban: String(row.counterparty_iban ?? "") || undefined,
        amount: newAmount / 100,
        reference: String(row.bank_reference ?? ""),
        currency: "EUR",
        raw: { TypeCode: String(row.raw_reference ?? "") },
      });

      await sheets.update("35_payments", String(row.id), {
        amount_cents: String(newAmount),
        direction: newDirection,
        // Only override classified_section if the user hasn't
        // already manually classified to partner/salary (we don't
        // want to overwrite their deliberate choices).
        ...(row.classified_section === "partner" ||
        row.classified_section === "algas" ||
        row.classified_section === "salary"
          ? {}
          : { classified_section: newSection }),
        expected_updated_at: String(row.updated_at ?? ""),
      });
      flipped++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorMessages.push(`${row.id}: ${msg}`);
      // Keep going — partial migration is fine
    }
  }

  return NextResponse.json({
    ok: true,
    flipped,
    errors,
    errorMessages: errorMessages.slice(0, 10),
  });
}
