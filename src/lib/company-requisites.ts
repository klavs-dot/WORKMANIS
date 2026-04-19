import type { Company, CopyFormat } from "./types";

const LV_LABELS: Record<keyof CompanyFields, string> = {
  legalName: "Juridiskais nosaukums",
  regNumber: "Reģistrācijas numurs",
  vatNumber: "PVN numurs",
  legalAddress: "Juridiskā adrese",
  deliveryAddress: "Faktiskā / piegādes adrese",
  contactEmail: "E-pasts saziņai",
  invoiceEmail: "E-pasts rēķiniem",
  iban: "IBAN",
  bankName: "Bankas nosaukums",
  swift: "SWIFT",
  phone: "Telefona numurs",
  website: "Mājaslapa",
};

const EN_LABELS: Record<keyof CompanyFields, string> = {
  legalName: "Legal name",
  regNumber: "Registration number",
  vatNumber: "VAT number",
  legalAddress: "Legal address",
  deliveryAddress: "Delivery / actual address",
  contactEmail: "Contact email",
  invoiceEmail: "Invoice email",
  iban: "IBAN",
  bankName: "Bank name",
  swift: "SWIFT",
  phone: "Phone number",
  website: "Website",
};

type CompanyFields = {
  legalName: string;
  regNumber: string;
  vatNumber: string;
  legalAddress: string;
  deliveryAddress: string;
  contactEmail: string;
  invoiceEmail: string;
  iban: string;
  bankName: string;
  swift: string;
  phone: string;
  website: string;
};

const FIELD_ORDER: (keyof CompanyFields)[] = [
  "legalName",
  "regNumber",
  "vatNumber",
  "legalAddress",
  "deliveryAddress",
  "contactEmail",
  "invoiceEmail",
  "iban",
  "bankName",
  "swift",
  "phone",
  "website",
];

/** Format company requisites as plain text for clipboard. */
export function formatRequisites(company: Company, format: CopyFormat): string {
  const labels = format === "lv" ? LV_LABELS : EN_LABELS;
  const lines: string[] = [];
  for (const key of FIELD_ORDER) {
    const value = company[key as keyof Company];
    if (typeof value === "string" && value.trim().length > 0) {
      lines.push(`${labels[key]}: ${value}`);
    }
  }
  return lines.join("\n");
}

/** Percentage of filled-in requisite fields (0–1) */
export function requisitesCompleteness(company: Company): number {
  const filled = FIELD_ORDER.filter((k) => {
    const v = company[k as keyof Company];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
  return filled / FIELD_ORDER.length;
}

/** True when ANY core requisite (beyond name) is missing */
export function hasRequisites(company: Company): boolean {
  const core: (keyof CompanyFields)[] = [
    "legalName",
    "regNumber",
    "vatNumber",
    "legalAddress",
    "iban",
  ];
  return core.some((k) => {
    const v = company[k as keyof Company];
    return typeof v === "string" && v.trim().length > 0;
  });
}
