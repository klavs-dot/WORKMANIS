/**
 * Bank statement XML parsing.
 *
 * Two related formats are supported:
 *   1. FIDAVISTA — Latvian banking standard (LATF). All Latvian
 *      banks (SEB, Swedbank, Citadele, Luminor, Industra, Rietumu)
 *      export this. XML root: <FIDAVISTA>.
 *   2. ISO 20022 camt.053 — international XML statement standard.
 *      Same data shape, different element names. XML root: <Document
 *      xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053..."> with a
 *      <BkToCstmrStmt> child.
 *
 * Both formats are flat enough that we don't need a full XML parser
 * package (would add ~50KB to the bundle for one feature). A small
 * tag-based extractor handles both. Resilient to whitespace,
 * attributes, namespace prefixes (e.g. <ns:Stmt>).
 *
 * Returns the same ParsedTransaction shape as parseBankStatementCSV
 * so downstream matching code stays unchanged.
 */

import type { ParsedTransaction } from "./bank-exchange";

// ============================================================
// Public API
// ============================================================

/**
 * Auto-detect format and parse. Recognized inputs:
 *   - FIDAVISTA XML (Latvian standard)
 *   - ISO 20022 camt.053 XML
 * Throws if the input doesn't look like a bank statement XML.
 */
export function parseBankStatementXML(text: string): ParsedTransaction[] {
  // Strip BOM if present
  const cleaned = text.replace(/^\uFEFF/, "").trim();

  // Detect by root-ish element. Tolerant to XML declaration, namespaces,
  // attributes, and whitespace. We look at the first 500 chars only —
  // parsers should NOT scan the entire body to detect format.
  const head = cleaned.slice(0, 500).toLowerCase();

  if (head.includes("<fidavista") || head.includes(":fidavista")) {
    return parseFidavista(cleaned);
  }
  if (
    head.includes("camt.053") ||
    head.includes("<bktocstmrstmt") ||
    head.includes(":bktocstmrstmt")
  ) {
    return parseCamt053(cleaned);
  }

  throw new Error(
    "Neatpazīts XML formāts. Nepieciešams FIDAVISTA vai camt.053."
  );
}

/**
 * True if the input looks like an XML bank statement (FIDAVISTA or
 * camt.053). Used by the file picker to route to the right parser
 * without throwing.
 */
export function isBankStatementXML(text: string): boolean {
  const head = text.replace(/^\uFEFF/, "").trim().slice(0, 500).toLowerCase();
  return (
    head.includes("<fidavista") ||
    head.includes(":fidavista") ||
    head.includes("camt.053") ||
    head.includes("<bktocstmrstmt") ||
    head.includes(":bktocstmrstmt")
  );
}

// ============================================================
// FIDAVISTA parser
// ============================================================

/**
 * Parse FIDAVISTA XML. Format spec: https://www.fid.lv/
 *
 * Real-world structure (verified against SEB output April 2026):
 *   <FIDAVISTA xmlns="http://www.bankasoc.lv/fidavista/...">
 *     <Header>...</Header>
 *     <Statement>
 *       <Period>...</Period>
 *       <AccountSet>
 *         <IBAN>LV74...</IBAN>
 *         <CcyStmt>
 *           <Ccy>EUR</Ccy>
 *           <OpenBal>...</OpenBal>
 *           <CloseBal>...</CloseBal>
 *           <TrxSet>                       ← one per transaction (NOT
 *                                            <Trx> as the older spec
 *                                            suggested — SEB and other
 *                                            LV banks use <TrxSet>)
 *             <TypeCode>MEMD</TypeCode>    ← short 4-letter SEB code
 *                                            (MEMD/OUTP/INP/CHIN)
 *             <TypeName>PMNTCCRDOTHR-      ← THIS is the ISO-20022-ish
 *                Pirkums</TypeName>          code we classify against
 *             <RegDate>2026-04-01</RegDate>
 *             <BookDate>2026-04-01</BookDate>
 *             <BankRef>RO19...</BankRef>
 *             <DocNo>CLR8...</DocNo>
 *             <CorD>D</CorD>               ← D = debit (we paid),
 *                                            C = credit (we received)
 *             <AccAmt>326.99</AccAmt>
 *             <PmtInfo>31/03/2026 08:49
 *                karte...658798 Insta360/
 *                Berlin/DEU #538964</PmtInfo>
 *             <CPartySet>
 *               <AccNo>LV12HABA...</AccNo> ← only present for
 *                                            transfers; card
 *                                            purchases skip this
 *               <AccHolder>
 *                 <Name>Insta360</Name>    ← merchant name nested
 *                                            ONE LEVEL DEEPER than
 *                                            the older spec
 *               </AccHolder>
 *               <BankCode>UNLALV2X</BankCode>
 *               <BankName>SEB BANKA</BankName>
 *               <Amt>326.99</Amt>
 *             </CPartySet>
 *           </TrxSet>
 *           ...
 *         </CcyStmt>
 *       </AccountSet>
 *     </Statement>
 *   </FIDAVISTA>
 *
 * Sign convention matches CSV path: D → positive (we paid),
 * C → negative (we received).
 */
