/**
 * AI orphan-payment classifier.
 *
 * Sesija 5 of the rēķini-redesign. Given orphan transactions (bank
 * money that didn't match any invoice), uses Claude to bucket each
 * one into a category so the user can quickly act on it:
 *
 *   - alga         — salary / wage payment
 *   - nodoklis     — tax payment (VID, social, PVN)
 *   - rekins       — looks like an invoice (most common — these
 *                    just need an invoice attached)
 *   - automatiskais — recurring service / subscription / utility
 *                    (electricity, internet, hosting)
 *   - nezinams     — can't tell from the data
 *
 * Why a separate classifier from ai-payment-classifier.ts: that
 * one was for distinguishing in-store-card vs online-card
 * transactions, which has different signals (merchant name,
 * country code) and only fires on FIDAVISTA card-payment type
 * codes. Orphans here include EVERYTHING — wire transfers, direct
 * debits, manual transfers — and the relevant signal is the
 * counterparty + reference text together.
 *
 * Uses Sonnet 4.6 (not Opus): orphan classification is a routing
 * decision, not extraction. We don't need Opus's precision; we
 * need quick, cheap throughput on what's typically 5-50 orphans
 * per import.
 *
 * Model is forced to use the classify_orphans tool so we get
 * structured output. Batched per call — 30 orphans per request
 * fits comfortably under context window.
 */

import Anthropic from "@anthropic-ai/sdk";

export type OrphanCategory =
  | "alga"
  | "nodoklis"
  | "rekins"
  | "automatiskais"
  | "nezinams";

export interface OrphanForClassification {
  /** Stable index back to caller's array */
  index: number;
  /** Bank counterparty name */
  counterparty: string;
  /** Bank reference / memo text */
  reference: string;
  /** Signed amount in EUR — sign tells us direction */
  amount: number;
  /** ISO date YYYY-MM-DD */
  date: string;
}

export interface OrphanClassificationResult {
  index: number;
  category: OrphanCategory;
  confidence: "high" | "medium" | "low";
  /** One-sentence Latvian rationale shown in tooltips */
  reasoning: string;
  /**
   * For category='rekins' or 'automatiskais': the supplier name
   * we'd expect to see on a matching invoice. Used in Sesija 6 for
   * partner auto-fill suggestions. Empty string when we can't
   * confidently extract a supplier (e.g. 'INET TERMINAL 12345').
   */
  expectedSupplier: string;
}

const SYSTEM_PROMPT = `Tu klasificē bankas darījumus, kuriem nav atrasts atbilstošs rēķins. Lietotājs tev rāda darījumu sarakstu — tev jāizšķiro katrs uz vienu no piecām kategorijām, lai lietotājs zinātu, kā ar to rīkoties.

KATEGORIJAS:

1. **alga** — algas izmaksa darbiniekam vai sev. Atpazīstami signāli:
   - "Algas avanss", "Darba alga", "Algas pārskaitījums"
   - Counterparty ir konkrēts cilvēks (vārds + uzvārds), nevis uzņēmums
   - Amount vienmēr negatīvs (nauda iziet uz darbinieku)
   - Atskaitījumi: "ATSKAITĪJUMS NO ALGAS" — arī skaitās kā alga

2. **nodoklis** — nodokļu maksājums uz VID vai sociālo. Atpazīstami signāli:
   - Counterparty: "Valsts ieņēmumu dienests", "VID", "Valsts kase"
   - Reference satur: "PVN", "IIN", "VSAOI", "UIN", "soc.iemaksas"
   - Reference satur: "EDS deklarācija", "MK noteikumi"

3. **rekins** — kāda piegādātāja rēķins, kas vēl nav uzņemts sistēmā. Tas ir biežākais gadījums. Lietotājam tikai jāpievieno rēķins manuāli. Signāli:
   - Counterparty ir uzņēmums (SIA, AS, IK)
   - Reference satur "Rēķins Nr.", "INV-", "RĒĶINS"
   - Vienreizēja, neregulāra summa

4. **automatiskais** — regulārs, abonēšanas, vai utilītu maksājums, kas, iespējams, nāk caur direct debit vai kartes auto-maksājumu. Signāli:
   - Komunālie pakalpojumi: "AS Sadales tīkls", "Latvenergo", "Tet", "BITE"
   - Internet, hostings: "GoDaddy", "Hostinger", "Cloudflare"
   - Subscriptions: "Spotify", "Microsoft", "Adobe", "Google"
   - Apdrošināšanas: "BTA", "Balta", "ERGO", "If"
   - Counterparty satur: "*INET", "*RECURRING", "PMNTSEPA"

5. **nezinams** — nevar pateikt no informācijas. Pārāk neskaidra atsauce, anonīms counterparty, ārvalstu darījums bez konteksta. Lietotājs lems pats.

KONFIDENCE:
- **high** — vārds-pa-vārdam atbilstošs ("Valsts ieņēmumu dienests" → nodoklis), konkrēta kategorijas atslēgvārda parādīšanās
- **medium** — kontekstuāls ieskats (pazīstams uzņēmuma profils, regulāra summa)
- **low** — minējums, varbūt nepareizs

EXPECTED_SUPPLIER:
- 'rekins' / 'automatiskais' kategorijai: izvelc piegādātāja nosaukumu tādā formā, kā tas, iespējams, parādās rēķinā (piem. "SIA Tet" → "Tet" vai "SIA Tet"). Tukša virkne, ja nevari droši ekstrakēt.
- 'alga' / 'nodoklis' / 'nezinams' kategorijai: vienmēr tukša virkne.

REASONING:
- Viena teikuma latviešu valodā paskaidrojums. Piem. "Counterparty 'Valsts ieņēmumu dienests' un reference 'IIN par 04/2026' skaidri norāda uz nodokli."

Atbildi caur classify_orphans rīku ar visu sarakstu uzreiz.`;

