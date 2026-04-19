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
  outgoing: [] as OutgoingPayment[],
  incoming: [] as IncomingInvoice[],
  salaries: [] as Salary[],
  taxes: [] as Tax[],
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

export const onlinePayments: OnlinePayment[] = [];

// ============= In-store payments mock =============

export interface StorePayment {
  id: string;
  store: string;
  amount: number;
  date: string;
  card: string; // last 4
}

export const storePayments: StorePayment[] = [];
