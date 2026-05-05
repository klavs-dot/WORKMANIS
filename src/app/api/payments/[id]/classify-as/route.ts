/**
 * POST /api/payments/[id]/classify-as
 *
 * Sesija 6 — when an orphan transaction has no matching invoice
 * AND isn't a known client/supplier, the user manually identifies
 * it as a payment to a specific partner, agent, or employee.
 *
 * On the first such payment, we ALSO save the counterparty IBAN
 * to the partner / employee row so future imports auto-link
 * without prompting. This is the "auto-fill on first payment"
 * behaviour the user asked for ("3. tas notiek tikai pirmajā").
 *
 * Request body:
 *   { kind: 'partner' | 'employee', entity_id: string }
 *
 * Response:
 *   { ok: true, ibanSaved: boolean }
 *
 * Errors:
 *   400 invalid kind / missing entity_id
 *   404 payment or entity not found
 *   409 payment is already linked (matched_invoice_id or
 *       partner_id / employee_id already set)
 *   412 no Gmail connected for this company
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";

export const maxDuration = 30;

interface ClassifyBody {
  kind: "partner" | "employee";
  entity_id: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  let body: ClassifyBody;
  try {
    body = (await request.json()) as ClassifyBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (body.kind !== "partner" && body.kind !== "employee") {
    return NextResponse.json(
      { error: "kind must be 'partner' or 'employee'" },
      { status: 400 }
    );
  }
  if (!body.entity_id || typeof body.entity_id !== "string") {
    return NextResponse.json(
      { error: "Missing entity_id" },
      { status: 400 }
    );
  }

  // ───── Get the company's clients ─────
  let cc;
  try {
    cc = await getCompanyClients(companyId);
  } catch (err) {
    if (err instanceof NoCompanyOAuthError) {
      return NextResponse.json(
        {
          error: "Šim uzņēmumam nav pievienots Gmail konts.",
          oauth_disconnected: true,
        },
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

  // ───── Verify the payment exists + is still orphaned ─────
  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;
  const paymentRow = allPayments.find((r) => r.id === paymentId);
  if (!paymentRow) {
    return NextResponse.json(
      { error: `Maksājums nav atrasts (${paymentId})` },
      { status: 404 }
    );
  }

  // Reject if the payment is already linked to anything
  if (
    paymentRow.matched_invoice_id ||
    paymentRow.partner_id ||
    paymentRow.employee_id
  ) {
    return NextResponse.json(
      {
        error:
          "Šis maksājums jau ir sasaistīts. Vispirms noņem esošo saiti, ja gribi mainīt.",
      },
      { status: 409 }
    );
  }

  // ───── Verify the entity exists + load it ─────
  const entityTab = body.kind === "partner" ? "15_partners" : "20_employees";
  const allEntities = (await sheets.list(entityTab)) as Array<
    Record<string, unknown>
  >;
  const entityRow = allEntities.find((r) => r.id === body.entity_id);
  if (!entityRow) {
    return NextResponse.json(
      {
        error: `${body.kind === "partner" ? "Partneris" : "Darbinieks"} nav atrasts (${body.entity_id})`,
      },
      { status: 404 }
    );
  }

  // ───── Patch the payment row ─────
  // Determine the payment_category. For partners, distinguish
  // 'commission' (agents) from generic 'partner_payment'. For
  // employees, always 'salary' (monthly salary, vacation pay,
  // bonus — all roll up as employee payouts).
  let category: string;
  if (body.kind === "employee") {
    category = "salary";
  } else {
    const partnerKind = String(entityRow.partner_kind ?? "").toLowerCase();
    category = partnerKind === "agent" ? "commission" : "partner_payment";
  }

  const txAmountCents = Number(paymentRow.amount_cents ?? 0) || 0;
  const txDirection = txAmountCents < 0 ? "outgoing" : "incoming";

  // Sanity: salary payments and commission payouts should be
  // OUTGOING (we pay them). If the user marked an INCOMING
  // transaction as a salary, something's odd — log a warning
  // but allow it (rare cases like reversals do happen).
  if (txDirection !== "outgoing") {
    console.warn(
      `[classify-as] ${body.kind} classification on ${txDirection} transaction (paymentId=${paymentId}). Allowing but flagging.`
    );
  }

  const expectedUpdatedAt = (paymentRow.updated_at as string) ?? "";
  const patch: Record<string, string> = {
    payment_category: category,
    classified_section: body.kind === "partner" ? "partner" : "algas",
    payment_status: "", // no longer an orphan
    expected_updated_at: expectedUpdatedAt,
  };
  if (body.kind === "partner") {
    patch.partner_id = body.entity_id;
  } else {
    patch.employee_id = body.entity_id;
  }

  try {
    // Cast through unknown — patch is dynamically built so the
    // structural type doesn't carry the expected_updated_at
    // requirement at compile time, but we DO populate it above.
    await sheets.update(
      "35_payments",
      paymentId,
      patch as unknown as Parameters<typeof sheets.update>[2]
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Sheet atjauninājums neizdevās: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 }
    );
  }

  // ───── Save the IBAN to the entity for future auto-match ─────
  // ONLY if the entity doesn't already have an IBAN (don't
  // overwrite if user previously set one to a different account).
  // This is the "tas notiek tikai pirmajā" semantic — first
  // payment teaches the system, subsequent payments use what's
  // already saved.
  let ibanSaved = false;
  const txCounterpartyIban = String(paymentRow.counterparty_iban ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const entityCurrentIban = String(entityRow.iban ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (txCounterpartyIban && !entityCurrentIban) {
    try {
      await sheets.update(entityTab, body.entity_id, {
        iban: txCounterpartyIban,
        expected_updated_at: (entityRow.updated_at as string) ?? "",
      });
      ibanSaved = true;
      console.log(
        `[classify-as] saved IBAN ${txCounterpartyIban} to ${entityTab}/${body.entity_id}`
      );
    } catch (err) {
      // Non-fatal — the classification succeeded, just won't
      // auto-link future payments. User can edit the entity
      // manually to add IBAN later.
      console.warn(
        `[classify-as] IBAN save failed (entity classification succeeded):`,
        err
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ibanSaved,
  });
}