const CLASSIFY_TOOL = {
  name: "classify_orphans",
  description:
    "Classify each orphan bank transaction into one category. Return one entry per input transaction, in the same order.",
  input_schema: {
    type: "object" as const,
    properties: {
      results: {
        type: "array",
        description:
          "One classification per input transaction, indexed by the input's 'index' field.",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            category: {
              type: "string",
              enum: ["alga", "nodoklis", "rekins", "automatiskais", "nezinams"],
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            reasoning: { type: "string" },
            expectedSupplier: { type: "string" },
          },
          required: [
            "index",
            "category",
            "confidence",
            "reasoning",
            "expectedSupplier",
          ],
        },
      },
    },
    required: ["results"],
  },
};

const BATCH_SIZE = 30;

/**
 * Classify a list of orphan transactions. Batches into 30s and
 * returns combined results in original index order. On AI failure
 * for any batch, falls back to 'nezinams' for that batch's items
 * rather than crashing the whole call.
 */
export async function classifyOrphansWithAI(
  orphans: OrphanForClassification[],
  apiKey: string
): Promise<OrphanClassificationResult[]> {
  if (orphans.length === 0) return [];

  const anthropic = new Anthropic({ apiKey });
  const results: OrphanClassificationResult[] = [];

  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = orphans.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await classifyBatch(anthropic, batch);
      results.push(...batchResults);
    } catch (err) {
      console.error(
        `Orphan classifier batch ${i / BATCH_SIZE} failed:`,
        err
      );
      // Fall back to 'nezinams' for the whole batch — don't lose
      // the rest of the workload to one bad batch
      for (const o of batch) {
        results.push({
          index: o.index,
          category: "nezinams",
          confidence: "low",
          reasoning: "AI klasifikācija neizdevās, atstāts neklasificēts.",
          expectedSupplier: "",
        });
      }
    }
  }

  return results;
}

async function classifyBatch(
  anthropic: Anthropic,
  batch: OrphanForClassification[]
): Promise<OrphanClassificationResult[]> {
  const userContent =
    `Klasificē šos ${batch.length} bankas darījumus. Atbildi ar classify_orphans rīku, iekļaujot rezultātu KATRAM darījumam (visiem ${batch.length} indeksiem).\n\n` +
    JSON.stringify(batch, null, 2);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [CLASSIFY_TOOL as Anthropic.Messages.Tool],
    tool_choice: { type: "tool", name: "classify_orphans" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock =>
      b.type === "tool_use" && b.name === "classify_orphans"
  );
  if (!toolUse) {
    console.error(
      "classifyOrphansWithAI: AI did not use tool. Content blocks:",
      response.content.map((b) => b.type)
    );
    throw new Error("AI did not return classify_orphans tool use");
  }

  const parsed = toolUse.input as { results?: OrphanClassificationResult[] };
  if (!Array.isArray(parsed.results)) {
    throw new Error("AI returned malformed classifier output");
  }
  // Sanity: the AI sometimes returns fewer results than inputs.
  // Pad the missing ones with 'nezinams' rather than throw.
  const indexSet = new Set(parsed.results.map((r) => r.index));
  for (const o of batch) {
    if (!indexSet.has(o.index)) {
      parsed.results.push({
        index: o.index,
        category: "nezinams",
        confidence: "low",
        reasoning: "AI nepiegāja rezultātu šim darījumam.",
        expectedSupplier: "",
      });
    }
  }
  return parsed.results;
}
