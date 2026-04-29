/**
 * Classify a parsed bank transaction into one of the rēķini tabs.
 *
 * Sections:
 *   - 'ienakosie'    — incoming: client paid us (signed amount < 0
 *                      in our convention, since negative = received)
 *   - 'izejosie'     — outgoing payment that matches an existing
 *                      received invoice (we owed someone, we paid)
 *   - 'automatiskie' — outgoing payment to an online service /
 *                      subscription (Stripe, Google, Apple, etc.)
 *                      where typically no manual invoice exists yet
 *   - 'fiziskie'     — POS terminal or ATM transactions (physical
 *                      card use, cash withdrawal/deposit)
 *
 * The classification is heuristic but conservative — when unsure
 * we fall back to 'izejosie' for outgoing and 'ienakosie' for
 * incoming, since those are the safest defaults.
 */

import type { ParsedTransaction } from "./bank-exchange";

export type PaymentSection =
  | "ienakosie"
  | "izejosie"
  | "automatiskie"
  | "fiziskie";

/**
 * Patterns matching POS terminal and ATM operations across Baltic
 * banks. Looked up against the reference text and any 'TypeCode'
 * field in the raw data.
 *
 * Adding a pattern: keep it lowercase, broad, and language-neutral
 * where possible. Bank-specific codes (e.g. SEB's 'PMNTCCRDTPOS')
 * also belong here.
 */
const PHYSICAL_PATTERNS: readonly RegExp[] = [
  /\bpos\b/i,
  /\bbankomāt/i,
  /\batm\b/i,
  /\bcrdt\s*pos\b/i,
  /\bcard\s+payment\b/i,
  /\bkartes\s+(maks|izmaksa|iemaksa)/i,
  /\bskaidrās\s+naudas/i,
  /\bcash\s+(withdrawal|deposit)\b/i,
  /pmntccrdtpos/i, // SEB POS card payment type code
  /pmntcwdlatm/i, // SEB ATM withdrawal type code
  /pmntcdpsatm/i, // SEB ATM deposit type code
];

/**
 * Patterns matching well-known online services and subscriptions.
 * If the COUNTERPARTY name matches one of these, the payment goes
 * to the 'Automātiskie & Internetā' tab instead of plain outgoing.
 *
 * The list is intentionally short — covers the obvious household
 * names. Extend as the user reports services that should be
 * recognized but aren't.
 */
const ONLINE_SERVICE_PATTERNS: readonly RegExp[] = [
  /\bgoogle\b/i,
  /\bgoogle\s+(workspace|cloud|ireland|llc)/i,
  /\bapple\b/i,
  /\bicloud\b/i,
  /\bstripe\b/i,
  /\bvercel\b/i,
  /\bcloudflare\b/i,
  /\baws\b/i,
  /\bamazon\s+web\s+services\b/i,
  /\bmicrosoft\b/i,
  /\boffice\s*365\b/i,
  /\bnetflix\b/i,
  /\bspotify\b/i,
  /\bdropbox\b/i,
  /\bzoom\b/i,
  /\bslack\b/i,
  /\bnotion\b/i,
  /\bgithub\b/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bfigma\b/i,
  /\bmeta\s+platforms\b/i,
  /\bfacebook\b/i,
  /\binstagram\b/i,
  /\bpaypal\b/i,
  /\brevolut\b/i,
  /\bwise\b/i,
  /\bn26\b/i,
];

interface ClassificationContext {
  /** Existing invoice IBANs we've seen — used to detect 'matches an
   *  existing invoice we owe'. Pre-built by the caller before
   *  classifying many transactions. */
  knownSupplierIbans?: Set<string>;
}

/**
 * Classify a single transaction into a section.
 *
 * Decision tree (in order — first match wins):
 *   1. Amount is incoming (< 0)              → ienakosie
 *   2. POS terminal / ATM patterns matched   → fiziskie
 *   3. Counterparty matches online service   → automatiskie
 *   4. Counterparty IBAN matches a known     → izejosie
 *      supplier we have an invoice from
 *   5. Default outgoing                      → automatiskie
 *      (online services dominate the unknown
 *      outgoing flow for most small businesses;
 *      a missing supplier IBAN usually means
 *      either a one-off subscription OR a manual
 *      payment without a stored invoice — both
 *      best handled in the 'automatiskie' tab
 *      where the AI scan + missing-receipt flow
 *      lives)
 */
export function classifyTransaction(
  tx: ParsedTransaction,
  ctx: ClassificationContext = {}
): PaymentSection {
  // 1. Incoming
  if (tx.amount < 0) return "ienakosie";

  // Build a haystack of all the text fields we might match on
  const haystack = [
    tx.counterparty,
    tx.reference,
    tx.raw?.TypeCode,
    tx.raw?.Ustrd,
  ]
    .filter((s): s is string => Boolean(s))
    .join(" ");

  // 2. Physical (POS / ATM)
  if (PHYSICAL_PATTERNS.some((re) => re.test(haystack))) {
    return "fiziskie";
  }

  // 3. Online service
  if (ONLINE_SERVICE_PATTERNS.some((re) => re.test(haystack))) {
    return "automatiskie";
  }

  // 4. Match an existing supplier we have an invoice from
  if (
    tx.counterpartyIban &&
    ctx.knownSupplierIbans?.has(normalizeIban(tx.counterpartyIban))
  ) {
    return "izejosie";
  }

  // 5. Default — treat unknown outgoing as 'automatiskie' so it
  //    flows into the missing-receipt review UI
  return "automatiskie";
}

/**
 * Bulk classify with a shared context. More efficient than calling
 * classifyTransaction in a loop because the supplier IBAN set is
 * built once.
 */
export function classifyAll(
  transactions: ParsedTransaction[],
  knownSupplierIbans: Iterable<string> = []
): Array<{ tx: ParsedTransaction; section: PaymentSection }> {
  const ibanSet = new Set(
    Array.from(knownSupplierIbans).map(normalizeIban).filter(Boolean)
  );
  const ctx: ClassificationContext = { knownSupplierIbans: ibanSet };
  return transactions.map((tx) => ({
    tx,
    section: classifyTransaction(tx, ctx),
  }));
}

/**
 * Group classified transactions by section. Convenience wrapper
 * for the import-summary UI which shows counts per tab.
 */
export function groupBySection(
  classified: Array<{ tx: ParsedTransaction; section: PaymentSection }>
): Record<PaymentSection, ParsedTransaction[]> {
  const out: Record<PaymentSection, ParsedTransaction[]> = {
    ienakosie: [],
    izejosie: [],
    automatiskie: [],
    fiziskie: [],
  };
  for (const { tx, section } of classified) {
    out[section].push(tx);
  }
  return out;
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}
