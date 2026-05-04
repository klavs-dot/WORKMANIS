/**
 * POST /api/orphans/classify?company_id=<id>
 *
 * Reads all orphan transactions (35_payments rows where
 * payment_status='maksajums_bez_rekina' AND ai_category is empty),
 * runs them through the Claude classifier in batches, and writes
 * the category + reasoning back to each row.
 *
 * Sesija 5. The user triggers this from the Rēķini page after a
 * bank import has finished and they want orphans pre-sorted into
 * actionable buckets:
 *
 *   - 'alga' rows can be linked to 36_salaries (future Sesija)
 *   - 'nodoklis' rows can be linked to 37_taxes (future Sesija)
 *   - 'rekins' rows surface a "Augšupielādēt manuāli" call to
 *     action with the suggested supplier name pre-filled
 *   - 'automatiskais' rows can auto-link to known recurring
 *     suppliers (Sesija 6)
 *
 * Idempotent: classified rows skip on re-run unless ?force=1.
 *
 * Cost note: Sonnet 4.6 at typical 30-orphan batches costs
 * ~$0.01-0.03 per call. Even pathological cases (300 orphans,
 * 10 batches) stay under $0.30 — negligible.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSheetsClientFromInstance } from "@/lib/sheets-client";
import {
  getCompanyClients,
  NoCompanyOAuthError,
} from "@/lib/company-clients";
import {
  classifyOrphansWithAI,
  type OrphanForClassification,
} from "@/lib/ai-orphan-classifier";

// 60s — typical batch is 30 orphans → 1 AI call → ~10s.
// Worst case 300 orphans = 10 batches sequential = ~50s.
export const maxDuration = 60;

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
  const force = url.searchParams.get("force") === "1";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI classifier nav konfigurēts (ANTHROPIC_API_KEY trūkst)" },
      { status: 500 }
    );
  }

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

  // ───── Find orphans needing classification ─────
  const allPayments = (await sheets.list("35_payments")) as Array<
    Record<string, unknown>
  >;

  const orphansToClassify = allPayments.filter((r) => {
    const status = r.payment_status as string;
    if (status !== "maksajums_bez_rekina") return false;
    if (!force && r.ai_category && r.ai_category !== "") {
      return false; // already classified, skip unless forced
    }
    return true;
  });

  if (orphansToClassify.length === 0) {
    return NextResponse.json({
      ok: true,
      classifiedCount: 0,
      message: "Nav orphan'u, ko klasificēt",
    });
  }

  // ───── Build classifier input ─────
  const aiInputs: OrphanForClassification[] = orphansToClassify.map(
    (r, idx) => {
      const amountCents = Number(r.amount_cents ?? 0) || 0;
      return {
        index: idx,
        counterparty: String(r.counterparty ?? ""),
        reference: String(r.bank_reference ?? r.raw_reference ?? ""),
        amount: amountCents / 100,
        date: String(r.payment_date ?? ""),
      };
    }
  );

  // ───── Run AI ─────
  const aiResults = await classifyOrphansWithAI(aiInputs, apiKey);

  // ───── Write results back ─────
  // Pre-read updated_at map so we don't fetch row-by-row
  const updatedAtById = new Map<string, string>();
  for (const r of allPayments) {
    updatedAtById.set(String(r.id), (r.updated_at as string) ?? "");
  }

  const counts = {
    alga: 0,
    nodoklis: 0,
    rekins: 0,
    automatiskais: 0,
    nezinams: 0,
  };
  let written = 0;
  let failed = 0;

  for (const result of aiResults) {
    const orphanRow = orphansToClassify[result.index];
    if (!orphanRow) continue;
    const id = String(orphanRow.id);
    counts[result.category]++;
    try {
      await sheets.update("35_payments", id, {
        ai_category: result.category,
        ai_confidence: result.confidence,
        ai_expected_supplier: result.expectedSupplier,
        ai_reasoning: result.reasoning,
        expected_updated_at: updatedAtById.get(id) ?? "",
      });
      written++;
    } catch (err) {
      console.warn(`Failed to write classification for ${id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    classifiedCount: written,
    failedCount: failed,
    breakdown: counts,
  });
}
