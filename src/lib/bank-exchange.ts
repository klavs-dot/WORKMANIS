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
 */
export function parseBankStatementCSV(csvText: string): ParsedTransaction[] {
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

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
    "saņēmējs",
    "saņēmējs / maksātājs",
    "maksātājs",
    "beneficiary",
    "counterparty",
    "partner",
    "nosaukums",
    "klienta nosaukums",
  ]);
  const ibanIdx = findCol(["konts", "account", "iban"]);
  const amountIdx = findCol(["summa", "amount"]);
  // Credit/Debit split (Swedbank style)
  const creditIdx = findCol(["kredīts", "credit"]);
  const debitIdx = findCol(["debets", "debit"]);
  const referenceIdx = findCol([
    "mērķis",
    "piezīmes",
    "details",
    "description",
    "reference",
    "maksājuma mērķis",
  ]);
  const currencyIdx = findCol(["valūta", "currency"]);

  return dataRows.map((row) => {
    const rawObj: Record<string, string> = {};
    header.forEach((h, i) => (rawObj[h] = row[i] ?? ""));

    const rawDate = (dateIdx >= 0 ? row[dateIdx] : "").trim();
    const counterparty = (counterpartyIdx >= 0 ? row[counterpartyIdx] : "").trim();
    const iban = (ibanIdx >= 0 ? row[ibanIdx] : "").trim();
    const reference = (referenceIdx >= 0 ? row[referenceIdx] : "").trim();
    const currency = (currencyIdx >= 0 ? row[currencyIdx] : "EUR").trim() || "EUR";

    // Compute signed amount
    let amount = 0;
    if (creditIdx >= 0 && debitIdx >= 0) {
      const cr = parseNum(row[creditIdx] ?? "");
      const db = parseNum(row[debitIdx] ?? "");
      amount = cr - db; // issued positive, received negative
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
  // Baltic banks often use comma decimal separator; strip thousand separators
  const cleaned = s.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
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
