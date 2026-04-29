/**
 * AI-based card payment classifier.
 *
 * Uses Claude to figure out whether a card transaction was a
 * physical in-store purchase (POS terminal) or an online purchase
 * (e-commerce, subscription, digital service).
 *
 * Why AI instead of regex: SEB lumps both online and in-store
 * card payments under the same FIDAVISTA type code
 * (PMNTCCRDOTHR-Pirkums). Distinguishing them requires recognizing
 * merchants, and Claude knows far more Latvian retail chains and
 * online services than a hand-maintained regex list ever could.
 *
 * Uses tool-use to force structured JSON output. Batches up to
 * ~50 transactions per request to keep cost low — typical monthly
 * statement has ~30-100 card transactions, fits in 1-2 batches.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface CardTransactionForAI {
  /** Stable index back to the caller's array — we return this so
   *  the caller can match results to inputs. */
  index: number;
  /** Merchant name as it appears on the bank statement */
  counterparty: string;
  /** Free-form reference text from the statement (often contains
   *  location, country code, asterisk prefixes that hint at
   *  physical vs online) */
  reference: string;
  /** Bank type code (PMNTCCRDOTHR-Pirkums etc.) */
  typeCode: string;
}

export interface AIClassificationResult {
  index: number;
  /** 'fiziskie' = physical in-store POS / ATM / cash
   *  'automatiskie' = online / e-commerce / subscription */
  section: "fiziskie" | "automatiskie";
  /** 'high' = obvious match (well-known LV chain or online service);
   *  'medium' = inferred from context (country code, domain name);
   *  'low' = guess, probably wrong */
  confidence: "high" | "medium" | "low";
  /** One-sentence rationale, in Latvian, for transparency */
  reasoning: string;
}

const SYSTEM_PROMPT = `Tu klasificē kartes maksājumus uz divām kategorijām:

1. **fiziskie** — pirkumi fiziskos veikalos ar POS termināli, ATM iemaksas/izmaksas, skaidrās naudas darbības
2. **automatiskie** — online pirkumi, e-veikali, abonementi, digitālie servisi

Tu esi eksperts par Latvijas tirgu un zini galvenās tirdzniecības ķēdes (Maxima, Rimi, Lidl, Elvi, Top!, Aibe, Mego, Narvesen, Circle K, Neste, Virši, Gotika, Depo, K-rauta, Bauhaus, Mēness aptieka, Benu aptieka, Apollo, Forum Cinemas, McDonald's, Hesburger, Subway, KFC, Drogas, Sportland, JYSK, IKEA, Stockmann, Galerija Centrs, Rietumu, Jaunpils, Origo, Alfa, Spice u.c.).

Pazīmes online maksājumiem:
- '*' prefix vai sufikss (DNH*, EVP*, PADDLE*, SPP*, PAYPAL*)
- domēna nosaukums (.lv, .com, .de, .uk u.c.)
- ārzemju valstu kodi (USA, NLD, GBR, IRL, DEU)
- subscription/SaaS nosaukumi (Stripe, Google, Apple, Anthropic, GitHub, Notion)
- maksājumu apstrādātāji (Stripe, PayPal, Adyen, Mollie)

Pazīmes fiziskiem maksājumiem:
- LVA valsts kods + LV pilsētas nosaukums
- LV tirdzniecības ķēžu nosaukumi
- ATM/POS atslēgvārdi tipa kodā (PMNTCWDLATM, PMNTCDPSATM)
- Degvielas uzpildes (Neste, Circle K, Virši, Gotika)

Šaubu gadījumā:
- LV uzņēmums + LV pilsēta + nav '*' un domēna → drīzāk fiziskie
- Nezināms uzņēmums + ārzemju kods → drīzāk automatiskie
- Vispār nezinu → automatiskie ar zemu confidence

Atbildi caur classify_card_payments rīku ar visu pirkumu sarakstu uzreiz.`;

/**
 * The tool schema. Claude must return a result for every input,
 * keyed by the index we provided. This way the caller can match
 * results to their input array without trusting Claude to preserve
 * order.
 */
