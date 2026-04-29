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
 * Patterns for PHYSICAL transactions:
 *   - POS terminals at brick-and-mortar shops (card swipe in store)
 *   - ATM withdrawals and deposits
 *   - Cash transactions
 *
 * SEB FIDAVISTA codes:
 *   PMNTCCRDTPOS — POS card payment (physical store terminal)
 *   PMNTCWDLATM  — ATM withdrawal
 *   PMNTCDPSATM  — ATM deposit
 *   PMNTCCDPCSH  — Cash deposit at branch
 *   PMNTCCDWCSH  — Cash withdrawal at branch
 *
 * Swedbank similar:
 *   PURCHASE     — POS terminal
 *   ATM CASH WITHDRAWAL / ATM CASH DEPOSIT
 */
const PHYSICAL_PATTERNS: readonly RegExp[] = [
  // Specific bank type codes (most reliable)
  /pmntccrdtpos/i,
  /pmntcwdlatm/i,
  /pmntcdpsatm/i,
  /pmntccdpcsh/i,
  /pmntccdwcsh/i,
  // Generic ATM / cash patterns
  /\batm\b/i,
  /\bbankomāt/i,
  /\bskaidrās\s+naudas/i,
  /\bcash\s+(withdrawal|deposit|advance)\b/i,
  /\bcash\s+at\s+atm\b/i,
  // POS terminal (in physical store)
  /\bpos\s*term/i,
  /\bpos-term/i,
  /\bterminal/i,
  /\bpurchase\s+at\b/i,
  /\bcrdt\s*pos\b/i,
  /\bkartes\s+(maks|izmaksa|iemaksa).*\b(veikalā|termināl|pos)/i,
];

/**
 * Latvian physical-store chain names. SEB lumps both online and
 * in-store card payments under PMNTCCRDOTHR-Pirkums. To distinguish
 * a POS payment at Maxima from an online payment at GoDaddy, we
 * look for these chain names in the merchant string. If we find
 * one, the payment is physical (fiziskie).
 *
 * Add common Latvian retail chains. Not exhaustive — the user's
 * actual receipts will reveal what else needs to be on this list.
 */
const LATVIAN_PHYSICAL_STORES: readonly RegExp[] = [
  /\bmaxima\b/i,
  /\brimi\b/i,
  /\blidl\b/i,
  /\belvi\b/i,
  /\btop!?\b/i,
  /\baibe\b/i,
  /\bmego\b/i,
  /\bnarvesen\b/i,
  /\bcircle\s*k\b/i,
  /\bneste\b/i,
  /\bvirši\b/i, // Virši-A
  /\bgotika\b/i, // Gotika fuel
  /\bdepo\b/i,
  /\bdepo-veikals\b/i,
  /\bk-?rauta\b/i, // K-rauta
  /\bbauhaus\b/i,
  /\bibericana\b/i,
  /\beuroapotheka\b/i,
  /\bmēness\s*aptieka\b/i,
  /\bbenu\s*aptieka\b/i,
  /\bapollo\b/i, // Apollo kino
  /\bforum\s*cinemas\b/i,
  /\bmcdonald'?s\b/i,
  /\bhesburger\b/i,
  /\bsubway\b/i,
  /\bkfc\b/i,
  /\bdrogas\b/i,
  /\bsportland\b/i,
  /\bjysk\b/i,
  /\bikea\b/i,
  // Auto parts and DIY chains common in LV
  /\bwurth\b/i,
  /\borlen\s+stacja/i, // Polish/Baltic fuel chain
  /\borlen\b/i,
  /\bbrink'?s\s+atm/i, // ATM operator
  /\bdus\b/i, // Degvielas Uzpildes Stacija
  /\bhydroscand\b/i,
  /\bveikals[-\s]/i, // 'VEIKALS-' / 'VEIKALS ' = generic 'shop' prefix
];

/**
 * Latvian city names. When a card transaction merchant string
 * contains one of these alongside no clear online indicator (no
 * asterisk prefix, no domain suffix), it's almost certainly a
 * physical POS purchase at a local Latvian shop.
 *
 * The reasoning: SEB embeds the merchant location in PmtInfo
 * like 'WURTH, LIEPAJA' or 'DELVE 2, LIEPAJA'. Online merchants
 * embed country codes ('Berlin/DEU', 'Luxembourg/LUX') or domain
 * names ('lemona.lv'). The LV city signature is highly correlated
 * with physical commerce.
 */
