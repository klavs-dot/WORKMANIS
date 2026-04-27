// ============================================================
// Partnership & network entity types
// ============================================================

export interface DistributorAgent {
  id: string;
  name: string;
  address: string;
  requisites: string; // pilni rekvizīti (Reg nr, PVN nr, bankas konts u.c.)
  countryCode: string;
  comment: string;
  createdAt: string;
}

export interface DemoProduct {
  id: string;
  name: string;
  /** Kas testē demo — piem. Policija, NMPD, armija, … */
  tester: string;
  location: string;
  comment: string;
  createdAt: string;
}

export type BusinessContactCategory =
  | "razotaji"
  | "piegadataji"
  | "pakalpojumi"
  | "logistika";

export interface BusinessContact {
  id: string;
  category: BusinessContactCategory;
  name: string;
  /** Latvian Reģ. Nr. (11 digits) or foreign equivalent.
   *  Optional — not all partners are companies, and some
   *  records pre-date this field. Used as the authoritative
   *  match signal when both sides have it. */
  regNumber?: string;
  countryCode: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  comment: string;
  createdAt: string;
}

/** Separate entity for the 'Online linki' tab — simpler shape */
export interface OnlineLink {
  id: string;
  productName: string;
  url: string;
  comment: string;
  createdAt: string;
}

// ============================================================
// Accounting metadata for received invoices (from suppliers)
// ============================================================

export type AccountingCategory =
  | "izejvielas"
  | "sarazota_produkcija"
  | "sanemts_pakalpojums"
  | "amortizacija";

export type DepreciationPeriod = 1 | 2 | 3 | 4 | 5 | 7 | 10;

export interface OutgoingInvoiceAccountingMeta {
  /** Invoice id this metadata belongs to */
  invoiceId: string;
  category: AccountingCategory;
  /** Only for category === 'amortizacija' */
  depreciationPeriod?: DepreciationPeriod;
  /** Short explanation for the accountant */
  explanation: string;
  updatedAt: string;
}

export const accountingCategoryLabels: Record<AccountingCategory, string> = {
  izejvielas: "Izejvielas",
  sarazota_produkcija: "Saražotā produkcija",
  sanemts_pakalpojums: "Saņemts pakalpojums",
  amortizacija: "Amortizācija",
};

export const depreciationOptions: DepreciationPeriod[] = [1, 2, 3, 4, 5, 7, 10];

export function depreciationLabel(years: DepreciationPeriod): string {
  return years === 1 ? "1 gads" : `${years} gadi`;
}