const CLASSIFY_TOOL: Anthropic.Messages.Tool = {
  name: "classify_card_payments",
  description:
    "Klasificē iedotos kartes maksājumus kategorijās 'fiziskie' vai 'automatiskie'. Atgrieziet vienu rezultātu katram pirkumam.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        description: "Klasifikāciju saraksts, viens katram ievades pirkumam",
        items: {
          type: "object",
          properties: {
            index: {
              type: "integer",
              description:
                "Indekss no ievades saraksta (0-bāzēts), ko nodrošināja klients",
            },
            section: {
              type: "string",
              enum: ["fiziskie", "automatiskie"],
              description:
                "Kategorija: 'fiziskie' fiziskam veikalam/ATM, 'automatiskie' online maksājumam",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "Cik droša ir klasifikācija. 'high' acīmredzami; 'medium' secināts no konteksta; 'low' minējums",
            },
            reasoning: {
              type: "string",
              description:
                "Viens teikums latviski, kas izskaidro lēmumu (piem. 'Maxima ir LV pārtikas veikalu ķēde — POS terminālis')",
            },
          },
          required: ["index", "section", "confidence", "reasoning"],
        },
      },
    },
    required: ["results"],
  },
};

/**
 * How many transactions to send per Claude API call. Higher = fewer
 * calls + cheaper, but risks hitting output token limit if Claude's
 * reasoning gets verbose. 50 is a comfortable sweet spot for
 * Sonnet 4.6's output budget.
 */
const BATCH_SIZE = 50;

/**
 * Classify a list of card transactions using Claude. Returns one
 * result per input, in the SAME ORDER as the input array (we sort
 * by index after Claude responds, in case Claude's order differs).
 *
 * If a batch fails, that batch's results are filled with low-
 * confidence 'automatiskie' fallbacks rather than throwing — the
 * import flow shouldn't be entirely blocked by one network glitch.
 */
export async function classifyCardPaymentsWithAI(
  transactions: CardTransactionForAI[],
  apiKey: string
): Promise<AIClassificationResult[]> {
  if (transactions.length === 0) return [];

  const anthropic = new Anthropic({ apiKey });
  const allResults: AIClassificationResult[] = [];

  // Process in batches
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await classifyBatch(anthropic, batch);
      allResults.push(...batchResults);
    } catch (err) {
      console.error(
        `AI classification batch ${i / BATCH_SIZE + 1} failed:`,
        err
      );
      // Fill failed batch with low-confidence fallbacks
      for (const tx of batch) {
        allResults.push({
          index: tx.index,
          section: "automatiskie",
          confidence: "low",
          reasoning: "AI klasifikācija neizdevās, izmantots noklusējums",
        });
      }
    }
  }

  // Sort by original index so caller can map directly
  allResults.sort((a, b) => a.index - b.index);
  return allResults;
}

async function classifyBatch(
  anthropic: Anthropic,
  batch: CardTransactionForAI[]
): Promise<AIClassificationResult[]> {
  // Build a compact, readable list for Claude. Each line:
  //   [index] counterparty | reference | typeCode
  const lines = batch.map(
    (tx) =>
      `[${tx.index}] ${tx.counterparty.trim()}` +
      (tx.reference.trim() ? ` | ${tx.reference.trim()}` : "") +
      (tx.typeCode.trim() ? ` | ${tx.typeCode.trim()}` : "")
  );

  const userMessage =
    `Klasificē šos ${batch.length} kartes maksājumus. Atbildi ar classify_card_payments rīku, iekļaujot rezultātu KATRAM pirkumam (visiem ${batch.length} indeksiem).\n\n` +
    lines.join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_card_payments" },
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === "classify_card_payments"
  );

  if (!toolUse) {
    throw new Error("No classify_card_payments tool_use in response");
  }

  const parsed = toolUse.input as { results?: AIClassificationResult[] };
  if (!parsed.results || !Array.isArray(parsed.results)) {
    throw new Error("Malformed tool input: missing results array");
  }

  // Validate + clean: Claude sometimes hallucinates an extra index
  // or skips one. Build a map and fill any missing inputs with
  // low-confidence fallbacks.
  const byIndex = new Map<number, AIClassificationResult>();
  for (const r of parsed.results) {
    if (
      typeof r.index === "number" &&
      (r.section === "fiziskie" || r.section === "automatiskie") &&
      (r.confidence === "high" ||
        r.confidence === "medium" ||
        r.confidence === "low")
    ) {
      byIndex.set(r.index, r);
    }
  }

  const cleaned: AIClassificationResult[] = [];
  for (const tx of batch) {
    const r = byIndex.get(tx.index);
    if (r) {
      cleaned.push(r);
    } else {
      cleaned.push({
        index: tx.index,
        section: "automatiskie",
        confidence: "low",
        reasoning: "AI atstāja bez klasifikācijas, izmantots noklusējums",
      });
    }
  }
  return cleaned;
}
