/**
 * Bank exchange utilities:
 *   - generatePain001XML — ISO 20022 pain.001.001.03 payment initiation
 *     file that all Baltic banks accept for batch payments
 *   - parseBankStatementCSV — flexible parser for SEB / Swedbank /
 *     Citadele / Luminor CSV exports; auto-detects column layout
 *   - matchTransactionsToInvoices — fuzzy match CSV rows against
 *     received invoices (amount + reference number)
 *
 * All functions are pure — no store/network side effects.
 */

import type { ReceivedInvoice } from "./billing-store";

// ============================================================
// pain.001 generation
// ============================================================

export interface PaymentBatchContext {
  /** Debtor (us) name as registered at bank */
  debtorName: string;
  /** Debtor IBAN (source account) */
  debtorIban: string;
  /** BIC / SWIFT of debtor bank (optional, helps routing) */
  debtorBic?: string;
  /** ISO date when the batch is intended for execution */
  requestedExecutionDate: string;
}

export interface BatchItemCreditor {
  /** Creditor (who we pay) name */
  name: string;
  /** Creditor IBAN */
  iban: string;
  /** Amount in EUR, will be formatted with 2 decimals */
  amount: number;
  /** End-to-end id / reference — usually the invoice number */
  reference: string;
  /** Remittance info — free text shown on the statement */
  remittance: string;
}

/**
 * Generate an ISO 20022 pain.001.001.03 XML payment initiation
 * file from a list of received payments. The file can be uploaded
 * to the business internet bank as a batch payment.
 */
