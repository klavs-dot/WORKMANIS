/**
 * Bank reconciliation — match bank transactions to invoices in
 * BOTH directions and assign payment statuses.
 *
 * Sesija 3 of the Rēķini-redesign. Builds on bank-exchange.ts
 * (which already had matchTransactionsToInvoices for outgoing only)
 * and the existing 35_payments tab (which already stores classified
 * bank transactions). What's new here:
 *
 *   1. INCOMING reconciliation
 *      Match positive-amount transactions (money RECEIVED into our
 *      account) against issued invoices in 30_invoices_out. When a
 *      match is found, mark that invoice as 'apmaksats'. Orphans
 *      (received money with no matching invoice) get flagged for
 *      manual upload — Sesija 4 will add the UI.
 *
 *   2. OUTGOING reconciliation
 *      Match negative-amount transactions (money WE PAID OUT)
 *      against received invoices in 31_invoices_in. Same flow.
 *
 *   3. Status state machine for invoices:
 *      apmaksats         — bank shows the money moved
 *      gaida_apmaksu     — invoice exists, no bank match yet
 *      nav_salidzinats   — most recent statement period_to is
 *                          before invoice's relevant date (we
 *                          can't determine status from missing data)
 *      maksajums_bez_rekina — bank has the money but no invoice
 *                          (only set on 35_payments orphan rows,
 *                          NOT on invoices)
 *
 * The matching logic itself is fairly tolerant — exact amount
 * (within €0.01) plus EITHER invoice number in the reference text
 * OR fuzzy supplier/client name match against counterparty.
 *
 * Why we don't use the existing matchTransactionsToInvoices()
 * directly: it's hardcoded for outgoing (negative amounts only)
 * and doesn't handle the date-bound 'nav_salidzinats' status.
 * We borrowed its core matching ideas but rebuilt the runner.
 */

export type PaymentStatus =
  | "apmaksats"
  | "gaida_apmaksu"
  | "nav_salidzinats"
  | "maksajums_bez_rekina";

export interface BankTransaction {
  /** Optional ID if already in 35_payments; new rows have undefined */
  paymentId?: string;
  /** ISO date YYYY-MM-DD of the transaction */
  date: string;
  /** Counterparty name (sender for incoming, recipient for outgoing) */
  counterparty: string;
  /** Counterparty IBAN if statement included it */
  counterpartyIban?: string;
  /** Signed amount in cents — positive = money in, negative = money out */
  amountCents: number;
  /** Free-text reference / payment details / memo */
  reference: string;
  /** ISO currency code (typically EUR) */
  currency: string;
}

export interface IssuedInvoiceRow {
  id: string;
  number: string;
  client: string;
  amountCents: number;
  issueDate: string;
  dueDate: string;
  /** Existing payment_status if any — we may overwrite */
  currentStatus?: PaymentStatus | "";
  /** Existing payment_id link if any */
  currentPaymentId?: string;
}

export interface ReceivedInvoiceRow {
  id: string;
  invoiceNumber: string;
  supplier: string;
  amountCents: number;
  dueDate: string;
  currentStatus?: PaymentStatus | "";
  currentPaymentId?: string;
}

/**
 * One line of reconciled output for a single invoice. The runner
 * returns an array of these — caller writes them back to the
 * Sheet via batch update.
 */
export interface InvoiceReconciliation {
  invoiceId: string;
  /** What status the invoice should have after reconciliation */
  newStatus: PaymentStatus;
  /** ID of the matching bank transaction, if any. The transaction
   *  itself may be an EXISTING 35_payments row (paymentId set on
   *  the BankTransaction input) or a NEW one we're about to insert
   *  (paymentId undefined; caller patches in the new ID after). */
  matchedTransaction?: BankTransaction;
  /** Match confidence so caller can decide UI emphasis */
  matchConfidence: "exact" | "likely" | "none";
  /** Latvian reason for surfacing in audit / tooltips */
  reason: string;
}

