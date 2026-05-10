/**
 * Orphan transaction classifier — given a bank transaction that
 * didn't match any existing invoice, try to identify the
 * counterparty in our 10_clients / 12_suppliers list and
 * automatically create a placeholder invoice row that links to
 * the transaction.
 *
 * Sesija 5 of the rēķini-redesign. Builds on top of the
 * reconciler (Sesija 3) which produces orphans; this module
 * decides which orphans we can confidently auto-classify and
 * which should remain in the red banner for manual upload.
 *
 * Why this is separate from bank-reconciler:
 *   - Reconciler is a pure function (zero I/O, fast, testable)
 *   - Classifier needs Sheets reads (clients/suppliers lookup)
 *     AND optional Anthropic AI call for fuzzy matching
 *   - We want bank import to succeed even if classifier fails —
 *     orphans tagged maksajums_bez_rekina is a safe fallback
 *
 * Matching priority (3 tiers, same shape as company-matcher):
 *   1. Counterparty IBAN matches known IBAN exactly
 *   2. Counterparty reg/VAT number appears in bank reference
 *   3. AI fuzzy name match against client/supplier list
 *
 * For tier 3 we use Haiku 4.5 — this is classification, not
 * extraction, and Haiku handles 'is this counterparty likely
 * the same as one of these N candidates?' well at low cost.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BankTransaction } from "./bank-reconciler";

export interface KnownClient {
  id: string;
  name: string;
  regNumber: string;
  vatNumber: string;
  iban: string;
}

export interface KnownSupplier {
  id: string;
  name: string;
  regNumber: string;
  vatNumber: string;
  iban: string;
  defaultExplanation?: string;
  typicalAccountCode?: string;
}

/**
 * Sesija 6 — partners are non-invoice payment recipients
 * (sales agents on commission, business partners getting profit
 * shares, etc). Distinguished from suppliers because their
 * payouts don't have invoices — they're paid based on contract
 * terms or sales records, not an invoice document.
 */
export interface KnownPartner {
  id: string;
  name: string;
  regNumber: string;
  iban: string;
  /** 'partner' = generic; 'agent' = sales agent on commission */
  kind: "partner" | "agent";
}

/**
 * Sesija 6 — employees for salary payments. Identified by
 * IBAN match (employees rarely change accounts month-to-month,
 * making IBAN very reliable) or by name fuzzy match against
 * 'first_name last_name' string.
 */
export interface KnownEmployee {
  id: string;
  fullName: string;
  iban: string;
  personalCode: string;
}

export type ClassificationTarget =
  | { kind: "client"; entity: KnownClient; confidence: "high" | "medium" }
  | { kind: "supplier"; entity: KnownSupplier; confidence: "high" | "medium" }
  | {
      kind: "partner";
      entity: KnownPartner;
      confidence: "high" | "medium";
    }
  | {
      kind: "employee";
      entity: KnownEmployee;
      confidence: "high" | "medium";
    }
  | { kind: "unknown" };

export interface ClassifyInput {
  transaction: BankTransaction;
  knownClients: KnownClient[];
  knownSuppliers: KnownSupplier[];
  knownPartners: KnownPartner[];
  knownEmployees: KnownEmployee[];
  /** Anthropic SDK client for the optional AI tier-3 match. */
  anthropic?: Anthropic;
}

/**
 * Normalize an IBAN for comparison — strip whitespace, uppercase.
 * Latvian IBANs sometimes arrive with spaces every 4 chars in
 * statements ('LV80 HABA 0551 0010 88780'); we want the comparison
 * to succeed regardless of formatting.
 */
function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Strip non-digits from a Latvian reg or VAT number. Both are
 * 11-digit identifiers when normalized; some sources prefix with
 * 'LV' for VAT, others don't.
 */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Tier 1 + 2 matching. Returns the matched entity if found by
 * deterministic signals (IBAN or ID number); returns null if no
 * signal matches and AI fallback is needed.
 */
