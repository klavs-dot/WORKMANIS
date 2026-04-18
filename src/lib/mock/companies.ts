import type { Company } from "../types";

export const companies: Company[] = [
  {
    id: "gwm",
    name: "Global Wolf Motors",
    legalName: "SIA Global Wolf Motors",
    regNumber: "40203145789",
    vatNumber: "LV40203145789",
    color: "slate",
    activeInvoices: 12,
    subscriptions: 8,
    monthlySpend: 14820.45,
  },
  {
    id: "drift",
    name: "Drift Arena Liepāja",
    legalName: "SIA Caleidus",
    regNumber: "40203098712",
    vatNumber: "LV40203098712",
    color: "zinc",
    activeInvoices: 7,
    subscriptions: 6,
    monthlySpend: 4290.12,
  },
  {
    id: "mosphera",
    name: "Mosphera",
    legalName: "SIA Global Wolf Motors",
    regNumber: "40203145789",
    vatNumber: "LV40203145789",
    color: "neutral",
    activeInvoices: 5,
    subscriptions: 4,
    monthlySpend: 3120.8,
  },
  {
    id: "visitliepaja",
    name: "Visit Liepāja",
    legalName: "Liepājas reģiona tūrisma informācijas birojs",
    regNumber: "40008123456",
    vatNumber: "LV40008123456",
    color: "stone",
    activeInvoices: 3,
    subscriptions: 5,
    monthlySpend: 1840.0,
  },
];

export const getCompanyById = (id: string) =>
  companies.find((c) => c.id === id);
