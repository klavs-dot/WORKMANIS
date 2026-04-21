"use client";

/**
 * BillingProvider — Sheets-backed, managing 4 distinct entities
 * across 4 sheets tabs:
 *
 *   incoming (issued invoices)  → 30_invoices_out
 *   outgoing (received invoices) → 31_invoices_in
 *   salaries                     → 36_salaries
 *   taxes                        → 37_taxes
 *
 * The naming inside the store (incoming/outgoing) reflects money
 * flow direction (money coming in = your issued invoice; money
 * going out = received invoice). The schema tab names reflect
 * invoice-document direction (invoices_out = invoices you send
 * out; invoices_in = invoices you receive). These don't align
 * semantically, so the mapping is done explicitly here.
 *
 * Public API UNCHANGED from pre-Phase-4.
 *
 * Not yet migrated (left as localStorage + in-memory for V1):
 *   - onlinePayments, storePayments — module-level arrays, read-only
 *     for now, no Sheets schema yet
 *   - Invoice templates — still in clients-store as localStorage
 *   - PN akti — embedded in incoming/outgoing rows rather than
 *     living in their own 32_pn_akti table. V2 will normalize.
 *   - Delivery notes — embedded in incoming rows. Same as above.
 *   - Payments ledger (35_payments) — no UI uses it currently
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCompany } from "@/lib/company-context";
import type {
  AccountingCategory,
  DepreciationPeriod,
} from "./network-types";

// ============================================================
// Types (unchanged)
// ============================================================

export type OutgoingStatus = "apstiprinat_banka" | "apmaksats";

export interface OutgoingAccountingMeta {
  category: AccountingCategory;
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
  pnAktsSource?: "generated" | "uploaded";
  pnAktsFileName?: string;
  createdAt: string;
  /** Internal tracking for optimistic locking */
  updatedAt?: string;
}

export type IncomingStatus = "gaidam_apmaksu" | "apmaksats" | "kave_maksajumu";

export interface IncomingInvoice {
  id: string;
  number: string;
  client: string;
  description: string;
  amount: number;
  vat: number;
  date: string;
  dueDate: string;
  status: IncomingStatus;
  deliveryNote?: string;
  pnAkts?: string;
  pnAktsSource?: "generated" | "uploaded";
  pnAktsFileName?: string;
  createdAt: string;
  updatedAt?: string;
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
  employeeId?: string;
  amount: number;
  period: string;
  type: SalaryType;
  status: SalaryStatus;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TaxStatus = "sagatavots" | "apmaksats";

export interface Tax {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: TaxStatus;
  createdAt?: string;
  updatedAt?: string;
}

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

  loading: boolean;
}

// ============================================================
// Cache
// ============================================================

const CACHE_OUTGOING = "workmanis:outgoing-cache:";
const CACHE_INCOMING = "workmanis:incoming-cache:";
const CACHE_SALARIES = "workmanis:salaries-cache:";
const CACHE_TAXES = "workmanis:taxes-cache:";

