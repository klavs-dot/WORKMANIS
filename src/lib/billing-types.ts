// ============================================================
// Shared domain types for Rēķini & Maksājumi
// ============================================================

export type ClientType = "fiziska" | "juridiska";

export type ClientStatus = "aktivs" | "neaktivs";

export interface ClientNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  type: ClientType;
  /** Nosaukums vai vārds, uzvārds */
  name: string;
  /** Klienta reģistrācijas numurs (uzņēmumam) */
  regNumber?: string;
  /** PVN numurs, var būt arī tukšs */
  vatNumber?: string;
  legalAddress?: string;
  bankAccount?: string;
  country: string;
  /** ISO 3166 alpha-2; used by VAT logic */
  countryCode: string;
  /** Brīvs atslēgvārdu saraksts (search aliases) */
  keywords: string[];
  status: ClientStatus;
  notes: ClientNote[];
  createdAt: string;
}

/** Aggregated invoice metrics per client (derived, not stored) */
export interface ClientInvoiceSummary {
  totalInvoices: number;
  unpaidCount: number;
  unpaidTotal: number;
  totalRevenue: number; // paid only
  lastInvoiceDate?: string;
  averagePaymentDays: number; // mock
}

// -----------------------------
// Invoice content variants
// -----------------------------

export type InvoiceKind = "pakalpojums" | "prece";

export type InvoiceLanguage = "lv" | "en";

/** Simple service invoice — single amount, no quantities */
export interface ServiceInvoiceContent {
  kind: "pakalpojums";
  description: string;
  amount: number; // bez PVN
  vatPercent: number;
}

/** Product invoice — one or more line items */
export interface ProductLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number; // bez PVN
  vatPercent: number;
}

export interface ProductInvoiceContent {
  kind: "prece";
  lines: ProductLine[];
}

export type InvoiceContent = ServiceInvoiceContent | ProductInvoiceContent;

// -----------------------------
// VAT modes (placeholder engine)
// -----------------------------

export type VATMode =
  | "standard" // 21% LV
  | "reverse_charge" // ES B2B ar PVN nr
  | "out_of_scope" // ārpus ES / cits iemesls
  | "zero_rated" // 0% preces eksportam
  | "exempt"; // atbrīvots

export interface VATResolution {
  mode: VATMode;
  appliesVAT: boolean;
  /** Automātiski ģenerēta likumīga atsauce (placeholder) */
  legalReference: string;
  /** Īss user-facing paskaidrojums */
  explanation: string;
}

// -----------------------------
// Templates
// -----------------------------

export interface InvoiceTemplate {
  id: string;
  /** "Parauga atslēgvārds" — noma, konsultācija, u.c. */
  keyword: string;
  clientId: string;
  language: InvoiceLanguage;
  content: InvoiceContent;
  reference?: string;
  createdAt: string;
}

// -----------------------------
// Persisted invoice (v2)
// -----------------------------

export type IncomingInvoiceStatus =
  | "gaidam_apmaksu"
  | "apmaksats"
  | "kave_maksajumu"
  | "melnraksts";

export interface PersistedInvoiceV2 {
  id: string;
  number: string; // "DDMMGG-N"
  clientId: string;
  language: InvoiceLanguage;
  content: InvoiceContent;
  reference?: string;
  vatMode: VATMode;
  vatLegalRef: string;
  /** Rēķina izrakstīšanas datums (ISO) */
  date: string;
  /** Apmaksas termiņš (ISO) */
  dueDate: string;
  status: IncomingInvoiceStatus;
  deliveryNote?: string;
  createdAt: string;
}