function parseFidavista(xml: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];

  // Match <TrxSet>...</TrxSet> blocks. Tolerant to namespace
  // prefixes and arbitrary attributes on the open tag. The older
  // FIDAVISTA spec said <Trx> but actual bank output uses <TrxSet>
  // — we accept both.
  const trxRegex =
    /<(?:[\w-]+:)?(?:TrxSet|Trx)\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?(?:TrxSet|Trx)>/gi;

  let match: RegExpExecArray | null;
  while ((match = trxRegex.exec(xml)) !== null) {
    const block = match[1];

    const bookDate = extractTag(block, "BookDate");
    const valueDate = extractTag(block, "ValueDate");
    const regDate = extractTag(block, "RegDate");
    const corD = (extractTag(block, "CorD") || "").toUpperCase();
    const accAmtStr = extractTag(block, "AccAmt");
    const amtStr = extractTag(block, "Amt");
    const amtCcy = extractAttribute(block, "Amt", "Ccy");
    const pmtInfo = extractTag(block, "PmtInfo");
    // Name is nested: CPartySet > AccHolder > Name. extractTag
    // grabs the first <Name> in the block which is correct since
    // Name only appears once per TrxSet.
    const partyName = extractTag(block, "Name");
    const partyAccNo = extractTag(block, "AccNo");
    // TypeName carries the ISO-20022-ish code (PMNTCCRDOTHR-Pirkums
    // etc.). TypeCode is just a 4-letter SEB internal label that
    // doesn't match what the classifier looks for.
    const typeName = extractTag(block, "TypeName");
    const typeCode = extractTag(block, "TypeCode");

    const rawDate = bookDate || valueDate || regDate || "";
    const numericAmount = parseFloat(accAmtStr || amtStr || "0");
    if (isNaN(numericAmount)) continue;

    // D = debit = money LEFT account = we paid out → positive
    // C = credit = money came IN = we received → negative
    const signed = corD === "D" ? numericAmount : -numericAmount;

    out.push({
      rawDate,
      date: parseDateToISO(rawDate),
      counterparty: partyName || "",
      counterpartyIban: partyAccNo || undefined,
      amount: signed,
      reference: pmtInfo || "",
      currency: amtCcy || "EUR",
      raw: {
        BookDate: bookDate,
        ValueDate: valueDate,
        RegDate: regDate,
        CorD: corD,
        AccAmt: accAmtStr,
        Amt: amtStr,
        PmtInfo: pmtInfo,
        CPartyName: partyName,
        CPartyAcc: partyAccNo,
        // Save the FULL TypeName (PMNTCCRDOTHR-Pirkums) as the
        // classifier's haystack source — it's what payment-
        // classifier.ts pattern-matches against. The 4-letter
        // TypeCode is kept separately for debug.
        TypeCode: typeName || typeCode,
        TypeCodeShort: typeCode,
        TypeName: typeName,
      },
    });
  }

  return out;
}

// ============================================================
// ISO 20022 camt.053 parser
// ============================================================

/**
 * Parse ISO 20022 camt.053 (BankToCustomerStatement) XML.
 *
 * Structure (simplified):
 *   <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.XX">
 *     <BkToCstmrStmt>
 *       <Stmt>
 *         <Acct><Id><IBAN>LV74...</IBAN></Id></Acct>
 *         <Ntry>                       ← one per transaction
 *           <Amt Ccy="EUR">123.45</Amt>
 *           <CdtDbtInd>DBIT</CdtDbtInd>  ← DBIT (paid) or CRDT
 *           <BookgDt><Dt>2026-04-15</Dt></BookgDt>
 *           <NtryDtls><TxDtls>
 *             <RltdPties>
 *               <Cdtr><Nm>SIA Partner</Nm></Cdtr>  (or Dbtr)
 *               <CdtrAcct><Id><IBAN>LV12...</IBAN></Id></CdtrAcct>
 *             </RltdPties>
 *             <RmtInf><Ustrd>Reference text</Ustrd></RmtInf>
 *           </TxDtls></NtryDtls>
 *         </Ntry>
 *         ...
 *       </Stmt>
 *     </BkToCstmrStmt>
 *   </Document>
 */
