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

// Tool definition + system prompt + result shape live in a
// shared library file because Next.js's route.ts format does
// not allow re-exporting arbitrary symbols.
import {
  EXTRACT_TOOL,
  SYSTEM_PROMPT,
  type ParsedInvoice,
} from "@/lib/invoice-extraction";


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
      model: "claude-opus-4-7",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL as Anthropic.Messages.Tool],
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
