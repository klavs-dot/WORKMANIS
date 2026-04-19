"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  AccountingCategory,
  DepreciationPeriod,
} from "./network-types";

// ============= Types =============

export type OutgoingStatus = "apstiprinat_banka" | "apmaksats";

/** Accounting explanation attached to an outgoing payment.
 *  NOTE: This metadata is intended to be synced to a Google Sheets
 *  tab per category (Izejvielas / Saražotā produkcija / Saņemts
 *  pakalpojums / Amortizācija), so the accountant can download
 *  and review each invoice with full context. Sync layer will
 *  be added on top of this store without changing its shape. */
export interface OutgoingAccountingMeta {
  category: AccountingCategory;
  /** Only relevant when category === 'amortizacija' */
  depreciationPeriod?: DepreciationPeriod;
  explanation: string;
  updatedAt: string;
}

export interface OutgoingPayment {
  id: string;
  supplier: string;
  invoiceNumber: string;
  amount: number;
  iban: string;
  dueDate: string;
  status: OutgoingStatus;
  fileName?: string;
  accountingMeta?: OutgoingAccountingMeta;
  pnAkts?: string;
  /** Whether the PN akts was generated in-app or uploaded as an existing PDF */
  pnAktsSource?: "generated" | "uploaded";
  /** Original file name when the PN akts was uploaded */
  pnAktsFileName?: string;
  createdAt: string;
}

export type IncomingStatus = "gaidam_apmaksu" | "apmaksats" | "kave_maksajumu";

export interface IncomingInvoice {
  id: string;
  number: string; // full "DDMMGG-N"
  client: string;
  description: string;
  amount: number;
  vat: number;
  date: string;
  dueDate: string;
  status: IncomingStatus;
  deliveryNote?: string; // "DDMMGG-N" if generated
  pnAkts?: string; // "PNDDMMGG-N" if generated
  pnAktsSource?: "generated" | "uploaded";
  pnAktsFileName?: string;
  createdAt: string;
}

export type SalaryType =
  | "darba_alga"
  | "atvalinajums"
  | "avansa_norekini"
  | "piemaksa";
export type SalaryStatus = "sagatavots" | "izmaksats";

export interface Salary {
  id: string;
  employee: string;
  /** Optional FK to /lib/employees-store Employee.id */
  employeeId?: string;
  amount: number;
  period: string;
  type: SalaryType;
  status: SalaryStatus;
  /** ISO timestamp when status flipped to 'izmaksats' */
  paidAt?: string;
}

export type TaxStatus = "sagatavots" | "apmaksats";

export interface Tax {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: TaxStatus;
}

// ============= Store =============

interface BillingStore {
  outgoing: OutgoingPayment[];
  incoming: IncomingInvoice[];
  salaries: Salary[];
  taxes: Tax[];

  addOutgoing: (p: Omit<OutgoingPayment, "id" | "createdAt" | "status">) => void;
  updateOutgoing: (id: string, patch: Partial<OutgoingPayment>) => void;
  markOutgoingPaid: (id: string) => void;
  setOutgoingMeta: (id: string, meta: OutgoingAccountingMeta) => void;
  clearOutgoingMeta: (id: string) => void;
  attachOutgoingPN: (
    id: string,
    pn: string,
    source?: "generated" | "uploaded",
    fileName?: string
  ) => void;
  detachOutgoingPN: (id: string) => void;

  addIncoming: (i: Omit<IncomingInvoice, "id" | "createdAt">) => void;
  updateIncoming: (id: string, patch: Partial<IncomingInvoice>) => void;
  attachDeliveryNote: (id: string, note: string) => void;
  attachIncomingPN: (
    id: string,
    pn: string,
    source?: "generated" | "uploaded",
    fileName?: string
  ) => void;
  detachIncomingPN: (id: string) => void;

  addSalary: (s: Omit<Salary, "id">) => void;
  updateSalary: (id: string, patch: Partial<Salary>) => void;

  addTax: (t: Omit<Tax, "id">) => void;
  updateTax: (id: string, patch: Partial<Tax>) => void;
}

