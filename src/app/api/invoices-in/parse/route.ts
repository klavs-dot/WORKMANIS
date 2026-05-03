/**
 * POST /api/invoices-in/parse
 *
 * Accepts a PDF or image (multipart/form-data, field name 'file')
 * and uses Claude Sonnet 4.6 with vision to extract structured
 * invoice data:
 *   - supplier name + reg number (if present)
 *   - invoice number
 *   - amount (total with VAT)
 *   - amount without VAT (if separately listed)
 *   - VAT amount
 *   - IBAN for payment
 *   - due date
 *   - issue date
 *   - description (free-form line items summary)
 *   - currency
 *
 * Plus a per-field confidence score so the UI can highlight
 * fields where the model wasn't sure.
 *
 * The endpoint does NOT save anything to Sheets — that's the
 * UI's responsibility after the user reviews and confirms the
 * extracted data. This separation keeps the parsing operation
 * idempotent and lets users back out if extraction is bad.
 *
 * Authentication: requires an authenticated user session.
 * Anthropic API key is read from process.env.ANTHROPIC_API_KEY
 * server-side only — never exposed to the browser.
 *
 * Cost: ~$0.003 per single-page invoice (Claude Sonnet 4.6
 * pricing as of April 2026). 100 invoices/month ≈ $0.30. Cap
 * via Anthropic Console spending limit if needed.
 *
 * Limits:
 *   - Max file size: 10 MB (Vercel function body limit; Anthropic
 *     accepts up to 32 MB but our practical cap is lower)
 *   - Max PDF pages: 100 (Anthropic limit). Real invoices are
 *     1-3 pages so this is never reached.
 *   - Supported formats: PDF, JPG, PNG, WebP, GIF
 *
 * Errors:
 *   - 401 if not authenticated
 *   - 400 if no file or unsupported type
 *   - 413 if file too large
 *   - 502 if Anthropic API fails (rate limit, downtime)
 *   - 500 on parse errors (Claude returned non-JSON, etc.)
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const SUPPORTED_PDF_TYPES = new Set(["application/pdf"]);
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Tool definition Claude must call. Using tool use instead of
// asking-for-JSON because tool use guarantees the response shape
// matches the schema — Claude can't accidentally include prose
// or markdown around the JSON.
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

export async function POST(request: Request) {
  // Auth check — only logged-in users can hit this endpoint
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Server-side env var. If missing, return a friendly error so
  // the user knows it's a config issue, not their fault.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set in environment");
    return NextResponse.json(
      {
        error:
          "Servera konfigurācijas kļūda. Lūdzu sazinieties ar administratoru.",
      },
      { status: 500 }
    );
  }

  // Parse multipart form
  let file: File | null = null;
  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    if (fileEntry instanceof File) {
      file = fileEntry;
    }
  } catch (err) {
    console.error("Failed to parse form data:", err);
    return NextResponse.json(
      { error: "Nederīgs faila formāts" },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json({ error: "Fails nav atrasts" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `Fails pārāk liels (${Math.round(file.size / 1024 / 1024)} MB). Maksimālais izmērs: 10 MB.`,
      },
      { status: 413 }
    );
  }

  const mimeType = file.type;
  const isPdf = SUPPORTED_PDF_TYPES.has(mimeType);
  const isImage = SUPPORTED_IMAGE_TYPES.has(mimeType);

  if (!isPdf && !isImage) {
    return NextResponse.json(
      {
        error: `Neatbalstīts faila tips: ${mimeType}. Atbalstītie: PDF, JPG, PNG, WebP, GIF.`,
      },
      { status: 400 }
    );
  }

  // Read file into base64
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  // Build the content block depending on file type
  const fileContentBlock: Anthropic.Messages.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif",
          data: base64,
        },
      };

  // Call Claude
  const anthropic = new Anthropic({ apiKey });

  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "save_invoice_data" },
      messages: [
        {
          role: "user",
          content: [
            fileContentBlock,
            {
              type: "text",
              text: "Please extract the invoice fields from this document and call save_invoice_data with the structured data.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("Anthropic API error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `AI servisa kļūda: ${message}` },
      { status: 502 }
    );
  }

  // Find the tool_use block in the response
  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === "save_invoice_data"
  );

  if (!toolUse) {
    console.error("No tool_use block in response:", response.content);
    return NextResponse.json(
      { error: "AI neatgrieza strukturētus datus. Mēģiniet vēlreiz." },
      { status: 500 }
    );
  }

  const parsed = toolUse.input as ParsedInvoice;

  // Map to our API shape used by the rest of /api/invoices-in
  return NextResponse.json({
    ok: true,
    data: {
      supplier: parsed.supplier_name,
      supplier_reg_number: parsed.supplier_reg_number || undefined,
      recipient: parsed.recipient_name || undefined,
      recipient_reg_number: parsed.recipient_reg_number || undefined,
      invoice_number: parsed.invoice_number,
      amount: parsed.amount_total,
      amount_without_vat: parsed.amount_without_vat,
      vat_amount: parsed.vat_amount,
      currency: parsed.currency || "EUR",
      iban: parsed.iban,
      due_date: parsed.due_date,
      issue_date: parsed.issue_date,
      description: parsed.description,
      suggested_category: parsed.suggested_category,
      suggested_depreciation_years:
        parsed.suggested_depreciation_years > 0
          ? parsed.suggested_depreciation_years
          : undefined,
      is_paid: parsed.is_paid,
      paid_evidence: parsed.paid_evidence || undefined,
      is_credit_note: parsed.is_credit_note,
      credit_note_evidence: parsed.credit_note_evidence || undefined,
      sources: parsed.sources,
      confidence: parsed.confidence,
      notes: parsed.notes || undefined,
    },
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