function parseCamt053(xml: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];

  const ntryRegex = /<(?:[\w-]+:)?Ntry\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Ntry>/gi;
  let match: RegExpExecArray | null;
  while ((match = ntryRegex.exec(xml)) !== null) {
    const block = match[1];

    const amtStr = extractTag(block, "Amt");
    const amtCcy = extractAttribute(block, "Amt", "Ccy");
    const cdtDbt = (extractTag(block, "CdtDbtInd") || "").toUpperCase();
    const bookDt = extractNestedTag(block, "BookgDt", "Dt");
    const valueDt = extractNestedTag(block, "ValDt", "Dt");
    const reference = extractTag(block, "Ustrd");

    // Counterparty name: try Cdtr then Dbtr (depends on direction)
    const partyName =
      extractNestedTag(block, "Cdtr", "Nm") ||
      extractNestedTag(block, "Dbtr", "Nm") ||
      "";
    // Counterparty IBAN: try CdtrAcct then DbtrAcct
    const partyAcc =
      extractNestedTag(block, "CdtrAcct", "IBAN") ||
      extractNestedTag(block, "DbtrAcct", "IBAN") ||
      "";

    const rawDate = bookDt || valueDt || "";
    const numericAmount = parseFloat(amtStr || "0");
    if (isNaN(numericAmount)) continue;

    // DBIT = debit = we paid → positive in our convention
    // CRDT = credit = we received → negative
    const signed = cdtDbt === "DBIT" ? numericAmount : -numericAmount;

    out.push({
      rawDate,
      date: parseDateToISO(rawDate),
      counterparty: partyName,
      counterpartyIban: partyAcc || undefined,
      amount: signed,
      reference,
      currency: amtCcy || "EUR",
      raw: {
        BookgDt: bookDt,
        ValDt: valueDt,
        CdtDbtInd: cdtDbt,
        Amt: amtStr,
        Ustrd: reference,
        Nm: partyName,
        IBAN: partyAcc,
      },
    });
  }

  return out;
}

// ============================================================
// Tag extraction helpers
// ============================================================

/**
 * Extract the text content of the first occurrence of <tagName>...</tagName>
 * in the block. Tolerant to namespace prefixes and attributes.
 * Returns empty string if not found.
 */
function extractTag(block: string, tagName: string): string {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escapeRegex(
      tagName
    )}>`,
    "i"
  );
  const m = block.match(re);
  if (!m) return "";
  return decodeXml(m[1].trim());
}

/**
 * Extract the value of an attribute on the opening tag of <tagName>.
 * Used for things like <Amt Ccy="EUR">123.45</Amt> where Ccy is on
 * the tag itself.
 */
function extractAttribute(
  block: string,
  tagName: string,
  attrName: string
): string {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${escapeRegex(tagName)}\\b[^>]*?\\b${escapeRegex(
      attrName
    )}="([^"]*)"`,
    "i"
  );
  const m = block.match(re);
  return m ? m[1] : "";
}

/**
 * Extract a tag nested inside a parent tag. E.g.
 *   extractNestedTag(block, 'Cdtr', 'Nm')
 * pulls the <Nm>X</Nm> from inside the first <Cdtr>...</Cdtr>.
 *
 * Useful for camt.053's heavily-nested party structures where the
 * same tag name (Nm, IBAN) appears in multiple parent contexts.
 */
function extractNestedTag(
  block: string,
  parentTag: string,
  childTag: string
): string {
  const parentRe = new RegExp(
    `<(?:[\\w-]+:)?${escapeRegex(
      parentTag
    )}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escapeRegex(parentTag)}>`,
    "i"
  );
  const parentMatch = block.match(parentRe);
  if (!parentMatch) return "";
  return extractTag(parentMatch[1], childTag);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseDateToISO(s: string): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();

  // ISO already (2026-04-19 or 2026-04-19T...)
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // European DD.MM.YYYY
  const eu = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (eu) {
    const dd = eu[1].padStart(2, "0");
    const mm = eu[2].padStart(2, "0");
    return `${eu[3]}-${mm}-${dd}`;
  }

  return undefined;
}
