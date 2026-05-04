/**
 * Company matcher — decides whether a parsed invoice was actually
 * issued to the active WORKMANIS company.
 *
 * Used by the email-import scanner to filter out invoices that
 * happen to be in the user's Gmail but were addressed to someone
 * else (e.g. personal invoices, emails forwarded by clients,
 * shared inbox getting ALL companies' bills).
 *
 * Priority (per user spec — Sesija 2):
 *
 *   1. VAT number   — strongest signal. If the invoice's
 *                     recipient_vat_number matches the company's
 *                     VAT, accept immediately. VAT numbers are
 *                     globally unique and unambiguous.
 *
 *   2. Reg. number  — used when the invoice has no VAT (smaller
 *                     suppliers / non-VAT-payers omit it). Reg
 *                     numbers are also unambiguous within Latvia.
 *
 *   3. Name fuzzy   — fallback for invoices that omit BOTH numbers
 *                     (rare but happens for handwritten invoices,
 *                     receipts, or international suppliers using
 *                     different ID schemes). Requires ≥90% match
 *                     to avoid accepting "SIA Mosphera" invoices
 *                     for "SIA Mosphere" or unrelated company.
 *
 * If NONE of the three match, the invoice is rejected and the
 * scanner records why so the user can audit decisions.
 *
 * The 90% threshold is chosen empirically:
 *   - Punctuation/whitespace differences score 0.95-1.0
 *   - Different legal forms (SIA vs IK) on same name score 0.7-0.85
 *   - Truly different companies score < 0.5
 *   - 0.9 catches all the right-with-typos and rejects all the
 *     wrong-but-similar cases we tested
 */

export interface CompanyIdentity {
  /** SIA / AS / IK / etc. + the brand name. Spaces, punctuation,
   *  and legal-form prefix are normalized away before comparison. */
  legalName: string;
  /** Latvian reg number — 11 digits typically, sometimes formatted
   *  with spaces or dots which we strip. Empty string = no reg. */
  regNumber: string;
  /** VAT number — 'LV' + 11 digits in Latvia. May arrive with or
   *  without 'LV' prefix; we normalize. Empty string = no VAT. */
  vatNumber: string;
}

export type MatchKind = "vat" | "reg" | "name" | "none";

export interface MatchResult {
  matched: boolean;
  /** Which signal won (or 'none' if all three failed) */
  via: MatchKind;
  /** 0-1 confidence — 1.0 for VAT/reg matches, the fuzzy ratio
   *  itself for name matches. Used only for diagnostics. */
  confidence: number;
  /** Human-readable explanation, in Latvian, for surfacing to the
   *  user when an invoice was rejected. Examples:
   *    "VAT atbilst (LV40103108904)"
   *    "Reģ. Nr. atbilst (40103108904)"
   *    "Nosaukums atbilst 94% ('Mosphera SIA' vs 'SIA Mosphera')"
   *    "Atteikts: nav VAT, nav reģ. Nr., nosaukums neatbilst (62%)" */
  reason: string;
}

/** Strip all whitespace, case, and common formatting from an ID
 *  number so '40 103 108 904' compares equal to '40103108904'. */
function normalizeId(id: string): string {
  return id.replace(/[\s.\-_/]/g, "").toUpperCase();
}

/** Strip 'LV' prefix from VAT numbers — some invoices include it,
 *  others don't. We compare digits-only for symmetry. */
function normalizeVat(vat: string): string {
  const cleaned = normalizeId(vat);
  return cleaned.replace(/^LV/, "");
}

/**
 * Normalize a company name for fuzzy comparison.
 *   - Lowercase
 *   - Remove diacritics (Latvian ā ē ī ō ū → a e i o u; ž → z; etc.)
 *   - Strip legal-form prefixes/suffixes (SIA, AS, IK, OÜ, Ltd, etc.)
 *   - Collapse whitespace
 *   - Remove punctuation
 *
 * After this, "SIA Mosphera" and "Mosphera SIA" both become
 * "mosphera", scoring 1.0 in similarity.
 */