const LATVIAN_CITIES: readonly RegExp[] = [
  /\bliepaja\b/i,
  /\bliepāja\b/i,
  /\briga\b/i,
  /\brīga\b/i,
  /\bventspils\b/i,
  /\bdaugavpils\b/i,
  /\bjelgava\b/i,
  /\bjurmala\b/i,
  /\bjūrmala\b/i,
  /\brezekne\b/i,
  /\brēzekne\b/i,
  /\bvalmiera\b/i,
  /\bogre\b/i,
  /\bcesis\b/i,
  /\bcēsis\b/i,
  /\btukums\b/i,
  /\bsalaspils\b/i,
  /\bbauska\b/i,
  /\bdobele\b/i,
  /\bsigulda\b/i,
  /\bkuldiga\b/i,
  /\bkuldīga\b/i,
  /\bsaldus\b/i,
  /\baizkraukle\b/i,
];

/**
 * Patterns for ONLINE / AUTOMATED transactions:
 *   - Online card payments (e-commerce, subscriptions)
 *   - Direct debits, recurring service charges
 *   - Card-not-present transactions (CNP)
 *
 * SEB FIDAVISTA codes:
 *   PMNTCCRDOTHR — generic card purchase (online OR in-store —
 *                  needs counterparty disambiguation, see below)
 *   PMNTCCRDTECT — outgoing instant card / e-commerce
 *   PMNTCCRDTONL — online card payment
 *   PMNTCCRDTCNP — card-not-present
 *   PMNTRCDTDIRD — direct debit
 *
 * Plus brand-name detection for the household names.
 */
const ONLINE_CARD_TYPE_CODES: readonly RegExp[] = [
  /pmntccrdtect\b/i, // Outgoing instant transfer / e-commerce
  /pmntccrdtonl/i, // Online card
  /pmntccrdtcnp/i, // Card-not-present
  /pmntrcdtdird/i, // Direct debit
  /pmntcidtsdd/i, // SEPA direct debit incoming variant
  /\bcard\s+payment\s+(online|internet|web)/i,
  /\binternet\s+(maks|payment|purchase)/i,
  /\be-commerce\b/i,
  /\bcnp\b/i, // Card-not-present
];

/**
 * SEB's generic card purchase code. Could be either online OR
 * in-store — must disambiguate by looking at the merchant name
 * for Latvian physical retail chains. If a known chain is in the
 * merchant text, it's physical; otherwise default to online.
 */
const SEB_GENERIC_CARD_PURCHASE = /pmntccrdothr/i;

/**
 * Patterns matching well-known online services and subscriptions
 * by COUNTERPARTY NAME. If the merchant matches, classification is
 * 'automatiskie' regardless of bank type code (some banks don't
 * distinguish online vs in-store cards in the type field).
 */