const STORAGE_KEY = "workmanis:billing-store";

// Initial mock data (seed)
const seedData = {
  outgoing: [
    {
      id: "out-seed-1",
      supplier: "AS Latvenergo",
      invoiceNumber: "LE-26-04-02291",
      amount: 850.0,
      iban: "LV61HABA0001408042678",
      dueDate: "2026-04-20",
      status: "apstiprinat_banka" as OutgoingStatus,
      createdAt: "2026-04-15T10:00:00Z",
    },
    {
      id: "out-seed-2",
      supplier: "SIA Tet",
      invoiceNumber: "TET-2026-04-7781",
      amount: 143.0,
      iban: "LV77HABA0551000562189",
      dueDate: "2026-04-25",
      status: "apmaksats" as OutgoingStatus,
      accountingMeta: {
        category: "sanemts_pakalpojums",
        explanation:
          "Mēneša biznesa interneta un mobilo sakaru abonēšana Liepājas birojam.",
        updatedAt: "2026-04-10T09:15:00Z",
      },
      createdAt: "2026-04-10T08:30:00Z",
    },
    {
      id: "out-seed-3",
      supplier: "WP Suspension GmbH",
      invoiceNumber: "WP-2026-0314",
      amount: 12450.0,
      iban: "AT611904300234573201",
      dueDate: "2026-05-05",
      status: "apstiprinat_banka" as OutgoingStatus,
      accountingMeta: {
        category: "amortizacija",
        depreciationPeriod: 5,
        explanation:
          "Testa amortizatoru komplekts Mosphera nākamās paaudzes prototipam. Kapitalizējams kā ilgtermiņa ieguldījums.",
        updatedAt: "2026-04-14T12:00:00Z",
      },
      createdAt: "2026-04-14T11:30:00Z",
    },
    {
      id: "out-seed-4",
      supplier: "SIA Nerosta Metāli",
      invoiceNumber: "NM-26-221",
      amount: 2380.5,
      iban: "LV40HABA0551012345001",
      dueDate: "2026-04-28",
      status: "apstiprinat_banka" as OutgoingStatus,
      createdAt: "2026-04-16T09:00:00Z",
    },
  ] as OutgoingPayment[],
  incoming: [
    {
      id: "inc-seed-1",
      number: "100426-1",
      client: "SIA Baltic Motor Group",
      description: "Mosphera 72V komplekts · 2 gab.",
      amount: 8264.46,
      vat: 1735.54,
      date: "2026-04-10",
      dueDate: "2026-04-24",
      status: "gaidam_apmaksu" as IncomingStatus,
      createdAt: "2026-04-10T09:00:00Z",
    },
    {
      id: "inc-seed-2",
      number: "080426-1",
      client: "Liepājas pašvaldība",
      description: "Drift Arena nomas pakalpojumi · marts",
      amount: 991.74,
      vat: 208.26,
      date: "2026-04-08",
      dueDate: "2026-04-22",
      status: "apmaksats" as IncomingStatus,
      deliveryNote: "080426-1",
      createdAt: "2026-04-08T14:20:00Z",
    },
    {
      id: "inc-seed-3",
      number: "040426-1",
      client: "OÜ Estonian Partners",
      description: "Konsultāciju pakalpojumi",
      amount: 2400.0,
      vat: 504.0,
      date: "2026-04-04",
      dueDate: "2026-04-18",
      status: "kave_maksajumu" as IncomingStatus,
      createdAt: "2026-04-04T11:00:00Z",
    },
  ] as IncomingInvoice[],
  salaries: [
    {
      id: "sal-seed-1",
      employee: "Jānis Ozoliņš",
      amount: 2400.0,
      period: "Aprīlis 2026",
      type: "darba_alga" as SalaryType,
      status: "sagatavots" as SalaryStatus,
    },
    {
      id: "sal-seed-2",
      employee: "Anna Kalniņa",
      amount: 1850.0,
      period: "Aprīlis 2026",
      type: "darba_alga" as SalaryType,
      status: "sagatavots" as SalaryStatus,
    },
    {
      id: "sal-seed-3",
      employee: "Mārtiņš Bērziņš",
      amount: 920.0,
      period: "Aprīlis 2026",
      type: "atvalinajums" as SalaryType,
      status: "izmaksats" as SalaryStatus,
    },
  ] as Salary[],
  taxes: [
    {
      id: "tax-seed-1",
      name: "PVN (21%) · marts",
      amount: 4260.45,
      dueDate: "2026-04-20",
      status: "sagatavots" as TaxStatus,
    },
    {
      id: "tax-seed-2",
      name: "VSAOI · marts",
      amount: 1845.2,
      dueDate: "2026-04-17",
      status: "apmaksats" as TaxStatus,
    },
    {
      id: "tax-seed-3",
      name: "IIN · marts",
      amount: 980.0,
      dueDate: "2026-04-17",
      status: "apmaksats" as TaxStatus,
    },
  ] as Tax[],
};