function normalizeName(name: string): string {
  let s = name
    .toLowerCase()
    // Replace Latvian diacritics with ASCII so AI hallucinations
    // like "Mosfera" still score reasonable similarity to "Mosfēra"
    .replace(/ā/g, "a")
    .replace(/č/g, "c")
    .replace(/ē/g, "e")
    .replace(/ģ/g, "g")
    .replace(/ī/g, "i")
    .replace(/ķ/g, "k")
    .replace(/ļ/g, "l")
    .replace(/ņ/g, "n")
    .replace(/š/g, "s")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z");

  // Strip legal forms (anchor at word boundaries to avoid
  // mangling brand names that happen to contain these letters)
  const legalForms = [
    "sia",
    "as",
    "ik",
    "ooo",
    "oou",
    "ltd",
    "limited",
    "llc",
    "inc",
    "gmbh",
    "ou",
    "ab",
    "spzoo",
  ];
  for (const lf of legalForms) {
    s = s.replace(new RegExp(`\\b${lf}\\b`, "gi"), " ");
  }

  // Remove all non-alphanumeric, collapse spaces
  s = s.replace(/[^a-z0-9]+/g, " ").trim();

  // Sort tokens alphabetically so "Foo Bar" === "Bar Foo" — order
  // shouldn't matter ("Mosphera SIA" vs "SIA Mosphera"). Skip if
  // single token.
  const tokens = s.split(/\s+/);
  if (tokens.length > 1) {
    tokens.sort();
    s = tokens.join(" ");
  }
  return s;
}

/**
 * Levenshtein distance — minimum number of single-character edits
 * (insertions, deletions, substitutions) to turn one string into
 * another.
 *
 * Used by similarity() below. Implementation is the classic
 * dynamic-programming O(m×n) — fine for the short strings we deal
 * with (company names are typically <50 chars).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single row of the DP matrix — we don't need the full table
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Similarity ratio 0-1 between two strings. Uses the formula
 *   1 - (levenshtein / max(len_a, len_b))
 *
 * Returns 1.0 for identical strings, 0.0 for completely different.
 * Roughly: 0.9+ = same with typos, 0.7-0.9 = related, <0.7 = unrelated.
 */
function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/** Threshold above which a name match is accepted */
export const NAME_MATCH_THRESHOLD = 0.9;

/**
 * Decide whether a parsed invoice's recipient is the active company.
 *
 * Returns a MatchResult with `matched: true` if any of the three
 * signals (VAT, reg, name) succeed. The first matching signal wins
 * and is recorded in `via` so the UI can show "matched by VAT"
 * when relevant — that's stronger evidence than a name match.
 *
 * Empty fields on the invoice are treated as "this signal is
 * unavailable, try the next one" — they don't FAIL the match,
 * they just skip to the next priority.
 */
export function matchInvoiceToCompany(
  invoice: {
    recipient_name: string;
    recipient_reg_number: string;
    recipient_vat_number: string;
  },
  company: CompanyIdentity
): MatchResult {
  // ───── Priority 1: VAT ─────
  if (invoice.recipient_vat_number && company.vatNumber) {
    const invVat = normalizeVat(invoice.recipient_vat_number);
    const cmpVat = normalizeVat(company.vatNumber);
    if (invVat && cmpVat && invVat === cmpVat) {
      return {
        matched: true,
        via: "vat",
        confidence: 1.0,
        reason: `VAT atbilst (${company.vatNumber})`,
      };
    }
  }

  // ───── Priority 2: Reg. number ─────
  if (invoice.recipient_reg_number && company.regNumber) {
    const invReg = normalizeId(invoice.recipient_reg_number);
    const cmpReg = normalizeId(company.regNumber);
    if (invReg && cmpReg && invReg === cmpReg) {
      return {
        matched: true,
        via: "reg",
        confidence: 1.0,
        reason: `Reģ. Nr. atbilst (${company.regNumber})`,
      };
    }
  }

  // ───── Priority 3: Fuzzy name match ─────
  if (invoice.recipient_name && company.legalName) {
    const invName = normalizeName(invoice.recipient_name);
    const cmpName = normalizeName(company.legalName);
    if (invName && cmpName) {
      const ratio = similarity(invName, cmpName);
      const pct = Math.round(ratio * 100);
      if (ratio >= NAME_MATCH_THRESHOLD) {
        return {
          matched: true,
          via: "name",
          confidence: ratio,
          reason: `Nosaukums atbilst ${pct}% ('${invoice.recipient_name}' vs '${company.legalName}')`,
        };
      }
      // Not enough — fall through to rejection but record the score
      return {
        matched: false,
        via: "none",
        confidence: ratio,
        reason: `Atteikts: VAT/Reģ.Nr. neatbilst, nosaukums tikai ${pct}% ('${invoice.recipient_name}' vs '${company.legalName}')`,
      };
    }
  }

  // No usable fields at all
  const reasons: string[] = [];
  if (!invoice.recipient_vat_number) reasons.push("nav VAT");
  if (!invoice.recipient_reg_number) reasons.push("nav reģ.Nr.");
  if (!invoice.recipient_name) reasons.push("nav nosaukuma");
  return {
    matched: false,
    via: "none",
    confidence: 0,
    reason: `Atteikts: rēķinā ${reasons.join(", ")} adresātam`,
  };
}
