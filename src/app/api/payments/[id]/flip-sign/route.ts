/**
 * POST /api/payments/[id]/flip-sign?company_id=X
 *
 * Flip the sign of a single payment row. Used when fix-signs
 * migration didn't complete (Vercel 300s timeout left ~10-20
 * rows un-migrated) or when a specific transaction looks wrong
 * to the user.
 *
 * Idempotent in the sense that calling twice returns to the
 * original sign — but the UI button should be clear about
 * 'flip' semantics (not 'mark as incoming/outgoing').
 *
 * Why per-row instead of running fix-signs again:
 *   - fix-signs operates on ALL rows, including ones already
 *     correctly migrated. Running it twice would invert
 *     correct rows back to wrong.
 *   - Per-row is safe: user clicks the explicit flip button
 *     ONLY on rows they identify as misclassified.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import { classifyTransaction } from "@/lib/payment-classifier";

export const maxDuration = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { id: paymentId } = await params;
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

  // Read the payment row
  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;
  const row = allPayments.find((r) => r.id === paymentId);
  if (!row) {
    return NextResponse.json(
      { error: `Payment not found: ${paymentId}` },
      { status: 404 }
    );
  }

  const oldAmount = Number(row.amount_cents ?? 0);
  if (!oldAmount) {
    return NextResponse.json(
      { error: "Cannot flip zero-amount row" },
      { status: 400 }
    );
  }

  const newAmount = -oldAmount;
  const newDirection = newAmount > 0 ? "incoming" : "outgoing";

  // Re-classify with the new sign so the row moves to the
  // appropriate tab. Skip classification update if the user
  // had manually classified this as partner/salary (don't
  // overwrite their deliberate choice).
  const userClassified =
    row.classified_section === "partner" ||
    row.classified_section === "algas" ||
    row.classified_section === "salary";

  const newSection = userClassified
    ? String(row.classified_section)
    : classifyTransaction({
        rawDate: String(row.payment_date ?? ""),
        date: String(row.payment_date ?? ""),
        counterparty: String(row.counterparty ?? ""),
        counterpartyIban:
          String(row.counterparty_iban ?? "") || undefined,
        amount: newAmount / 100,
        reference: String(row.bank_reference ?? ""),
        currency: "EUR",
        raw: { TypeCode: String(row.raw_reference ?? "") },
      });

  try {
    await sheets.update("35_payments", paymentId, {
      amount_cents: String(newAmount),
      direction: newDirection,
      classified_section: newSection,
      expected_updated_at: String(row.updated_at ?? ""),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Update failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    paymentId,
    oldAmount,
    newAmount,
    newDirection,
    newSection,
  });
}
