/**
 * POST /api/payments/ai-classify
 *
 * Takes a list of card transactions and asks Claude to classify
 * each as 'fiziskie' (physical in-store) or 'automatiskie' (online).
 * Used at import time to disambiguate SEB's PMNTCCRDOTHR-Pirkums
 * code, which doesn't distinguish online vs in-store purchases.
 *
 * Request body:
 *   {
 *     transactions: Array<{
 *       index: number,         // stable index back to caller's array
 *       counterparty: string,  // merchant name
 *       reference: string,     // free-form bank reference text
 *       typeCode: string       // bank type code (PMNTCCRDOTHR-Pirkums etc.)
 *     }>
 *   }
 *
 * Response:
 *   {
 *     results: Array<{
 *       index: number,
 *       section: 'fiziskie' | 'automatiskie',
 *       confidence: 'high' | 'medium' | 'low',
 *       reasoning: string
 *     }>
 *   }
 *
 * Authentication: requires an authenticated user session.
 *
 * Cost: ~$0.005 per batch of 50 card transactions
 * (Claude Sonnet 4.6 pricing as of April 2026). A typical month
 * with 100 card transactions costs ~$0.01.
 *
 * Errors:
 *   - 401 if not authenticated
 *   - 400 if request body is malformed
 *   - 500 if ANTHROPIC_API_KEY is missing
 *   - 502 if Anthropic API itself fails
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  classifyCardPaymentsWithAI,
  type CardTransactionForAI,
} from "@/lib/ai-payment-classifier";

// Vercel function timeout. AI classification of ~100 transactions
// takes ~10 seconds; 60s gives plenty of headroom for retries.
export const maxDuration = 60;

interface RequestBody {
  transactions?: unknown;
}

export async function POST(request: Request) {
  // Auth check
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in environment");
    return NextResponse.json(
      {
        error:
          "Servera konfigurācijas kļūda. Lūdzu sazinieties ar administratoru.",
      },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Nepareizs JSON formāts" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.transactions)) {
    return NextResponse.json(
      { error: "Nepieciešams 'transactions' masīvs" },
      { status: 400 }
    );
  }

  // Validate + normalize each input transaction
  const validated: CardTransactionForAI[] = [];
  for (const raw of body.transactions) {
    if (!raw || typeof raw !== "object") continue;
    const tx = raw as Record<string, unknown>;
    if (
      typeof tx.index !== "number" ||
      typeof tx.counterparty !== "string"
    ) {
      continue;
    }
    validated.push({
      index: tx.index,
      counterparty: tx.counterparty,
      reference: typeof tx.reference === "string" ? tx.reference : "",
      typeCode: typeof tx.typeCode === "string" ? tx.typeCode : "",
    });
  }

  if (validated.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Sanity cap — refuse oversized requests rather than racking up
  // a massive Anthropic bill from a runaway script. Real monthly
  // statements have <200 card transactions; 500 is comfortable
  // headroom that still rules out abuse.
  if (validated.length > 500) {
    return NextResponse.json(
      {
        error:
          "Pārāk daudz transakciju vienā pieprasījumā. Maksimums: 500.",
      },
      { status: 400 }
    );
  }

  try {
    const results = await classifyCardPaymentsWithAI(validated, apiKey);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("AI classification failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `AI klasifikācija neizdevās: ${message}` },
      { status: 502 }
    );
  }
}
