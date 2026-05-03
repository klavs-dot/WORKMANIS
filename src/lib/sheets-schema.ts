/**
 * Sheets schema — TypeScript single source of truth for the
 * 25 company.gsheet tabs.
 *
 * Mirrors the COMPANY_TABS structure in the Apps Script setup
 * script (setup-script.gs). When a column or table is added,
 * update both files.
 *
 * The schema serves three purposes:
 *   1. ID prefix lookup for SheetsClient.generateId()
 *   2. Column order for write operations (must match what
 *      Apps Script writes to the header row)
 *   3. Type-level table name validation (TableName union)
 */

export interface TableSchema {
  name: string;
  /** Prefix for auto-generated IDs (e.g. 'cli' → 'cli-190426-1') */
  idPrefix: string;
  /** Business columns in order, after the universal A-D columns */
  cols: readonly string[];
}

// ============================================================
// company.gsheet tabs
// ============================================================

export const COMPANY_TABS = [
  // 01 — company core
  //
  // Single-row tab holding the active company's full requisites
  // (legal name, registration numbers, addresses, contact details,
  // bank info, logo). One row per company; the row is upserted on
  // edit. The id is always 'req-001' so we always know which row
  // to update.
  //
  // The fields here are the SOURCE OF TRUTH for the company's
  // identity. Anything that displays company info (invoice PDFs,
  // PN akts headers, dashboard sidebar, copy-requisites buttons)
  // reads from this row, NOT from the account-master 01_companies
  // tab — that one only has the minimum needed to find this sheet
  // (id, slug, sheet_id, folder_id).
  //
  // logo_drive_id stores the file ID of the uploaded logo (PNG/
  // SVG) under the company root folder's logos/ subdirectory.
  // The img src renders via /api/drive/files/[id]?company_id=X.
  {
    name: "01_requisites",
    idPrefix: "req",
    cols: [
      "name",
      "legal_name",
      "reg_number",
      "vat_number",
      "legal_address",
      "delivery_address",
      "contact_email",
      "invoice_email",
      "iban",
      "bank_name",
      "swift",
      "phone",
      "website",
      "logo_drive_id",
      "director_name",
      "director_position",
    ],
  },

  // 10 — relationships
  {
    name: "10_clients",
    idPrefix: "cli",
    cols: [
      "name",
      "type",
      "reg_number",
      "vat_number",
      "personal_code",
      "country_code",
      "address",
      "iban",
      "email",
      "phone",
      "contact_person",
      "notes",
      "tags",
      "first_invoice_date",
      "total_invoiced_cents",
    ],
  },
  {
    name: "11_distributors",
    idPrefix: "dis",
    cols: [
      "name",
      "country_code",
      "address",
      "requisites",
      "comment",
    ],
  },
  {
    name: "12_suppliers",
    idPrefix: "sup",
    cols: [
      "name",
      "reg_number",
      "vat_number",
      "iban",
      "category",
      "default_explanation",
      "typical_account_code",
      "website",
      "email",
      "phone",
      "notes",
      "first_invoice_date",
      "last_invoice_date",
    ],
  },
  {
    name: "13_online_links",
    idPrefix: "lnk",
    cols: ["product_name", "url", "comment"],
  },
  {
    name: "14_demo_units",
    idPrefix: "dem",
    cols: [
      "name",
      "tester",
      "location",
      "comment",
    ],
  },
  {
    name: "15_partners",
    idPrefix: "par",
    cols: [
      "category",
      "name",
      "reg_number",
      "country_code",
      "address",
      "contact_person",
      "email",
      "phone",
      "comment",
    ],
  },

  // 20 — employees
  {
    name: "20_employees",
    idPrefix: "emp",
    cols: [
      "first_name",
      "last_name",
      "personal_code",
      "email",
      "phone",
      "status",
      "position",
      "started_at",
      "notes",
      // Compliance fields — flattened for filterability in Sheets
      "ovp_passed",
      "ovp_last_check_date",
      "ovp_next_due_date",
      "ovp_notes",
      "safety_passed",
      "safety_last_briefing_date",
      "safety_next_due_date",
      "safety_briefing_type",
      "safety_notes",
      // Drive integration (future)
      "photo_drive_id",
      "folder_drive_id",
    ],
  },
  {
    name: "21_contracts",
    idPrefix: "con",
    cols: [
      "type",
      "counterparty_kind",
      "employee_id",
      "client_id",
      "supplier_id",
      "external_party_name",
      "title",
      "start_date",
      "end_date",
      "signed_date",
      "document_drive_id",
      "status",
      "notes",
    ],
  },
  {
    name: "22_bank_accounts",
    idPrefix: "ban",
    cols: ["employee_id", "iban", "bic", "bank_name", "is_primary", "label"],
  },
  {
    name: "23_compliance",
    idPrefix: "cmp",
    cols: [
      "employee_id",
      "type",
      "issued_date",
      "expiry_date",
      "document_drive_id",
      "notes",
    ],
  },
  {
    name: "25_orders",
    idPrefix: "ord",
    cols: [
      "type",
      "title",
      "issue_date",
      "employee_id",
      "employee_name",
      "destination_from",
      "destination_to",
      "trip_start_date",
      "trip_end_date",
      "vacation_start_date",
      "vacation_end_date",
      "vacation_pay_timing",
      "notes",
      "file_name",
    ],
  },

  // 30 — invoices and payments
  //
  // 30_invoices_out: invoices YOU issue to YOUR clients (money
  // coming in).  Maps to billing-store's 'issued' entity (IssuedInvoice).
  {
    name: "30_invoices_out",
    idPrefix: "inv",
    cols: [
      "number",
      "client",
      "description",
      "amount_cents",
      "vat_cents",
      "issue_date",
      "due_date",
      "status",
      "delivery_note",
      "pn_akts",
      "pn_akts_source",
      "pn_akts_file_name",
      // 2026-04 — added Drive file IDs for the per-card download/view
      // feature. file_drive_id holds the invoice PDF; pn_akts_drive_id
      // holds the PN akts PDF; delivery_note_drive_id holds the
      // pavadzīme PDF. Empty string means no file uploaded yet.
      "file_drive_id",
      "pn_akts_drive_id",
      "delivery_note_drive_id",
    ],
  },
  // 31_invoices_in: invoices you RECEIVE from suppliers (money
  // going out). Maps to billing-store's 'received' entity (ReceivedInvoice).
  {
    name: "31_invoices_in",
    idPrefix: "out",
    cols: [
      "supplier",
      "invoice_number",
      "description",
      "amount_cents",
      "iban",
      "due_date",
      "status",
      "file_name",
      "pn_akts",
      "pn_akts_source",
      "pn_akts_file_name",
      "accounting_category",
      "depreciation_period",
      "accounting_explanation",
      "accounting_updated_at",
      // 2026-04 — Internet payments feature. Source channel
      // distinguishes manually-added invoices from those auto-detected
      // by scanning the user's Gmail for receipt PDFs. payment_evidence
      // holds a Drive file URL when the invoice was matched against a
      // bank statement transaction (so the user has proof that the
      // listed payment actually went through).
      "source_channel",
      "payment_evidence",
      // 2026-04 — Drive file IDs for per-card download/view feature.
      // file_drive_id holds the supplier invoice PDF; pn_akts_drive_id
      // holds an associated PN akts PDF. Empty = no file uploaded.
      "file_drive_id",
      "pn_akts_drive_id",
    ],
  },
  {
    name: "32_pn_akti",
    idPrefix: "pn",
    cols: [
      "pn_number",
      "source",
      "direction",
      "invoice_out_id",
      "invoice_in_id",
      "issued_date",
      "description",
      "pdf_drive_id",
      "original_filename",
    ],
  },
  {
    name: "33_delivery_notes",
    idPrefix: "del",
    cols: [
      "delivery_number",
      "invoice_out_id",
      "issued_date",
      "description",
      "recipient_name",
      "recipient_address",
      "pdf_drive_id",
    ],
  },
  {
    name: "34_invoice_templates",
    idPrefix: "tem",
    cols: [
      "keyword",
      "client_id",
      "language",
      "content_json",
      "reference",
    ],
  },
  {
    // Bank-imported transactions ledger.
    //
    // Originally designed as a generic 'payments' table; repurposed
    // for the FIDAVISTA / camt.053 import flow where every parsed
    // transaction is persisted here. Three reasons to persist:
    //   1. So unmatched transactions don't disappear when the import
    //      panel closes — user needs to attach receipts to them later
    //   2. So we can show 'this bank tx → this invoice' relationships
    //      in the UI without re-running matching every load
    //   3. So duplicate imports are detectable (bank_reference is
    //      unique-ish per bank)
    //
    // 'classified_section' holds the auto-classification result
    // (ienakosie / izejosie / automatiskie / fiziskie) so each tab
    // can filter directly without re-classifying on every render.
    //
    // 'matched_invoice_id' is the local invoice-in/invoice-out ID
    // when the importer found an exact match; empty when no match.
    // Empty + outgoing = the red 'missing receipt' warning row.
    name: "35_payments",
    idPrefix: "pay",
    cols: [
      "direction",
      "category",
      "invoice_out_id",
      "invoice_in_id",
      "salary_id",
      "tax_id",
      "counterparty",
      "counterparty_iban",
      "amount_cents",
      "payment_date",
      "bank_account_iban",
      "bank_reference",
      "source",
      "imported_from_csv_filename",
      // Added 2026-04 for the FIDAVISTA import + classification flow:
      "classified_section",
      "matched_invoice_id",
      "raw_reference",
    ],
  },
  {
    name: "36_salaries",
    idPrefix: "sal",
    cols: [
      "employee_id",
      "employee_name",
      "amount_cents",
      "period",
      "type",
      "status",
      "paid_at",
    ],
  },
  {
    name: "37_taxes",
    idPrefix: "tax",
    cols: [
      "name",
      "amount_cents",
      "due_date",
      "status",
    ],
  },
  {
    name: "38_accounting_meta",
    idPrefix: "met",
    cols: [
      "invoice_in_id",
      "category",
      "account_code",
      "depreciation_period",
      "explanation",
      "created_by",
      "reviewed_by_accountant",
    ],
  },

  // 40 — assets
  {
    name: "40_assets",
    idPrefix: "ass",
    cols: [
      "category",
      "name",
      "comment",
      "status",
      "note",
      "note_color",
      "reminder_date",
      "folder_drive_id",
      "acquired_date",
      "acquired_cost_cents",
    ],
  },

  // 50 — documents
  {
    name: "50_documents",
    idPrefix: "doc",
    cols: [
      "kind",
      "language",
      "sender_kind",
      "sender_id",
      "sender_name",
      "sender_address",
      "recipient_kind",
      "recipient_id",
      "recipient_name",
      "recipient_address",
      "subject",
      "body",
      "issued_date",
      "pdf_drive_id",
      "signed",
      "has_physical_signature",
      "signed_drive_id",
    ],
  },

  // 60 — email import sync state
  //
  // Tracks each Gmail scan run so we know:
  //   - WHEN we last scanned (so the next scan only fetches
  //     emails newer than this — we never re-scan the same period)
  //   - WHICH mailbox (INBOX or SENT) — they're scanned
  //     independently with different invoice direction defaults
  //   - HOW many emails were found and how many actually became
  //     invoice records (the gap is rejected non-invoice emails,
  //     duplicates, etc.)
  //
  // One row per scan run. The last_message_internal_date column
  // holds the largest Gmail internalDate (epoch millis as string)
  // we processed in this run — the next run uses
  // 'after:<seconds>' query to fetch only newer messages.
  //
  // First scan with no previous row → defaults to fetching the
  // last 31 days. After that, every subsequent scan reads only
  // since the previous run's last_message_internal_date.
  {
    name: "60_email_imports",
    idPrefix: "emi",
    cols: [
      "mailbox",
      "started_at",
      "completed_at",
      "messages_found",
      "messages_processed",
      "invoices_created",
      "duplicates_skipped",
      "errors_count",
      "last_message_internal_date",
      "summary",
      "status",
    ],
  },

  // 99 — audit log
  {
    name: "99_audit_log",
    idPrefix: "aud",
    cols: [
      "timestamp",
      "actor",
      "action",
      "entity_table",
      "entity_id",
      "changes_json",
      "ip_address",
      "user_agent",
    ],
  },
] as const satisfies readonly TableSchema[];