function readCache<T>(prefix: string, companyId: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(prefix + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeCache<T>(prefix: string, companyId: string, items: T[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(prefix + companyId, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// ============================================================
// API shape mirrors
// ============================================================

interface ApiInvoiceOut {
  id: string;
  number: string;
  client: string;
  description: string;
  amount: number;
  vat: number;
  date: string;
  dueDate: string;
  status: string;
  deliveryNote: string | undefined;
  pnAkts: string | undefined;
  pnAktsSource: string | undefined;
  pnAktsFileName: string | undefined;
  createdAt: string;
  updatedAt: string;
}

interface ApiInvoiceIn {
  id: string;
  supplier: string;
  invoiceNumber: string;
  description: string | undefined;
  amount: number;
  iban: string;
  dueDate: string;
  status: string;
  fileName: string | undefined;
  pnAkts: string | undefined;
  pnAktsSource: string | undefined;
  pnAktsFileName: string | undefined;
  accountingMeta:
    | {
        category: string;
        depreciationPeriod: number | undefined;
        explanation: string;
        updatedAt: string;
      }
    | undefined;
  createdAt: string;
  updatedAt: string;
}

interface ApiSalary {
  id: string;
  employeeId: string | undefined;
  employee: string;
  amount: number;
  period: string;
  type: string;
  status: string;
  paidAt: string | undefined;
  createdAt: string;
  updatedAt: string;
}

interface ApiTax {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function apiToIncoming(a: ApiInvoiceOut): IncomingInvoice {
  return {
    id: a.id,
    number: a.number,
    client: a.client,
    description: a.description,
    amount: a.amount,
    vat: a.vat,
    date: a.date,
    dueDate: a.dueDate,
    status: a.status as IncomingStatus,
    deliveryNote: a.deliveryNote,
    pnAkts: a.pnAkts,
    pnAktsSource:
      a.pnAktsSource === "generated" || a.pnAktsSource === "uploaded"
        ? a.pnAktsSource
        : undefined,
    pnAktsFileName: a.pnAktsFileName,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function apiToOutgoing(a: ApiInvoiceIn): OutgoingPayment {
  return {
    id: a.id,
    supplier: a.supplier,
    invoiceNumber: a.invoiceNumber,
    amount: a.amount,
    iban: a.iban,
    dueDate: a.dueDate,
    status: a.status as OutgoingStatus,
    fileName: a.fileName,
    pnAkts: a.pnAkts,
    pnAktsSource:
      a.pnAktsSource === "generated" || a.pnAktsSource === "uploaded"
        ? a.pnAktsSource
        : undefined,
    pnAktsFileName: a.pnAktsFileName,
    accountingMeta: a.accountingMeta
      ? {
          category: a.accountingMeta.category as AccountingCategory,
          depreciationPeriod: a.accountingMeta.depreciationPeriod as
            | DepreciationPeriod
            | undefined,
          explanation: a.accountingMeta.explanation,
          updatedAt: a.accountingMeta.updatedAt,
        }
      : undefined,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function apiToSalary(a: ApiSalary): Salary {
  return {
    id: a.id,
    employee: a.employee,
    employeeId: a.employeeId,
    amount: a.amount,
    period: a.period,
    type: a.type as SalaryType,
    status: a.status as SalaryStatus,
    paidAt: a.paidAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function apiToTax(a: ApiTax): Tax {
  return {
    id: a.id,
    name: a.name,
    amount: a.amount,
    dueDate: a.dueDate,
    status: a.status as TaxStatus,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// ============================================================
// Provider
// ============================================================

const uid = () => Math.random().toString(36).slice(2, 10);

const BillingContext = createContext<BillingStore | undefined>(undefined);

export function BillingProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();

  const [incoming, setIncoming] = useState<IncomingInvoice[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingPayment[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(false);

  const updatedAtMapRef = useRef<Map<string, string>>(new Map());
  const lastCompanyIdRef = useRef<string | null>(null);

  const fetchAll = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const qs = `company_id=${encodeURIComponent(companyId)}`;
      const [outRes, inRes, salRes, taxRes] = await Promise.all([
        fetch(`/api/invoices-out?${qs}`, { cache: "no-store" }),
        fetch(`/api/invoices-in?${qs}`, { cache: "no-store" }),
        fetch(`/api/salaries?${qs}`, { cache: "no-store" }),
        fetch(`/api/taxes?${qs}`, { cache: "no-store" }),
      ]);

      const newMap = new Map<string, string>();

      // 30_invoices_out → incoming (money coming IN to us)
      if (outRes.ok) {
        const data = (await outRes.json()) as { invoices: ApiInvoiceOut[] };
        for (const i of data.invoices) newMap.set(i.id, i.updatedAt);
        const mapped = data.invoices.map(apiToIncoming);
        setIncoming(mapped);
        writeCache(CACHE_INCOMING, companyId, mapped);
      }

      // 31_invoices_in → outgoing (money going OUT from us)
      if (inRes.ok) {
        const data = (await inRes.json()) as { invoices: ApiInvoiceIn[] };
        for (const i of data.invoices) newMap.set(i.id, i.updatedAt);
        const mapped = data.invoices.map(apiToOutgoing);
        setOutgoing(mapped);
        writeCache(CACHE_OUTGOING, companyId, mapped);
      }

      if (salRes.ok) {
        const data = (await salRes.json()) as { salaries: ApiSalary[] };
        for (const s of data.salaries) newMap.set(s.id, s.updatedAt);
        const mapped = data.salaries.map(apiToSalary);
        setSalaries(mapped);
        writeCache(CACHE_SALARIES, companyId, mapped);
      }

      if (taxRes.ok) {
        const data = (await taxRes.json()) as { taxes: ApiTax[] };
        for (const t of data.taxes) newMap.set(t.id, t.updatedAt);
        const mapped = data.taxes.map(apiToTax);
        setTaxes(mapped);
        writeCache(CACHE_TAXES, companyId, mapped);
      }

      updatedAtMapRef.current = newMap;
    } catch (err) {
      console.error("Fetch billing failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setIncoming([]);
      setOutgoing([]);
      setSalaries([]);
      setTaxes([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    setIncoming(readCache<IncomingInvoice>(CACHE_INCOMING, companyId));
    setOutgoing(readCache<OutgoingPayment>(CACHE_OUTGOING, companyId));
    setSalaries(readCache<Salary>(CACHE_SALARIES, companyId));
    setTaxes(readCache<Tax>(CACHE_TAXES, companyId));

    void fetchAll(companyId);
  }, [activeCompany, fetchAll]);

  // ============================================================
  // Generic optimistic-write helper (reusable across entities)
  // ============================================================

  /**
   * Generic POST-with-optimistic-add. Returns a promise that
   * resolves when server sync finishes (used for caller chaining
   * in some edge cases, but most callers ignore it — optimistic
   * UI is fire-and-forget).
   */
  function optimisticCreate<T extends { id: string }, TApi>(args: {
    item: T;
    apiPath: string;
    body: Record<string, unknown>;
    cachePrefix: string;
    companyId: string;
    setState: React.Dispatch<React.SetStateAction<T[]>>;
    apiToLocal: (api: TApi) => T;
    responseKey: string;
  }) {
    args.setState((prev) => {
      const next = [args.item, ...prev];
      writeCache(args.cachePrefix, args.companyId, next);
      return next;
    });

    void (async () => {
      try {
        const res = await fetch(
          `${args.apiPath}?company_id=${encodeURIComponent(args.companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args.body),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`POST failed: ${res.status} ${text}`);
        }
        const json = (await res.json()) as Record<string, TApi>;
        const apiItem = json[args.responseKey];
        if (!apiItem) throw new Error("No item in response");
        const server = args.apiToLocal(apiItem);
        updatedAtMapRef.current.set(
          server.id,
          (apiItem as unknown as { updatedAt: string }).updatedAt
        );

        args.setState((prev) => {
          const next = prev.map((x) =>
            x.id === args.item.id ? server : x
          );
          writeCache(args.cachePrefix, args.companyId, next);
          return next;
        });
      } catch (err) {
        console.error(`${args.apiPath} add sync failed:`, err);
        args.setState((prev) => {
          const next = prev.filter((x) => x.id !== args.item.id);
          writeCache(args.cachePrefix, args.companyId, next);
          return next;
        });
      }
    })();
  }

  function optimisticUpdate<T extends { id: string; createdAt?: string }, TApi>(
    args: {
      id: string;
      previous: T;
      patch: Partial<T>;
      apiPath: string;
      body: Record<string, unknown>;
      cachePrefix: string;
      companyId: string;
      setState: React.Dispatch<React.SetStateAction<T[]>>;
      apiToLocal: (api: TApi) => T;
      responseKey: string;
    }
  ) {
    // Optimistic patch already applied by caller
    if (args.id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtMapRef.current.get(args.id) ??
      args.previous.createdAt ??
      new Date().toISOString();

    const body = { ...args.body, expected_updated_at: expectedUpdatedAt };

    void (async () => {
      try {
        const res = await fetch(
          `${args.apiPath}/${encodeURIComponent(args.id)}?company_id=${encodeURIComponent(args.companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`PATCH failed: ${res.status} ${text}`);
        }
        const json = (await res.json()) as Record<string, TApi>;
        const apiItem = json[args.responseKey];
        if (!apiItem) return;
        const server = args.apiToLocal(apiItem);
        updatedAtMapRef.current.set(
          server.id,
          (apiItem as unknown as { updatedAt: string }).updatedAt
        );
        args.setState((prev) => {
          const next = prev.map((x) => (x.id === args.id ? server : x));
          writeCache(args.cachePrefix, args.companyId, next);
          return next;
        });
      } catch (err) {
        console.error(`${args.apiPath} update sync failed:`, err);
        const prev2 = args.previous;
        args.setState((prev) => {
          const next = prev.map((x) => (x.id === args.id ? prev2 : x));
          writeCache(args.cachePrefix, args.companyId, next);
          return next;
        });
      }
    })();
  }

  // ============================================================
  // OUTGOING (received invoices → 31_invoices_in)
  // ============================================================

  const addOutgoing: BillingStore["addOutgoing"] = (p) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const item: OutgoingPayment = {
      ...p,
      id: tempId,
      status: "apstiprinat_banka",
      createdAt: now,
      updatedAt: now,
    };

    optimisticCreate<OutgoingPayment, ApiInvoiceIn>({
      item,
      apiPath: "/api/invoices-in",
      body: outgoingToBody(p),
      cachePrefix: CACHE_OUTGOING,
      companyId,
      setState: setOutgoing,
      apiToLocal: apiToOutgoing,
      responseKey: "invoice",
    });
  };

  const applyOutgoingPatch = (id: string, patch: Partial<OutgoingPayment>) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: OutgoingPayment | undefined;
    setOutgoing((prev) => {
      previous = prev.find((p) => p.id === id);
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      writeCache(CACHE_OUTGOING, companyId, next);
      return next;
    });

    if (!previous) return;

    optimisticUpdate<OutgoingPayment, ApiInvoiceIn>({
      id,
      previous,
      patch,
      apiPath: "/api/invoices-in",
      body: outgoingPatchToBody(patch),
      cachePrefix: CACHE_OUTGOING,
      companyId,
      setState: setOutgoing,
      apiToLocal: apiToOutgoing,
      responseKey: "invoice",
    });
  };

  const updateOutgoing: BillingStore["updateOutgoing"] = (id, patch) =>
    applyOutgoingPatch(id, patch);

  const markOutgoingPaid: BillingStore["markOutgoingPaid"] = (id) =>
    applyOutgoingPatch(id, { status: "apmaksats" });

  const setOutgoingMeta: BillingStore["setOutgoingMeta"] = (id, meta) =>
    applyOutgoingPatch(id, { accountingMeta: meta });

  const clearOutgoingMeta: BillingStore["clearOutgoingMeta"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: OutgoingPayment | undefined;
    setOutgoing((prev) => {
      previous = prev.find((p) => p.id === id);
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        const { accountingMeta: _, ...rest } = p;
        return rest;
      });
      writeCache(CACHE_OUTGOING, companyId, next);
      return next;
    });

    if (!previous) return;
    if (id.startsWith("tmp-")) return;

    // Send explicit null to the server to clear
    const expectedUpdatedAt =
      updatedAtMapRef.current.get(id) ?? previous.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/invoices-in/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expected_updated_at: expectedUpdatedAt,
              accounting_meta: null,
            }),
          }
        );
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
        const body = (await res.json()) as { invoice: ApiInvoiceIn };
        const server = apiToOutgoing(body.invoice);
        updatedAtMapRef.current.set(server.id, body.invoice.updatedAt);
        setOutgoing((prev) => {
          const next = prev.map((p) => (p.id === id ? server : p));
          writeCache(CACHE_OUTGOING, companyId, next);
          return next;
        });
      } catch (err) {
        console.error("clearOutgoingMeta sync failed:", err);
        if (previous) {
          const prev2 = previous;
          setOutgoing((prev) => {
            const next = prev.map((p) => (p.id === id ? prev2 : p));
            writeCache(CACHE_OUTGOING, companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const attachOutgoingPN: BillingStore["attachOutgoingPN"] = (
    id,
    pn,
    source = "generated",
    fileName
  ) =>
    applyOutgoingPatch(id, {
      pnAkts: pn,
      pnAktsSource: source,
      pnAktsFileName: fileName,
    });

  const detachOutgoingPN: BillingStore["detachOutgoingPN"] = (id) =>
    applyOutgoingPatch(id, {
      pnAkts: "",
      pnAktsSource: undefined,
      pnAktsFileName: "",
    });

  // ============================================================
  // INCOMING (issued invoices → 30_invoices_out)
  // ============================================================

  const addIncoming: BillingStore["addIncoming"] = (i) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const item: IncomingInvoice = {
      ...i,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    optimisticCreate<IncomingInvoice, ApiInvoiceOut>({
      item,
      apiPath: "/api/invoices-out",
      body: incomingToBody(i),
      cachePrefix: CACHE_INCOMING,
      companyId,
      setState: setIncoming,
      apiToLocal: apiToIncoming,
      responseKey: "invoice",
    });
  };

  const applyIncomingPatch = (
    id: string,
    patch: Partial<IncomingInvoice>
  ) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: IncomingInvoice | undefined;
    setIncoming((prev) => {
      previous = prev.find((i) => i.id === id);
      const next = prev.map((i) => (i.id === id ? { ...i, ...patch } : i));
      writeCache(CACHE_INCOMING, companyId, next);
      return next;
    });

    if (!previous) return;

    optimisticUpdate<IncomingInvoice, ApiInvoiceOut>({
      id,
      previous,
      patch,
      apiPath: "/api/invoices-out",
      body: incomingPatchToBody(patch),
      cachePrefix: CACHE_INCOMING,
      companyId,
      setState: setIncoming,
      apiToLocal: apiToIncoming,
      responseKey: "invoice",
    });
  };

  const updateIncoming: BillingStore["updateIncoming"] = (id, patch) =>
    applyIncomingPatch(id, patch);

  const attachDeliveryNote: BillingStore["attachDeliveryNote"] = (id, note) =>
    applyIncomingPatch(id, { deliveryNote: note });

  const attachIncomingPN: BillingStore["attachIncomingPN"] = (
    id,
    pn,
    source = "generated",
    fileName
  ) =>
    applyIncomingPatch(id, {
      pnAkts: pn,
      pnAktsSource: source,
      pnAktsFileName: fileName,
    });

  const detachIncomingPN: BillingStore["detachIncomingPN"] = (id) =>
    applyIncomingPatch(id, {
      pnAkts: "",
      pnAktsSource: undefined,
      pnAktsFileName: "",
    });

  // ============================================================
  // SALARIES
  // ============================================================

  const addSalary: BillingStore["addSalary"] = (s) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const item: Salary = {
      ...s,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    optimisticCreate<Salary, ApiSalary>({
      item,
      apiPath: "/api/salaries",
      body: salaryToBody(s),
      cachePrefix: CACHE_SALARIES,
      companyId,
      setState: setSalaries,
      apiToLocal: apiToSalary,
      responseKey: "salary",
    });
  };

  const updateSalary: BillingStore["updateSalary"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Salary | undefined;
    setSalaries((prev) => {
      previous = prev.find((s) => s.id === id);
      const next = prev.map((s) => {
        if (s.id !== id) return s;
        const nextItem: Salary = { ...s, ...patch };
        // Auto-stamp paidAt on first transition to izmaksats
        if (
          patch.status === "izmaksats" &&
          s.status !== "izmaksats" &&
          !nextItem.paidAt
        ) {
          nextItem.paidAt = new Date().toISOString();
        }
        return nextItem;
      });
      writeCache(CACHE_SALARIES, companyId, next);
      return next;
    });

    if (!previous) return;

    // Pass through the computed paidAt if it changed
    const maybeComputed: Partial<Salary> = { ...patch };
    if (
      patch.status === "izmaksats" &&
      previous.status !== "izmaksats" &&
      !maybeComputed.paidAt
    ) {
      maybeComputed.paidAt = new Date().toISOString();
    }

    optimisticUpdate<Salary, ApiSalary>({
      id,
      previous,
      patch: maybeComputed,
      apiPath: "/api/salaries",
      body: salaryPatchToBody(maybeComputed),
      cachePrefix: CACHE_SALARIES,
      companyId,
      setState: setSalaries,
      apiToLocal: apiToSalary,
      responseKey: "salary",
    });
  };

  // ============================================================
  // TAXES
  // ============================================================

  const addTax: BillingStore["addTax"] = (t) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const item: Tax = {
      ...t,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    optimisticCreate<Tax, ApiTax>({
      item,
      apiPath: "/api/taxes",
      body: taxToBody(t),
      cachePrefix: CACHE_TAXES,
      companyId,
      setState: setTaxes,
      apiToLocal: apiToTax,
      responseKey: "tax",
    });
  };

  const updateTax: BillingStore["updateTax"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Tax | undefined;
    setTaxes((prev) => {
      previous = prev.find((t) => t.id === id);
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      writeCache(CACHE_TAXES, companyId, next);
      return next;
    });

    if (!previous) return;

    optimisticUpdate<Tax, ApiTax>({
      id,
      previous,
      patch,
      apiPath: "/api/taxes",
      body: taxPatchToBody(patch),
      cachePrefix: CACHE_TAXES,
      companyId,
      setState: setTaxes,
      apiToLocal: apiToTax,
      responseKey: "tax",
    });
  };

  const store: BillingStore = {
    outgoing,
    incoming,
    salaries,
    taxes,

    addOutgoing,
    updateOutgoing,
    markOutgoingPaid,
    setOutgoingMeta,
    clearOutgoingMeta,
    attachOutgoingPN,
    detachOutgoingPN,

    addIncoming,
    updateIncoming,
    attachDeliveryNote,
    attachIncomingPN,
    detachIncomingPN,

    addSalary,
    updateSalary,

    addTax,
    updateTax,

    loading,
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

// ============================================================
// Body builders (client → API)
// ============================================================

function outgoingToBody(
  o: Omit<OutgoingPayment, "id" | "createdAt" | "status">
): Record<string, unknown> {
  return {
    supplier: o.supplier,
    invoice_number: o.invoiceNumber,
    amount: o.amount,
    iban: o.iban,
    due_date: o.dueDate,
    status: "apstiprinat_banka",
    file_name: o.fileName ?? "",
    pn_akts: o.pnAkts ?? "",
    pn_akts_source: o.pnAktsSource ?? "",
    pn_akts_file_name: o.pnAktsFileName ?? "",
    ...(o.accountingMeta && {
      accounting_meta: {
        category: o.accountingMeta.category,
        depreciationPeriod: o.accountingMeta.depreciationPeriod,
        explanation: o.accountingMeta.explanation,
        updatedAt: o.accountingMeta.updatedAt,
      },
    }),
  };
}

function outgoingPatchToBody(
  patch: Partial<OutgoingPayment>
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.supplier !== undefined) body.supplier = patch.supplier;
  if (patch.invoiceNumber !== undefined)
    body.invoice_number = patch.invoiceNumber;
  if (patch.amount !== undefined) body.amount = patch.amount;
  if (patch.iban !== undefined) body.iban = patch.iban;
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.fileName !== undefined) body.file_name = patch.fileName;
  if (patch.pnAkts !== undefined) body.pn_akts = patch.pnAkts;
  if (patch.pnAktsSource !== undefined)
    body.pn_akts_source = patch.pnAktsSource ?? "";
  if (patch.pnAktsFileName !== undefined)
    body.pn_akts_file_name = patch.pnAktsFileName;
  if (patch.accountingMeta !== undefined) {
    body.accounting_meta = patch.accountingMeta
      ? {
          category: patch.accountingMeta.category,
          depreciationPeriod: patch.accountingMeta.depreciationPeriod,
          explanation: patch.accountingMeta.explanation,
          updatedAt: patch.accountingMeta.updatedAt,
        }
      : null;
  }
  return body;
}

function incomingToBody(
  i: Omit<IncomingInvoice, "id" | "createdAt">
): Record<string, unknown> {
  return {
    number: i.number,
    client: i.client,
    description: i.description,
    amount: i.amount,
    vat: i.vat,
    date: i.date,
    due_date: i.dueDate,
    status: i.status,
    delivery_note: i.deliveryNote ?? "",
    pn_akts: i.pnAkts ?? "",
    pn_akts_source: i.pnAktsSource ?? "",
    pn_akts_file_name: i.pnAktsFileName ?? "",
  };
}

function incomingPatchToBody(
  patch: Partial<IncomingInvoice>
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.number !== undefined) body.number = patch.number;
  if (patch.client !== undefined) body.client = patch.client;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.amount !== undefined) body.amount = patch.amount;
  if (patch.vat !== undefined) body.vat = patch.vat;
  if (patch.date !== undefined) body.date = patch.date;
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.deliveryNote !== undefined)
    body.delivery_note = patch.deliveryNote;
  if (patch.pnAkts !== undefined) body.pn_akts = patch.pnAkts;
  if (patch.pnAktsSource !== undefined)
    body.pn_akts_source = patch.pnAktsSource ?? "";
  if (patch.pnAktsFileName !== undefined)
    body.pn_akts_file_name = patch.pnAktsFileName;
  return body;
}

function salaryToBody(s: Omit<Salary, "id">): Record<string, unknown> {
  return {
    employee: s.employee,
    employee_id: s.employeeId ?? "",
    amount: s.amount,
    period: s.period,
    type: s.type,
    status: s.status,
    paid_at: s.paidAt ?? "",
  };
}

function salaryPatchToBody(patch: Partial<Salary>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.employee !== undefined) body.employee = patch.employee;
  if (patch.employeeId !== undefined) body.employee_id = patch.employeeId;
  if (patch.amount !== undefined) body.amount = patch.amount;
  if (patch.period !== undefined) body.period = patch.period;
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.paidAt !== undefined) body.paid_at = patch.paidAt;
  return body;
}

function taxToBody(t: Omit<Tax, "id">): Record<string, unknown> {
  return {
    name: t.name,
    amount: t.amount,
    due_date: t.dueDate,
    status: t.status,
  };
}

function taxPatchToBody(patch: Partial<Tax>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.amount !== undefined) body.amount = patch.amount;
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
  if (patch.status !== undefined) body.status = patch.status;
  return body;
}

// ============================================================
// Legacy exports (still used by some components)
// ============================================================

export interface OnlinePayment {
  id: string;
  service: string;
  amount: number;
  date: string;
  type: "subscription" | "online_purchase";
}

export const onlinePayments: OnlinePayment[] = [];

export interface StorePayment {
  id: string;
  store: string;
  amount: number;
  date: string;
  card: string;
}

export const storePayments: StorePayment[] = [];
