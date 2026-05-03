/**
 * Invoice extraction tool definition + system prompt + result type.
 *
 * Shared between:
 *   - /api/invoices-in/parse (manual upload of a single PDF/image)
 *   - /lib/email-scanner (batch scan of Gmail attachments)
 *
 * Lived inside parse/route.ts originally, but Next.js's app-router
 * route file format only allows specific named exports (HTTP method
 * handlers like GET/POST, plus a small set of config constants like
 * maxDuration). Exporting EXTRACT_TOOL, SYSTEM_PROMPT, or any other
 * arbitrary values from route.ts causes the build to fail with
 * "Route ... does not match the required types of a Next.js Route".
 *
 * So: shared module here, route.ts and email-scanner.ts both import
 * from it.
 */

export const EXTRACT_TOOL = {
  name: "save_invoice_data",
  description:
    "Save the structured invoice data extracted from the document. Call this exactly once with the extracted fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      supplier_name: {
        type: "string",
        description:
          "The name of the company that issued this invoice (the supplier/vendor). Usually appears as 'SIA Something', 'AS Something', or as a header.",
      },
      supplier_reg_number: {
        type: "string",
        description:
          "Latvian company registration number (Reģ. Nr.) of the SUPPLIER — usually 11 digits. Empty string if not present.",
      },
      recipient_name: {
        type: "string",
        description:
          "Name of the company the invoice is BILLED TO (the buyer/recipient/customer). Look for 'Pircējs', 'Pasūtītājs', 'Klients', 'Adresāts', 'Bill to', 'Customer'. Important: this is DIFFERENT from the supplier — supplier is who SENT the invoice, recipient is who is supposed to PAY it.",
      },
      recipient_reg_number: {
        type: "string",
        description:
          "Latvian registration number of the recipient/buyer (Pircēja Reģ. Nr.) — 11 digits. Empty string if not present.",
      },
      invoice_number: {
        type: "string",
        description:
          "Invoice number / document number as printed on the invoice.",
      },
      amount_total: {
        type: "number",
        description:
          "Total amount to be paid INCLUDING VAT. Use the final 'Kopā', 'Apmaksai', 'Pavisam', or 'Total' figure.",
      },
      amount_without_vat: {
        type: "number",
        description:
          "Amount before VAT is added. If the invoice doesn't break this out separately, use 0.",
      },
      vat_amount: {
        type: "number",
        description: "VAT (PVN) amount in currency. Use 0 if not listed.",
      },
      currency: {
        type: "string",
        description:
          "Currency code (EUR, USD, etc.). Default to 'EUR' if no currency specified — most Latvian invoices are in euros.",
      },
      iban: {
        type: "string",
        description:
          "IBAN for the supplier's bank account (where payment goes). Latvian IBANs start with LV and are 21 chars total. Empty string if not present.",
      },
      due_date: {
        type: "string",
        description:
          "Payment due date in YYYY-MM-DD format. Look for 'Apmaksāt līdz', 'Termiņš', 'Due date'. Empty string if not present.",
      },
      issue_date: {
        type: "string",
        description:
          "Invoice issue date in YYYY-MM-DD format. Look for 'Datums', 'Izsniegts', 'Issued'.",
      },
      description: {
        type: "string",
        description:
          "Brief one-line summary of WHAT the invoice is for. This should also serve as the explanation a bookkeeper would need. Examples: 'Telekomunikācijas pakalpojumi 04/2026', 'Kancelejas preces (papīrs, pildspalvas)', 'Konsultāciju pakalpojumi par mārketinga stratēģiju'. Synthesize from line items. Be specific enough that a bookkeeper understands the business purpose.",
      },
      suggested_category: {
        type: "string",
        enum: [
          "izejvielas",
          "sarazota_produkcija",
          "sanemts_pakalpojums",
          "amortizacija",
        ],
        description:
          "Suggested accounting category for the bookkeeper. Pick ONE based on what was bought:\n- 'izejvielas' (raw materials): physical materials/goods used to produce something — wood, metal, fabric, electronic components\n- 'sarazota_produkcija' (finished goods): inventory items purchased for resale\n- 'sanemts_pakalpojums' (received service): services — consulting, telecoms, electricity, software subscriptions, accounting, transport, repairs, advertising, rent\n- 'amortizacija' (depreciation): one-time purchase of long-lived equipment > 1 year — vehicles, computers, machinery, furniture\n\nDefault to 'sanemts_pakalpojums' if uncertain — most invoices are services.",
      },
      suggested_depreciation_years: {
        type: "number",
        description:
          "Only when suggested_category is 'amortizacija': estimated useful life in years for depreciation. Common values:\n- 3 years: computers, phones, software\n- 5 years: office furniture, small machinery\n- 7 years: large machinery, vehicles\n- 10 years: buildings, infrastructure\nUse 0 when category is not 'amortizacija'.",
      },
      is_paid: {
        type: "boolean",
        description:
          "TRUE if there is clear visual evidence the invoice has ALREADY been paid. Look for: 'APMAKSĀTS' / 'PAID' / 'SAMAKSĀTS' stamps, paid-label watermarks, 'Status: Apmaksāts', attached payment confirmation, paid-in-full notations. FALSE for normal unpaid invoices. When in doubt, FALSE — only mark TRUE with strong visual evidence.",
      },
      paid_evidence: {
        type: "string",
        description:
          "If is_paid is TRUE, briefly describe what evidence you saw (e.g., 'Red APMAKSĀTS stamp at top-right', 'Status field reads Apmaksāts', 'Payment confirmation line at bottom'). Empty string if not paid.",
      },
      is_credit_note: {
        type: "boolean",
        description:
          "TRUE if this document is a CREDIT NOTE (Latvian: 'Kredītrēķins'), not a regular invoice. Credit notes return money to the customer or cancel part of a previous invoice. Indicators: title says 'Kredītrēķins' / 'Credit Note' / 'Kredīta rēķins' / 'Reverse', amounts are negative or shown with minus sign, document references an original invoice being credited. FALSE for regular invoices.",
      },
      credit_note_evidence: {
        type: "string",
        description:
          "If is_credit_note is TRUE, briefly describe what evidence you saw (e.g., 'Title reads Kredītrēķins', 'All amounts shown as negative', 'References original invoice 12345 being reversed'). Empty string if not a credit note.",
      },
      sources: {
        type: "object",
        description:
          "For each major extracted field, briefly state WHERE in the document you found it. Helps the user verify. Use short Latvian descriptions like 'No header', 'No tabulas augšā', 'Apakšā pie maksājuma rekvizītiem'.",
        properties: {
          supplier_name: { type: "string" },
          invoice_number: { type: "string" },
          amount_total: { type: "string" },
          iban: { type: "string" },
          due_date: { type: "string" },
        },
        required: [
          "supplier_name",
          "invoice_number",
          "amount_total",
          "iban",
          "due_date",
        ],
      },
      confidence: {
        type: "object",
        description:
          "Per-field confidence on a scale of 0.0-1.0. Lower confidence flags fields where the user should double-check. Be honest — if a field was hard to read, mark it low.",
        properties: {
          supplier_name: { type: "number" },
          supplier_reg_number: { type: "number" },
          invoice_number: { type: "number" },
          amount_total: { type: "number" },
          iban: { type: "number" },
          due_date: { type: "number" },
        },
        required: [
          "supplier_name",
          "supplier_reg_number",
          "invoice_number",
          "amount_total",
          "iban",
          "due_date",
        ],
      },
      notes: {
        type: "string",
        description:
          "Anything unusual or ambiguous about this document the user should know. Example: 'Document appears to be a quote, not an invoice', 'Two invoices on one page', 'Handwritten amount'. Empty string if nothing notable.",
      },
    },
    required: [
      "supplier_name",
      "recipient_name",
      "invoice_number",
      "amount_total",
      "amount_without_vat",
      "vat_amount",
      "currency",
      "iban",
      "due_date",
      "issue_date",
      "description",
      "suggested_category",
      "suggested_depreciation_years",
      "is_paid",
      "paid_evidence",
      "is_credit_note",
      "credit_note_evidence",
      "sources",
      "confidence",
    ],
  },
};
export const SYSTEM_PROMPT = `You are an expert at extracting structured data from Latvian invoices (rēķini).

You'll be given an invoice as a PDF or image. Your job is to extract specific fields and call the save_invoice_data tool with the results.

Important context for Latvian invoices:
- "Rēķins" or "PVN rēķins" = Invoice / VAT invoice
- "Pavadzīme" = Delivery note (often combined with an invoice)
- "Kopā" / "Pavisam" / "Apmaksai" = Total amount (with VAT)
- "Bez PVN" = Without VAT
- "PVN" = VAT (Latvian standard rate is 21%)
- "Apmaksāt līdz" / "Termiņš" = Due date
- "Reģ. Nr." = Company registration number (11 digits)
- "PVN reģ. Nr." = VAT registration number (starts with LV + 11 digits)
- IBAN format: LV + 2 check digits + 4-letter bank code + 13 digits = 21 chars total
- Date formats vary: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY — normalize to YYYY-MM-DD

If the document is NOT an invoice (e.g. it's a contract, receipt, or random photo), still call the tool but mark confidence very low (≤0.2) and explain in notes.

If a field is genuinely missing from the document, use an empty string (or 0 for numbers) rather than guessing. Mark confidence accordingly.

Be precise on amounts — invoice amounts are legally significant. If you can't read a digit clearly, mark amount_total confidence low.`;
export interface ParsedInvoice {
  supplier_name: string;
  supplier_reg_number: string;
  recipient_name: string;
  recipient_reg_number: string;
  invoice_number: string;
  amount_total: number;
  amount_without_vat: number;
  vat_amount: number;
  currency: string;
  iban: string;
  due_date: string;
  issue_date: string;
  description: string;
  suggested_category: string;
  suggested_depreciation_years: number;
  is_paid: boolean;
  paid_evidence: string;
  is_credit_note: boolean;
  credit_note_evidence: string;
  sources: {
    supplier_name: string;
    invoice_number: string;
    amount_total: string;
    iban: string;
    due_date: string;
  };
  confidence: {
    supplier_name: number;
    supplier_reg_number: number;
    invoice_number: number;
    amount_total: number;
    iban: number;
    due_date: number;
  };
  notes: string;
}