// ============================================================
// Type-level table name union
// ============================================================

/** Union of all valid per-company table names */
export type CompanyTableName = (typeof COMPANY_TABS)[number]["name"];

/** Union of all valid table names — both per-company and warehouse.
 *  SheetsClient accepts either; the spreadsheetId in the client
 *  config determines which sheet the table is read from. */
export type TableName =
  | CompanyTableName
  | "01_warehouse"
  | "02_demo_production"
  | "03_finished_production"
  | "04_warehouse_employees"
  | "05_movements";

// ============================================================
// Helpers
// ============================================================

// Imported at module level since warehouse-schema doesn't import
// from this file — no circular dependency risk. Earlier draft used
// require() to be extra-cautious, but that needs an eslint rule
// that isn't configured in this project.
import { WAREHOUSE_TABS } from "./warehouse-schema";

/**
 * Look up the schema for a table. Throws if the table name doesn't
 * exist (which TypeScript should have caught at compile time, but
 * this is a defensive runtime check for safety).
 *
 * Searches both COMPANY_TABS and WAREHOUSE_TABS — the table name
 * is unique enough that there's no collision risk.
 */
export function getTableSchema(table: TableName): TableSchema {
  const found =
    COMPANY_TABS.find((t) => t.name === table) ??
    (WAREHOUSE_TABS as readonly TableSchema[]).find((t) => t.name === table);
  if (!found) {
    throw new Error(`Unknown table: ${table}`);
  }
  return found;
}