/**
 * One line of output per orphan transaction — money moved through
 * the bank with no matching invoice on file. Surfaced to the UI
 * with a 'Augšupielādēt manuāli' button (Sesija 4) so the user
 * can attach an invoice retroactively.
 */
export interface OrphanTransaction {
  transaction: BankTransaction;
  /** 'incoming' = money received with no issued invoice
   *  'outgoing' = we paid someone with no received invoice */
  direction: "incoming" | "outgoing";
  /** Latvian display reason */
  reason: string;
}

export interface ReconcileInput {
  issuedInvoices: IssuedInvoiceRow[];
  receivedInvoices: ReceivedInvoiceRow[];
  bankTransactions: BankTransaction[];
  /**
   * The most recent period_to from 39_bank_statements. Used to
   * decide which invoices are 'nav_salidzinats'. Pass undefined
   * if the user has never uploaded a bank statement.
   *
   * ISO date YYYY-MM-DD.
   */
  latestStatementDate?: string;
}

export interface ReconcileResult {
  /** Per-invoice status decisions (issued + received combined) */
  invoiceUpdates: InvoiceReconciliation[];
  /** Bank transactions that didn't match any invoice */
  orphans: OrphanTransaction[];
  /** Counts for the toast */
  summary: {
    matched: number;
    waiting: number;
    notReconciled: number;
    orphansIncoming: number;
    orphansOutgoing: number;
  };
}

/**
 * Tolerance for "this amount equals that amount". Bank fees and
 * rounding can push exact-cent matches off by a single cent on
 * round-trip currency conversions, so we accept ±0.01 EUR.
 */
const AMOUNT_TOLERANCE_CENTS = 1;

/**
 * Normalize a string for fuzzy comparison — lowercase, strip legal
 * forms (SIA / AS / etc.), remove punctuation.
 *
 * Intentionally simpler than company-matcher.ts's normalizeName():
 *   - We don't strip diacritics here (FIDAVISTA preserves them)
 *   - We don't sort tokens (counterparty names usually appear in
 *     the same order as recorded)
 *   - We DO strip legal forms because bank statements sometimes
 *     omit them ('Mosphera' instead of 'SIA Mosphera')
 *
 * Used only for 'first word of supplier appears in counterparty'
 * checks — not for primary identity matching, where we have
 * stronger signals (amount + invoice number).
 */
function fuzzyNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(sia|as|ik|ooo|ltd|gmbh|llc|inc)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check whether transaction reference or counterparty mentions the
 * invoice's identifying details. Returns 'exact' for invoice-number
 * match, 'likely' for name-only match, 'none' otherwise.
 *
 * Order matters: invoice number appearing in reference is a very
 * strong signal because the user typically pastes it into bank's
 * payment-purpose field. Counterparty name match alone is weaker
 * — generic suppliers ('SIA Latvenergo') receive many payments per
 * month and a name match doesn't narrow it down to a single invoice.
 */
function matchByContent(
  invoiceNumber: string,
  counterpartyName: string,
  tx: BankTransaction
): "exact" | "likely" | "none" {
  const refLower = tx.reference.toLowerCase();
  const ctpLower = tx.counterparty.toLowerCase();
  const invNumLower = invoiceNumber.toLowerCase().trim();

  // Strong: invoice number in reference (user pasted it)
  if (invNumLower && invNumLower.length >= 2 && refLower.includes(invNumLower)) {
    return "exact";
  }
  // Strong: invoice number in counterparty (some banks merge them)
  if (invNumLower && invNumLower.length >= 2 && ctpLower.includes(invNumLower)) {
    return "exact";
  }

  // Weak: first significant word of counterparty matches
  const cleanedCtp = fuzzyNormalize(counterpartyName);
  const cleanedTxCtp = fuzzyNormalize(tx.counterparty);
  if (cleanedCtp && cleanedCtp.length >= 3) {
    const firstWord = cleanedCtp.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3 && cleanedTxCtp.includes(firstWord)) {
      return "likely";
    }
  }

  return "none";
}

