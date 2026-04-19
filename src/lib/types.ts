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
}

export type CopyFormat = "lv" | "en";

export interface Company extends CompanyRequisites {
  id: string;
  name: string;
  color: string; // tailwind class suffix for subtle identification
  logoUrl?: string;
  activeInvoices: number;
  subscriptions: number;
  monthlySpend: number;
  /** Original kept for backward compatibility; also present in CompanyRequisites */
  legalName: string;
  regNumber: string;
  vatNumber: string;
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