function deterministicMatch(
  tx: BankTransaction,
  clients: KnownClient[],
  suppliers: KnownSupplier[],
  partners: KnownPartner[],
  employees: KnownEmployee[]
): ClassificationTarget | null {
  const txIban = tx.counterpartyIban ? normalizeIban(tx.counterpartyIban) : "";
  const refLower = tx.reference.toLowerCase();
  const counterpartyLower = tx.counterparty.toLowerCase();

  // ───── Tier 1: IBAN ─────
  // Order matters slightly: we check clients/suppliers FIRST because
  // they're the more common case (most companies have many more
  // invoices than salary/commission payments). Partner/employee
  // checks last so we don't accidentally route an invoice payment
  // to a partner who happened to share an IBAN — though IBANs
  // are unique enough that this is theoretical.
  if (txIban) {
    for (const c of clients) {
      if (c.iban && normalizeIban(c.iban) === txIban) {
        return { kind: "client", entity: c, confidence: "high" };
      }
    }
    for (const s of suppliers) {
      if (s.iban && normalizeIban(s.iban) === txIban) {
        return { kind: "supplier", entity: s, confidence: "high" };
      }
    }
    for (const p of partners) {
      if (p.iban && normalizeIban(p.iban) === txIban) {
        return { kind: "partner", entity: p, confidence: "high" };
      }
    }
    for (const e of employees) {
      if (e.iban && normalizeIban(e.iban) === txIban) {
        return { kind: "employee", entity: e, confidence: "high" };
      }
    }
  }

  // ───── Tier 2: reg / VAT number in reference ─────
  // We check both reference and counterparty fields because banks
  // sometimes put the reg number in the counterparty line (e.g.
  // 'SIA Mosphera 40103108904').
  //
  // For employees we also check personal_code (11-digit Latvian
  // personas kods) — some bank statements include it on salary
  // transfers as the 'recipient' identifier.
  const haystack = `${refLower} ${counterpartyLower}`;
  for (const c of clients) {
    const reg = digitsOnly(c.regNumber);
    const vat = digitsOnly(c.vatNumber);
    if (reg && reg.length >= 9 && haystack.includes(reg)) {
      return { kind: "client", entity: c, confidence: "high" };
    }
    if (vat && vat.length >= 9 && haystack.includes(vat)) {
      return { kind: "client", entity: c, confidence: "high" };
    }
  }
  for (const s of suppliers) {
    const reg = digitsOnly(s.regNumber);
    const vat = digitsOnly(s.vatNumber);
    if (reg && reg.length >= 9 && haystack.includes(reg)) {
      return { kind: "supplier", entity: s, confidence: "high" };
    }
    if (vat && vat.length >= 9 && haystack.includes(vat)) {
      return { kind: "supplier", entity: s, confidence: "high" };
    }
  }
  for (const p of partners) {
    const reg = digitsOnly(p.regNumber);
    if (reg && reg.length >= 9 && haystack.includes(reg)) {
      return { kind: "partner", entity: p, confidence: "high" };
    }
  }
  for (const e of employees) {
    const code = digitsOnly(e.personalCode);
    if (code && code.length >= 11 && haystack.includes(code)) {
      return { kind: "employee", entity: e, confidence: "high" };
    }
  }

  return null;
}

const CLASSIFY_TOOL = {
  name: "classify_counterparty",
  description:
    "Identify which client or supplier this bank transaction's counterparty refers to, or report 'unknown' if no clear match.",
  input_schema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        enum: ["client", "supplier", "unknown"],
        description:
          "client = counterparty is one of the known clients (we receive money from them); supplier = counterparty is one of the known suppliers (we pay money to them); unknown = no confident match.",
      },
      matched_id: {
        type: "string",
        description:
          "ID of the matched client or supplier from the lists provided. Empty when kind=unknown.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "high = exact name match or strong identifier overlap; medium = clear match with minor variation (typo, missing legal form); low = weak match, prefer 'unknown' over guessing.",
      },
      reasoning: {
        type: "string",
        description: "One sentence explaining the decision.",
      },
    },
    required: ["kind", "matched_id", "confidence", "reasoning"],
  },
};

const CLASSIFY_SYSTEM_PROMPT = `You match a bank transaction's counterparty against a list of known clients (we receive money FROM them) and known suppliers (we pay money TO them) for a Latvian small-business accounting tool.

You'll receive:
  - The transaction direction (incoming / outgoing)
  - Counterparty name as it appears on the bank statement
  - Bank reference / payment purpose text
  - Counterparty IBAN if present
  - List of known clients with id, name, reg_number, vat_number, iban
  - List of known suppliers with the same fields

Your job: pick which entity (client OR supplier) this counterparty is, or say 'unknown'.

Heuristics:
  - For incoming transactions, prefer clients (we receive from clients)
  - For outgoing transactions, prefer suppliers (we pay suppliers)
  - 'SIA Mosphera' and 'Mosphera SIA' refer to the same entity — legal-form order doesn't matter
  - Diacritics differences ('Mosfēra' vs 'Mosfera') are still matches
  - Subtle variations like 'Latvenergo AS' vs 'AS Latvenergo' or 'Lāčplēša SIA' vs 'SIA Lāčplēša' are matches
  - Generic descriptions ('Salary', 'Rent', 'Tax payment') without a clear company name → unknown
  - Multiple plausible candidates → return medium confidence and pick the strongest, or unknown if truly ambiguous
  - Confidence: 'high' for clear matches, 'medium' for matches with minor uncertainty, 'low' should rarely be used — prefer 'unknown' over 'low'

Be CONSERVATIVE. A wrong match creates a phantom invoice that the user has to clean up; an 'unknown' just leaves the transaction in the red orphan banner where the user can deal with it manually. When in doubt, choose unknown.`;

/**
 * Tier 3: AI fuzzy match. Only called when deterministic matching
 * fails. Returns null if AI couldn't classify, otherwise the same
 * shape as deterministicMatch.
 */
