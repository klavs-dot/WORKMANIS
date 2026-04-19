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

    legalAddress: "Rūpnīcas iela 12, Liepāja, LV-3405, Latvija",
    deliveryAddress: "Rūpnīcas iela 12, Liepāja, LV-3405, Latvija",
    contactEmail: "info@globalwolfmotors.com",
    invoiceEmail: "rekini@globalwolfmotors.com",
    iban: "LV12HABA0551012345678",
    bankName: "Swedbank AS",
    swift: "HABALV22",
    phone: "+371 2800 0001",
    website: "https://globalwolfmotors.com",
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

    legalAddress: "Liepājas iela 48, Liepāja, LV-3401, Latvija",
    deliveryAddress: "Liepājas iela 48, Liepāja, LV-3401, Latvija",
    contactEmail: "hello@driftarena.lv",
    invoiceEmail: "rekini@driftarena.lv",
    iban: "LV45UNLA0050012345678",
    bankName: "SEB banka AS",
    swift: "UNLALV2X",
    phone: "+371 2700 1234",
    website: "https://driftarena.lv",
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

    legalAddress: "Rūpnīcas iela 12, Liepāja, LV-3405, Latvija",
    contactEmail: "contact@mosphera.com",
    invoiceEmail: "rekini@mosphera.com",
    website: "https://mosphera.com",
    // IBAN, banka, SWIFT, telefons nav aizpildīti — daļējs ieraksts
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
    // Pilnībā tukši pārējie rekvizīti — UI rādīs "Pievienot rekvizītus"
  },
];

export const getCompanyById = (id: string) =>
  companies.find((c) => c.id === id);