const BillingContext = createContext<BillingStore | undefined>(undefined);

function readStore() {
  if (typeof window === "undefined") return seedData;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData;
    return { ...seedData, ...JSON.parse(raw) };
  } catch {
    return seedData;
  }
}

function writeStore(data: Omit<BillingStore, "addOutgoing" | "updateOutgoing" | "markOutgoingPaid" | "setOutgoingMeta" | "clearOutgoingMeta" | "attachOutgoingPN" | "detachOutgoingPN" | "addIncoming" | "updateIncoming" | "attachDeliveryNote" | "attachIncomingPN" | "detachIncomingPN" | "addSalary" | "updateSalary" | "addTax" | "updateTax">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function BillingProvider({ children }: { children: ReactNode }) {
  const [outgoing, setOutgoing] = useState<OutgoingPayment[]>(seedData.outgoing);
  const [incoming, setIncoming] = useState<IncomingInvoice[]>(seedData.incoming);
  const [salaries, setSalaries] = useState<Salary[]>(seedData.salaries);
  const [taxes, setTaxes] = useState<Tax[]>(seedData.taxes);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    const loaded = readStore();
    setOutgoing(loaded.outgoing);
    setIncoming(loaded.incoming);
    setSalaries(loaded.salaries);
    setTaxes(loaded.taxes);
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    writeStore({ outgoing, incoming, salaries, taxes });
  }, [outgoing, incoming, salaries, taxes, hydrated]);

  const store: BillingStore = {
    outgoing,
    incoming,
    salaries,
    taxes,

    addOutgoing: (p) => {
      setOutgoing((prev) => [
        {
          ...p,
          id: uid(),
          status: "apstiprinat_banka",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    updateOutgoing: (id, patch) => {
      setOutgoing((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
    },
    markOutgoingPaid: (id) => {
      setOutgoing((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "apmaksats" } : p))
      );
    },

    setOutgoingMeta: (id, meta) => {
      setOutgoing((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, accountingMeta: meta } : p
        )
      );
    },

    clearOutgoingMeta: (id) => {
      setOutgoing((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const { accountingMeta: _, ...rest } = p;
          return rest;
        })
      );
    },

    attachOutgoingPN: (id, pn, source = "generated", fileName) => {
      setOutgoing((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                pnAkts: pn,
                pnAktsSource: source,
                pnAktsFileName: fileName,
              }
            : p
        )
      );
    },

    detachOutgoingPN: (id) => {
      setOutgoing((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const { pnAkts: _a, pnAktsSource: _s, pnAktsFileName: _f, ...rest } = p;
          return rest;
        })
      );
    },

    addIncoming: (i) => {
      setIncoming((prev) => [
        { ...i, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]);
    },
    updateIncoming: (id, patch) => {
      setIncoming((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
    },
    attachDeliveryNote: (id, note) => {
      setIncoming((prev) =>
        prev.map((i) => (i.id === id ? { ...i, deliveryNote: note } : i))
      );
    },
    attachIncomingPN: (id, pn, source = "generated", fileName) => {
      setIncoming((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                pnAkts: pn,
                pnAktsSource: source,
                pnAktsFileName: fileName,
              }
            : i
        )
      );
    },

    detachIncomingPN: (id) => {
      setIncoming((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          const { pnAkts: _a, pnAktsSource: _s, pnAktsFileName: _f, ...rest } = i;
          return rest;
        })
      );
    },

    addSalary: (s) => {
      setSalaries((prev) => [{ ...s, id: uid() }, ...prev]);
    },
    updateSalary: (id, patch) => {
      setSalaries((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, ...patch };
          // Auto-stamp paidAt the first time status flips to 'izmaksats'
          if (
            patch.status === "izmaksats" &&
            s.status !== "izmaksats" &&
            !next.paidAt
          ) {
            next.paidAt = new Date().toISOString();
          }
          return next;
        })
      );
    },

    addTax: (t) => {
      setTaxes((prev) => [{ ...t, id: uid() }, ...prev]);
    },
    updateTax: (id, patch) => {
      setTaxes((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
    },
  };

  return (
    <BillingContext.Provider value={store}>{children}</BillingContext.Provider>
  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used inside BillingProvider");
  return ctx;
}

// ============= Online payments mock (read-only for now) =============

export interface OnlinePayment {
  id: string;
  service: string;
  amount: number;
  date: string;
  type: "subscription" | "online_purchase";
}

export const onlinePayments: OnlinePayment[] = [
  {
    id: "on-1",
    service: "Adobe Creative Cloud",
    amount: 898.0,
    date: "2026-04-15",
    type: "subscription",
  },
  {
    id: "on-2",
    service: "Google Workspace",
    amount: 629.0,
    date: "2026-04-14",
    type: "subscription",
  },
  {
    id: "on-3",
    service: "Amazon Business · biroja krēsls",
    amount: 312.5,
    date: "2026-04-13",
    type: "online_purchase",
  },
  {
    id: "on-4",
    service: "OpenAI API",
    amount: 350.0,
    date: "2026-04-12",
    type: "subscription",
  },
  {
    id: "on-5",
    service: "Notion",
    amount: 180.0,
    date: "2026-04-11",
    type: "subscription",
  },
  {
    id: "on-6",
    service: "AliExpress · elektronika",
    amount: 87.4,
    date: "2026-04-09",
    type: "online_purchase",
  },
  {
    id: "on-7",
    service: "Figma Professional",
    amount: 147.0,
    date: "2026-04-09",
    type: "subscription",
  },
  {
    id: "on-8",
    service: "Printful · apģērbu druka",
    amount: 245.9,
    date: "2026-04-07",
    type: "online_purchase",
  },
  {
    id: "on-9",
    service: "Vercel Pro",
    amount: 180.0,
    date: "2026-04-07",
    type: "subscription",
  },
];

// ============= In-store payments mock =============

export interface StorePayment {
  id: string;
  store: string;
  amount: number;
  date: string;
  card: string; // last 4
}

export const storePayments: StorePayment[] = [
  {
    id: "st-1",
    store: "Rimi · Liepāja Kuršu laukums",
    amount: 48.32,
    date: "2026-04-17",
    card: "4545",
  },
  {
    id: "st-2",
    store: "Circle K · degviela",
    amount: 82.15,
    date: "2026-04-16",
    card: "4545",
  },
  {
    id: "st-3",
    store: "Depo DIY · Liepāja",
    amount: 124.8,
    date: "2026-04-16",
    card: "0129",
  },
  {
    id: "st-4",
    store: "Maxima XX",
    amount: 36.47,
    date: "2026-04-15",
    card: "4545",
  },
  {
    id: "st-5",
    store: "Narvesen",
    amount: 8.9,
    date: "2026-04-15",
    card: "4545",
  },
  {
    id: "st-6",
    store: "IKEA · Rīga",
    amount: 287.0,
    date: "2026-04-13",
    card: "0129",
  },
  {
    id: "st-7",
    store: "Prisma",
    amount: 64.2,
    date: "2026-04-12",
    card: "4545",
  },
  {
    id: "st-8",
    store: "Virši-A · degviela",
    amount: 94.5,
    date: "2026-04-11",
    card: "4545",
  },
];