async function aiMatch(
  anthropic: Anthropic,
  tx: BankTransaction,
  clients: KnownClient[],
  suppliers: KnownSupplier[]
): Promise<ClassificationTarget | null> {
  // Cap candidate list size — passing 500 entities to the model
  // wastes tokens and dilutes attention. 30 of each is plenty for
  // typical small-business sizes.
  const clientsBrief = clients.slice(0, 30).map((c) => ({
    id: c.id,
    name: c.name,
    reg: c.regNumber,
    vat: c.vatNumber,
  }));
  const suppliersBrief = suppliers.slice(0, 30).map((s) => ({
    id: s.id,
    name: s.name,
    reg: s.regNumber,
    vat: s.vatNumber,
  }));

  const userContent = [
    `Transaction direction: ${tx.amountCents > 0 ? "incoming (we receive)" : "outgoing (we pay)"}`,
    `Counterparty name: ${tx.counterparty}`,
    `Counterparty IBAN: ${tx.counterpartyIban || "(none)"}`,
    `Bank reference: ${tx.reference || "(empty)"}`,
    `Amount: ${(tx.amountCents / 100).toFixed(2)} ${tx.currency}`,
    "",
    `Known clients (${clientsBrief.length}):`,
    JSON.stringify(clientsBrief, null, 2),
    "",
    `Known suppliers (${suppliersBrief.length}):`,
    JSON.stringify(suppliersBrief, null, 2),
  ].join("\n");

  try {
    // Haiku 4.5 — classification at 30× lower cost than Opus.
    // Input is ~500 tokens, output 100 — runs in 1-2s typically.
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: CLASSIFY_SYSTEM_PROMPT,
      tools: [CLASSIFY_TOOL as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "classify_counterparty" },
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock =>
        b.type === "tool_use" && b.name === "classify_counterparty"
    );
    if (!toolUse) {
      console.warn("[classifier] AI did not return tool_use");
      return null;
    }
    const result = toolUse.input as {
      kind: "client" | "supplier" | "unknown";
      matched_id: string;
      confidence: "high" | "medium" | "low";
      reasoning: string;
    };

    console.log(
      `[classifier] AI: ${result.kind} ${result.matched_id} (${result.confidence}) — ${result.reasoning}`
    );

    if (result.kind === "unknown" || result.confidence === "low") {
      return null;
    }

    if (result.kind === "client") {
      const matched = clients.find((c) => c.id === result.matched_id);
      if (!matched) return null;
      return {
        kind: "client",
        entity: matched,
        confidence: result.confidence,
      };
    }
    if (result.kind === "supplier") {
      const matched = suppliers.find((s) => s.id === result.matched_id);
      if (!matched) return null;
      return {
        kind: "supplier",
        entity: matched,
        confidence: result.confidence,
      };
    }
    return null;
  } catch (err) {
    console.error("[classifier] AI call failed:", err);
    return null;
  }
}

/**
 * Main entry — try deterministic match first, then AI fallback.
 *
 * Returns the classification result. Caller decides what to do
 * with it (high/medium confidence → create invoice + link;
 * unknown → leave as orphan).
 */
export async function classifyOrphanTransaction(
  input: ClassifyInput
): Promise<ClassificationTarget> {
  const {
    transaction,
    knownClients,
    knownSuppliers,
    knownPartners,
    knownEmployees,
    anthropic,
  } = input;

  const det = deterministicMatch(
    transaction,
    knownClients,
    knownSuppliers,
    knownPartners,
    knownEmployees
  );
  if (det) return det;

  // AI tier — only checks clients + suppliers for fuzzy match.
  // Partners + employees are NOT included in the AI prompt
  // intentionally:
  //   - Partner / employee identification is a one-time decision
  //     that the user makes deliberately (they pick from a
  //     dropdown). After that, IBAN match takes over for future
  //     payments — no need for AI to guess.
  //   - Adding 'is this a partner or supplier?' to the AI prompt
  //     makes it much more likely to mis-classify (a freelance
  //     designer could be either, depending on contract terms).
  //     We'd rather leave it unknown and let the user decide.
  //   - Salary payments to employees usually have unambiguous
  //     IBANs (they're set up once via bank transfer and rarely
  //     change). If IBAN doesn't match, the user knows best.
  if (!anthropic) {
    return { kind: "unknown" };
  }

  // Sesija 7 — early exit when there's nothing for the AI to match
  // against. This is the common case for fresh accounts (user
  // created the company, no clients/suppliers added yet). Without
  // this exit, every single orphan still costs ~2-3s of Haiku
  // round-trip just to confirm 'no, that empty list doesn't match
  // anything'. With 98 orphans that's 200-300s — right at the
  // Vercel 300s timeout boundary, so the import endpoint runs out
  // of budget before it can tag any orphan with maksajums_bez_rekina.
  // Result: all 98 orphans end up with payment_status='' and the
  // 'AI klasificēt' button can't find them either.
  if (knownClients.length === 0 && knownSuppliers.length === 0) {
    return { kind: "unknown" };
  }

  const ai = await aiMatch(
    anthropic,
    transaction,
    knownClients,
    knownSuppliers
  );
  return ai ?? { kind: "unknown" };
}