export function generatePain001XML(
  ctx: PaymentBatchContext,
  items: BatchItemCreditor[]
): string {
  const msgId = `WM-${Date.now()}`;
  const now = new Date().toISOString();
  const total = items.reduce((s, i) => s + i.amount, 0);
  const ctrlSum = formatAmount(total);

  const txns = items
    .map((item, idx) => {
      const eid = `${msgId}-${idx + 1}`;
      return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(item.reference || eid)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${formatAmount(item.amount)}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${escapeXml(item.name)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${sanitizeIban(item.iban)}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(item.remittance)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(ctx.debtorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-P1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${ctx.requestedExecutionDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(ctx.debtorName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${sanitizeIban(ctx.debtorIban)}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          ${ctx.debtorBic ? `<BIC>${ctx.debtorBic}</BIC>` : `<Othr><Id>NOTPROVIDED</Id></Othr>`}
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txns}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

// ============================================================
// CSV bank statement parsing
// ============================================================

export interface ParsedTransaction {
  /** Raw date string from CSV */
  rawDate: string;
  /** ISO date YYYY-MM-DD if parsable */
  date?: string;
  /** Counterparty name (sender for issued, recipient for received) */
  counterparty: string;
  /** IBAN of the counterparty if present */
  counterpartyIban?: string;
  /** Signed amount — positive = issued, negative = received */
  amount: number;
  /** Reference/details free-text from the statement line */
  reference: string;
  /** Currency — usually EUR */
  currency: string;
  /** Original CSV row for debugging */
  raw: Record<string, string>;
}

/**
 * Parse a bank statement CSV. Auto-detects column layout by
 * looking at the header row — supports SEB, Swedbank, Citadele
 * and Luminor Latvian exports. Falls back to best-effort if
 * unknown format.
 *
 * Special handling:
 *   - Strips UTF-8 BOM from start of file
 *   - SEB Latvia exports a banner row first (account info + period),
 *     then the real headers on row 2. We detect this by looking
 *     for a header-like row in the first 5 lines.
 *   - SEB has a 'DEBETS/ KREDĪTS' column (D/C marker) plus a
 *     separate 'SUMMA KONTA VALŪTĀ' (account-currency amount).
 *     When the marker says D, the amount is debited (we made a
 *     payment → negative). When C, credited (we received → positive).
 *   - SEB rows often have a trailing empty field (line ends with ';')
 *     which we tolerate via length check.
 */
export function parseBankStatementCSV(csvText: string): ParsedTransaction[] {
  // Strip UTF-8 BOM if present (SEB exports include it)
  const text = csvText.replace(/^\uFEFF/, "").replace(/^\xEF\xBB\xBF/, "");

  const allRows = parseCSVRows(text);
  if (allRows.length < 2) return [];

  // Find the header row — usually row 0, but SEB puts a banner first.
  // The header is the first row with at least 4 non-empty cells AND
  // a 'date'-like column name. Falls back to row 0 if nothing matches.
  const headerRowIdx = findHeaderRowIndex(allRows);
  const header = allRows[headerRowIdx].map((h) => h.trim().toLowerCase());
  const dataRows = allRows
    .slice(headerRowIdx + 1)
    .filter((r) => r.some((c) => c.trim() !== ""));

  // Column index detection (shared across Baltic banks)
  const findCol = (candidates: string[]) =>
    header.findIndex((h) =>
      candidates.some((c) => h.includes(c.toLowerCase()))
    );

  const dateIdx = findCol([
    "datums",
    "date",
    "booking date",
    "valuation date",
    "grāmatošanas",
  ]);
  const counterpartyIdx = findCol([
    "partnera nosaukums", // SEB
    "saņēmējs / maksātājs",
    "saņēmējs",
    "maksātājs",
    "beneficiary",
    "counterparty",
    "partner",
    "nosaukums",
    "klienta nosaukums",
  ]);
  const ibanIdx = findCol([
    "partnera konts", // SEB
    "konts",
    "account",
    "iban",
  ]);
  // SEB has BOTH 'maksājuma summa' (transaction-currency amount)
  // AND 'summa konta valūtā' (account-currency = EUR equivalent).
  // Prefer the account-currency one for matching against invoices,
  // since invoices in this app are stored in EUR.
  const accountCurrencyAmountIdx = findCol([
    "summa konta val", // SEB 'SUMMA KONTA VALŪTĀ'
  ]);
  const amountIdx = findCol([
    "maksājuma summa", // SEB
    "summa",
    "amount",
  ]);
  // Credit/Debit split (Swedbank style — separate columns)
  const creditIdx = findCol(["kredīts", "credit"]);
  const debitIdx = findCol(["debets", "debit"]);
  // SEB single-column D/C marker ('debets/ kredīts' → "D" or "C")
  const dcMarkerIdx = findCol([
    "debets/ kredīts", // SEB
    "debets/kredīts",
    "d/c",
  ]);
  const referenceIdx = findCol([
    "maksājuma mērķis", // SEB
    "mērķis",
    "piezīmes",
    "details",
    "description",
    "reference",
  ]);
  const currencyIdx = findCol([
    "konta valūta", // SEB
    "valūta",
    "currency",
  ]);

  return dataRows.map((row) => {
    const rawObj: Record<string, string> = {};
    header.forEach((h, i) => (rawObj[h] = row[i] ?? ""));

    const rawDate = (dateIdx >= 0 ? row[dateIdx] : "").trim();
    const counterparty = (counterpartyIdx >= 0 ? row[counterpartyIdx] : "").trim();
    const iban = (ibanIdx >= 0 ? row[ibanIdx] : "").trim();
    const reference = (referenceIdx >= 0 ? row[referenceIdx] : "").trim();
    const currency = (currencyIdx >= 0 ? row[currencyIdx] : "EUR").trim() || "EUR";

    // Compute signed amount.
    // Order of preference:
    //   1. SEB-style: D/C marker + account-currency amount
    //   2. Swedbank-style: separate credit/debit columns
    //   3. Generic: single signed 'amount' column
    let amount = 0;
    if (dcMarkerIdx >= 0 && accountCurrencyAmountIdx >= 0) {
      const marker = (row[dcMarkerIdx] ?? "").trim().toUpperCase();
      const value = parseNum(row[accountCurrencyAmountIdx] ?? "");
      // D = debit (we paid out, money LEFT the account → positive
      // for matching against received invoices we owe).
      // C = credit (money came IN → negative in our convention,
      // since this represents incoming, not outgoing payments).
      amount = marker === "D" ? value : -value;
    } else if (dcMarkerIdx >= 0 && amountIdx >= 0) {
      // SEB without the account-currency split (rare): use the
      // transaction-currency amount with the D/C marker
      const marker = (row[dcMarkerIdx] ?? "").trim().toUpperCase();
      const value = parseNum(row[amountIdx] ?? "");
      amount = marker === "D" ? value : -value;
    } else if (creditIdx >= 0 && debitIdx >= 0) {
      const cr = parseNum(row[creditIdx] ?? "");
      const db = parseNum(row[debitIdx] ?? "");
      amount = db - cr; // debit positive (we owe / paid out)
    } else if (accountCurrencyAmountIdx >= 0) {
      amount = parseNum(row[accountCurrencyAmountIdx] ?? "");
    } else if (amountIdx >= 0) {
      amount = parseNum(row[amountIdx] ?? "");
    }

    return {
      rawDate,
      date: parseDateToISO(rawDate),
      counterparty,
      counterpartyIban: iban || undefined,
      amount,
      reference,
      currency,
      raw: rawObj,
    };
  });
}

/**
 * Find the row index that contains the column headers. SEB and some
 * other banks put a banner row first (account number + period). We
 * skip such rows by looking for the first row that has at least 4
 * cells AND contains a recognizable date column name.
 *
 * Falls back to row 0 if no header-like row is found in the first 5.
 */
function findHeaderRowIndex(rows: string[][]): number {
  const dateKeywords = ["datums", "date"];
  const maxCheck = Math.min(5, rows.length);
  for (let i = 0; i < maxCheck; i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase());
    if (cells.length < 4) continue;
    const hasDate = cells.some((c) =>
      dateKeywords.some((kw) => c === kw || c.includes(kw))
    );
    if (hasDate) return i;
  }
  return 0;
}

// ============================================================
// Matching transactions → invoices
// ============================================================

export type MatchConfidence = "exact" | "likely" | "none";

export interface InvoiceMatch {
  txIndex: number;
  invoiceId?: string;
  confidence: MatchConfidence;
  reason: string;
}

/**
 * Match parsed bank transactions to received (unpaid) payments.
 *   - exact   — amount matches AND reference contains invoice number
 *   - likely  — amount matches but reference is fuzzy
 *   - none    — no matching invoice found; user must classify
 *
 * Only received payments we still owe (status !== 'apmaksats') are
 * considered — everything else is already done.
 */
export function matchTransactionsToInvoices(
  transactions: ParsedTransaction[],
  unpaidReceived: ReceivedInvoice[]
): InvoiceMatch[] {
  return transactions.map((tx, txIndex): InvoiceMatch => {
    // We're matching OUTGOING payments → transaction should be negative
    // (money leaving our account). Skip issued transactions here.
    if (tx.amount >= 0) {
      return {
        txIndex,
        confidence: "none",
        reason: "Ienākoša transakcija — neatbilst maksājamiem rēķiniem",
      };
    }

    const absAmount = Math.abs(tx.amount);
    const refLower = tx.reference.toLowerCase();
    const counterpartyLower = tx.counterparty.toLowerCase();

    // Find candidates by amount (exact tolerance of 1 cent)
    const amountMatches = unpaidReceived.filter(
      (p) => Math.abs(p.amount - absAmount) < 0.015
    );

    if (amountMatches.length === 0) {
      return {
        txIndex,
        confidence: "none",
        reason: "Neviens neapmaksāts rēķins ar šādu summu",
      };
    }

    // Try exact match: reference or counterparty contains invoice
    // number OR supplier name matches counterparty
    const exact = amountMatches.find((p) => {
      const invNumLower = p.invoiceNumber.toLowerCase();
      const supplierLower = p.supplier.toLowerCase();
      // Invoice number appears in reference line
      if (invNumLower && refLower.includes(invNumLower)) return true;
      // Supplier name matches counterparty
      if (supplierLower && supplierLower.length >= 3) {
        const firstWord = supplierLower.split(/\s+/)[0];
        if (firstWord && counterpartyLower.includes(firstWord)) return true;
      }
      return false;
    });
    if (exact) {
      return {
        txIndex,
        invoiceId: exact.id,
        confidence: "exact",
        reason: `Atbilst: ${exact.supplier} · ${exact.invoiceNumber}`,
      };
    }

    // Single candidate by amount — likely match
    if (amountMatches.length === 1) {
      return {
        txIndex,
        invoiceId: amountMatches[0].id,
        confidence: "likely",
        reason: `Viena rēķina summa atbilst: ${amountMatches[0].supplier}`,
      };
    }

    // Multiple amount matches — ambiguous
    return {
      txIndex,
      confidence: "likely",
      reason: `${amountMatches.length} rēķini ar šādu summu — nepieciešama manuāla atbilstība`,
    };
  });
}

// ============================================================
// Helpers
// ============================================================

function parseCSVRows(text: string): string[][] {
  // Detect delimiter — try semicolon first (Baltic convention), then comma
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseNum(s: string): number {
  if (!s) return 0;
  const trimmed = s.trim().replace(/\s/g, "");
  if (!trimmed) return 0;

  // Detect format. Number strings come in three flavors:
  //   1. European with comma decimal: "1.234,56" or "30,00"
  //      → period = thousands separator, comma = decimal
  //   2. American/SEB style: "1,234.56" or "30.00"
  //      → comma = thousands separator, period = decimal
  //   3. Simple integer: "30" or "2486"
  //
  // Heuristic: if the LAST non-digit character in the string is
  // a comma, treat it as decimal (European style). If the last is
  // a period, treat it as decimal (American/SEB style). Strip the
  // OTHER separator wherever it appears.
  //
  // Examples:
  //   "30.00"      → last separator is '.', strip ',' → "30.00" → 30
  //   "30,00"      → last separator is ',', strip '.' → "30.00" → 30
  //   "2486.00"    → "2486.00" → 2486 (NOT 248600 like the old parser)
  //   "1.234,56"   → strip '.', swap ',' → "1234.56" → 1234.56
  //   "1,234.56"   → strip ',' → "1234.56" → 1234.56
  //   "12345"      → no separators → 12345

  const lastComma = trimmed.lastIndexOf(",");
  const lastPeriod = trimmed.lastIndexOf(".");

  let cleaned: string;
  if (lastComma > lastPeriod) {
    // Comma is the decimal — strip periods, swap comma to period
    cleaned = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (lastPeriod > lastComma) {
    // Period is the decimal — strip commas
    cleaned = trimmed.replace(/,/g, "");
  } else {
    // No separators at all
    cleaned = trimmed;
  }

  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDateToISO(s: string): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();

  // ISO already (2026-04-19 or 2026-04-19T...)
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // European DD.MM.YYYY or DD/MM/YYYY
  const eu = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (eu) {
    const dd = eu[1].padStart(2, "0");
    const mm = eu[2].padStart(2, "0");
    return `${eu[3]}-${mm}-${dd}`;
  }

  return undefined;
}

function formatAmount(n: number): string {
  return n.toFixed(2);
}

function sanitizeIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