const ONLINE_SERVICE_PATTERNS: readonly RegExp[] = [
  /\bgoogle\b/i,
  /\bgoogle\s+(workspace|cloud|ireland|llc)/i,
  /\bapple\b/i,
  /\bapple\.com\b/i,
  /\bicloud\b/i,
  /\bstripe\b/i,
  /\bvercel\b/i,
  /\bcloudflare\b/i,
  /\baws\b/i,
  /\bamazon\b/i,
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
  /\bclaude\.ai\b/i,
  /\bfigma\b/i,
  /\bmeta\s+platforms\b/i,
  /\bfacebook\b/i,
  /\binstagram\b/i,
  /\bpaypal\b/i,
  /\brevolut\b/i,
  /\bwise\b/i,
  /\bn26\b/i,
  /\bbolt\b/i,
  /\buber\b/i,
  /\bbooking\.com/i,
  /\bairbnb\b/i,
  /\bebay\b/i,
  /\baliexpress\b/i,
  /\bgodaddy\b/i,
  /\bnamesilo\b/i,
  /\bdomains?\b/i,
  // Additional services that show up in real LV business statements
  /\bwix\b/i,
  /\bwix\.com\b/i,
  /\bcalendly\b/i,
  /\basana\.com\b/i,
  /\basana\b/i,
  /\bcapcut\b/i,
  /\bepidemic\s+sound\b/i,
  /\binsta360\b/i,
  /\bfiverr\b/i,
  /\bupwork\b/i,
  /\bcanva\b/i,
  /\badobe\b/i,
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
 *
 *   1. Amount is incoming (< 0)              → ienakosie
 *   2. PHYSICAL patterns match (POS in       → fiziskie
 *      store, ATM withdrawal/deposit,
 *      cash at branch — explicit type
 *      codes like PMNTCWDLATM)
 *   3. SEB generic card purchase             → see sub-decision:
 *      (PMNTCCRDOTHR-Pirkums)                  3a. Latvian retail
 *                                                  chain in merchant
 *                                                  name → fiziskie
 *                                              3b. Otherwise →
 *                                                  automatiskie
 *   4. ONLINE_CARD_TYPE_CODES match           → automatiskie
 *      (e-commerce, direct debit, CNP)
 *   5. Counterparty matches a known           → automatiskie
 *      online service brand
 *   6. Counterparty IBAN matches a known      → izejosie
 *      supplier we have an invoice from
 *   7. Default outgoing                       → izejosie
 *
 * The PMNTCCRDOTHR special case is needed because SEB doesn't
 * distinguish online vs in-store card payments in the type code
 * — both come through as the same code. We have to look at the
 * merchant name to figure out which it was.
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

  // 2. Explicit physical type codes (ATM, cash, POS)
  if (PHYSICAL_PATTERNS.some((re) => re.test(haystack))) {
    return "fiziskie";
  }

  // 3. SEB generic card purchase — could be online OR in-store.
  //    Disambiguate by Latvian retail chain detection.
  if (SEB_GENERIC_CARD_PURCHASE.test(haystack)) {
    // 3a. Known LV retail chain in the merchant text → physical
    if (LATVIAN_PHYSICAL_STORES.some((re) => re.test(haystack))) {
      return "fiziskie";
    }

    // 3b. Online payment processor signature: '*' prefix with
    //     no spaces around it (DNH*GODADDY, EVP*lemona.lv,
    //     MKK*kafijasdraugs.lv, PADDLE*XYZ). These are payment-
    //     processor markers, never appear in physical POS strings.
    if (/\b[A-Z]{2,4}\*[A-Za-z0-9]/.test(haystack)) {
      return "automatiskie";
    }

    // 3c. Domain name in the merchant text (.com, .lv, .de etc.)
    //     — strong online indicator.
    if (/\.(com|lv|de|uk|net|io|org|co|ru|fr|it|es|nl)\b/i.test(haystack)) {
      return "automatiskie";
    }

    // 3d. Foreign country code in the merchant location string
    //     ('/Berlin/DEU', '/Luxembourg/LUX', '/SAN FRANCISCO/USA').
    //     Foreign location = online ordering from abroad. Latvian
    //     country code (LVA) doesn't mean physical though — could
    //     still be a LV-based online merchant — so we don't use
    //     LVA as a signal here.
    if (
      /\/(DEU|LUX|USA|GBR|EST|LTU|POL|FIN|SWE|NOR|DNK|IRL|NLD|FRA|ESP|ITA|CZE|AUT|RUS|UKR|CHN|JPN)\b/i.test(
        haystack
      )
    ) {
      return "automatiskie";
    }

    // 3e. Latvian city name in the merchant text without any
    //     online indicators (handled above) → strong physical
    //     signal. SEB embeds the merchant city directly in
    //     PmtInfo for in-store transactions.
    if (LATVIAN_CITIES.some((re) => re.test(haystack))) {
      return "fiziskie";
    }

    // 3f. Default for ambiguous PMNTCCRDOTHR — slightly biased
    //     toward online since most unrecognized merchants in our
    //     user data are online services. This is a regex
    //     fallback; the AI classifier (background pass) will
    //     refine it for the genuinely ambiguous cases.
    return "automatiskie";
  }

  // 4. Explicit online card / e-commerce type code
  if (ONLINE_CARD_TYPE_CODES.some((re) => re.test(haystack))) {
    return "automatiskie";
  }

  // 5. Online service brand match (Stripe, Google, Apple, etc.)
  if (ONLINE_SERVICE_PATTERNS.some((re) => re.test(haystack))) {
    return "automatiskie";
  }

  // 6. Match an existing supplier we have an invoice from
  if (
    tx.counterpartyIban &&
    ctx.knownSupplierIbans?.has(normalizeIban(tx.counterpartyIban))
  ) {
    return "izejosie";
  }

  // 7. Default — bank transfer to an unknown party. Goes to
  //    izejosie (regular outgoing) where the user can attach an
  //    invoice or re-classify if it was actually an online sub.
  return "izejosie";
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
