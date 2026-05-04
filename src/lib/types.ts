export type InvoiceStatus =
  | "apmaksāts"
  | "gaida"
  | "termiņš_beidzies"
  | "melnraksts";

export type PaymentStatus =
  | "sagatavots"
  | "gaida_apstiprinājumu"
  | "nosūtīts"
  | "apmaksāts";

export type SubscriptionStatus = "aktīvs" | "pauzēts" | "atcelts";

export type Periodicity = "mēnesis" | "gads" | "ceturksnis";

export interface CompanyRequisites {
  legalName?: string;
  regNumber?: string;
  vatNumber?: string;
  legalAddress?: string;
  deliveryAddress?: string;
  contactEmail?: string;
  invoiceEmail?: string;
  iban?: string;
  bankName?: string;
  swift?: string;
  phone?: string;
  website?: string;
  /**
   * Hex color (e.g. '#10b981') chosen by the user when creating
   * or editing the company. Used to tint the left sidebar and
   * other accents when this company is active, so the user has a
   * visual cue of which entity they're working with.
   *
   * Stored as the requisite (not just local UI state) so it
   * persists across browsers and is shared if the user invites
   * someone else to the company later.
   */
  brandColor?: string;
}

export type CopyFormat = "lv" | "en";

export interface Company extends CompanyRequisites {
  id: string;
  name: string;
  /**
   * @deprecated Legacy field — use brandColor (hex) instead.
   * Kept for backwards compatibility with old localStorage cache
   * data; will be removed once everyone has re-saved at least
   * once.
   */
  color?: string;
  logoUrl?: string;
  /** Drive file ID of the uploaded logo (PNG/SVG). When set, the
   *  UI renders the logo via /api/drive/files/{id}?company_id=X
   *  rather than via logoUrl. logoUrl is kept for legacy/external
   *  hosting; logoDriveId is the preferred path going forward. */
  logoDriveId?: string;
  activeInvoices?: number;
  subscriptions?: number;
  monthlySpend?: number;
  /** Backend fields (only present when hydrated from Sheets backend) */
  folderDriveId?: string;
  sheetId?: string;
  slug?: string;
}

export interface Supplier {
  id: string;
  name: string;
  regNumber: string;
  vatNumber: string;
  iban: string;
  country: string;
  countryCode: string;
  email?: string;
  phone?: string;
  address?: string;
  lastInvoiceDate?: string;
  totalAmount: number;
  category?: string;
}

export interface Invoice {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  date: string;
  dueDate: string;
  amount: number;
  vat: number;
  total: number;
  status: InvoiceStatus;
  companyId: string;
  companyName: string;
  description?: string;
  notes?: string;
  iban?: string;
}

export interface Subscription {
  id: string;
  service: string;
  category: string;
  price: number;
  periodicity: Periodicity;
  nextPayment: string;
  companyId: string;
  companyName: string;
  status: SubscriptionStatus;
  icon?: string;
}

export interface Payment {
  id: string;
  recipient: string;
  iban: string;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  companyId: string;
  companyName: string;
  reference?: string;
}

export interface Alert {
  id: string;
  type: "warning" | "danger" | "info";
  title: string;
  description: string;
  timestamp: string;
}