/**
 * Determine if an invoice predates our most recent bank statement.
 * If we have NO statement at all → every invoice is 'nav_salidzinats'.
 * If statement is older than the invoice → also 'nav_salidzinats'
 * because the bank file we have can't possibly contain a payment
 * for an invoice issued AFTER the statement period.
 *
 * Edge case: when we have a future-dated invoice (rare but possible
 * for prepayments), it's also nav_salidzinats — we shouldn't expect
 * a bank match for something that isn't due yet.
 */
function isInvoiceCoveredByStatement(
  invoiceDate: string,
  latestStatementDate?: string
): boolean {
  if (!latestStatementDate) return false;
  if (!invoiceDate) {
    // No date on the invoice — assume covered (better to mark as
    // gaida_apmaksu and let the user fix the date than to silently
    // hide it under nav_salidzinats)
    return true;
  }
  return invoiceDate <= latestStatementDate;
}

/**
 * Main reconcile entry point. Given lists of invoices + bank
 * transactions, return per-invoice statuses and orphan transactions.
 *
 * The function is PURE — it doesn't read or write any sheets.
 * Caller is responsible for fetching the inputs and persisting
 * the results. This keeps it testable and lets the caller batch
 * the writes efficiently.
 */
export function reconcileBankAndInvoices(
  input: ReconcileInput
): ReconcileResult {
  const { issuedInvoices, receivedInvoices, bankTransactions, latestStatementDate } = input;

  const invoiceUpdates: InvoiceReconciliation[] = [];
  const usedTxIndices = new Set<number>();

  // ───── Step 1: try to match each ISSUED invoice with an
  // INCOMING transaction (positive amount). When found, mark
  // 'apmaksats'. Process exact matches before likely ones across
  // ALL invoices to avoid an early invoice grabbing a tx that
  // would have been an exact match for a later invoice.
  //
  // Pass 1a: collect all candidates with confidence
  type Candidate = {
    invoiceId: string;
    isIssued: boolean;
    txIndex: number;
    confidence: "exact" | "likely";
  };
  const issuedCandidates: Candidate[] = [];
  for (const inv of issuedInvoices) {
    bankTransactions.forEach((tx, txIndex) => {
      if (tx.amountCents <= 0) return;
      if (Math.abs(tx.amountCents - inv.amountCents) > AMOUNT_TOLERANCE_CENTS) {
        return;
      }
      const confidence = matchByContent(inv.number, inv.client, tx);
      if (confidence === "none") return;
      issuedCandidates.push({
        invoiceId: inv.id,
        isIssued: true,
        txIndex,
        confidence,
      });
    });
  }

  // Pass 1b: same for received invoices vs OUTGOING transactions
  const receivedCandidates: Candidate[] = [];
  for (const inv of receivedInvoices) {
    bankTransactions.forEach((tx, txIndex) => {
      if (tx.amountCents >= 0) return;
      if (
        Math.abs(Math.abs(tx.amountCents) - inv.amountCents) >
        AMOUNT_TOLERANCE_CENTS
      ) {
        return;
      }
      const confidence = matchByContent(inv.invoiceNumber, inv.supplier, tx);
      if (confidence === "none") return;
      receivedCandidates.push({
        invoiceId: inv.id,
        isIssued: false,
        txIndex,
        confidence,
      });
    });
  }

  // Sort all candidates by confidence — exact wins ties so a
  // strongly-matched invoice gets the tx before a weakly-matched
  // one nabs it
  const allCandidates = [...issuedCandidates, ...receivedCandidates].sort(
    (a, b) => {
      if (a.confidence === b.confidence) return 0;
      return a.confidence === "exact" ? -1 : 1;
    }
  );

  const matchedInvoiceIds = new Map<string, Candidate>();
  for (const cand of allCandidates) {
    if (matchedInvoiceIds.has(cand.invoiceId)) continue; // already matched
    if (usedTxIndices.has(cand.txIndex)) continue; // tx already used
    matchedInvoiceIds.set(cand.invoiceId, cand);
    usedTxIndices.add(cand.txIndex);
  }

  // ───── Step 2: assign statuses for every invoice ─────
  for (const inv of issuedInvoices) {
    const match = matchedInvoiceIds.get(inv.id);
    if (match) {
      const tx = bankTransactions[match.txIndex];
      invoiceUpdates.push({
        invoiceId: inv.id,
        newStatus: "apmaksats",
        matchedTransaction: tx,
        matchConfidence: match.confidence,
        reason: `Apmaksāts ${tx.date} (${tx.counterparty})`,
      });
      continue;
    }
    // No match — decide between gaida_apmaksu and nav_salidzinats
    if (!isInvoiceCoveredByStatement(inv.issueDate, latestStatementDate)) {
      invoiceUpdates.push({
        invoiceId: inv.id,
        newStatus: "nav_salidzinats",
        matchConfidence: "none",
        reason: latestStatementDate
          ? `Bankas izraksts beidzas ${latestStatementDate}, rēķins izsniegts ${inv.issueDate}`
          : "Nav augšupielādēts neviens bankas izraksts",
      });
    } else {
      invoiceUpdates.push({
        invoiceId: inv.id,
        newStatus: "gaida_apmaksu",
        matchConfidence: "none",
        reason: "Nav saņemts maksājums bankā",
      });
    }
  }

  for (const inv of receivedInvoices) {
    const match = matchedInvoiceIds.get(inv.id);
    if (match) {
      const tx = bankTransactions[match.txIndex];
      invoiceUpdates.push({
        invoiceId: inv.id,
        newStatus: "apmaksats",
        matchedTransaction: tx,
        matchConfidence: match.confidence,
        reason: `Apmaksāts ${tx.date} (${tx.counterparty})`,
      });
      continue;
    }
    // For received invoices we use due_date as the relevance date
    // since they don't always carry an issue date in our schema
    const relevantDate = inv.dueDate || "";
    if (!isInvoiceCoveredByStatement(relevantDate, latestStatementDate)) {
      invoiceUpdates.push({
        invoiceId: inv.id,
        newStatus: "nav_salidzinats",
        matchConfidence: "none",
        reason: latestStatementDate
          ? `Bankas izraksts beidzas ${latestStatementDate}, rēķina termiņš ${relevantDate || "nav norādīts"}`
          : "Nav augšupielādēts neviens bankas izraksts",
      });
    } else {
      invoiceUpdates.push({
        invoiceId: inv.id,
        newStatus: "gaida_apmaksu",
        matchConfidence: "none",
        reason: "Nav veikts maksājums bankā",
      });
    }
  }

  // ───── Step 3: identify orphan transactions ─────
  const orphans: OrphanTransaction[] = [];
  bankTransactions.forEach((tx, idx) => {
    if (usedTxIndices.has(idx)) return;
    orphans.push({
      transaction: tx,
      direction: tx.amountCents > 0 ? "incoming" : "outgoing",
      reason:
        tx.amountCents > 0
          ? `Saņemts ${tx.amountCents / 100} EUR no ${tx.counterparty} — nav atrasts atbilstošs rēķins`
          : `Pārskaitīts ${Math.abs(tx.amountCents) / 100} EUR uz ${tx.counterparty} — nav atrasts atbilstošs rēķins`,
    });
  });

  const matched = invoiceUpdates.filter((u) => u.newStatus === "apmaksats").length;
  const waiting = invoiceUpdates.filter((u) => u.newStatus === "gaida_apmaksu").length;
  const notReconciled = invoiceUpdates.filter(
    (u) => u.newStatus === "nav_salidzinats"
  ).length;
  const orphansIncoming = orphans.filter((o) => o.direction === "incoming").length;
  const orphansOutgoing = orphans.filter((o) => o.direction === "outgoing").length;

  return {
    invoiceUpdates,
    orphans,
    summary: {
      matched,
      waiting,
      notReconciled,
      orphansIncoming,
      orphansOutgoing,
    },
  };
}
