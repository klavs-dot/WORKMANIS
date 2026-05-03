"use client";

/**
 * BillingProvider — Sheets-backed, managing 4 distinct entities
 * across 4 sheets tabs:
 *
 *   issued   — invoices YOU issue to clients → 30_invoices_out
 *   received — invoices you receive from suppliers → 31_invoices_in
 *   salaries                                → 36_salaries
 *   taxes                                   → 37_taxes
 *
 * The 'issued' / 'received' naming is unambiguous:
 *   - 'issued' invoice = document you wrote and sent out to a
 *     client. Money flows IN when the client pays you.
 *   - 'received' invoice = document a supplier sent to you.
 *     Money flows OUT when you pay it.
 *
 * The schema tab names follow the document-direction convention
 * (invoices_out = documents going out = issued; invoices_in =
 * documents coming in = received), which is backwards from the
 * money-flow direction. The mapping lives in this file:
 *
 *   fetchAll():  /api/invoices-out → issued;
 *                /api/invoices-in  → received
 *   addIssued:   POST /api/invoices-out
 *   addReceived: POST /api/invoices-in
 *
 * Public API UNCHANGED in shape (same method count + signatures)
 * but renamed throughout: addIncoming → addIssued, addOutgoing
 * → addReceived, markOutgoingPaid → markReceivedPaid, etc.
 *
 * Not yet migrated (left as embedded-in-row for V1):
 *   - PN akti — embedded in issued/received rows rather than
 *     living in their own 32_pn_akti table. V2 will normalize.
 *   - Delivery notes — embedded in issued rows. Same as above.
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
import { pushToastGlobally } from "@/lib/toast-context";
import type {
  AccountingCategory,
  DepreciationPeriod,
} from "./network-types";

// ============================================================
// Types (unchanged)
// ============================================================

export type ReceivedInvoiceStatus = "apstiprinat_banka" | "apmaksats";

export interface ReceivedInvoiceAccountingMeta {
  category: AccountingCategory;
  depreciationPeriod?: DepreciationPeriod;
  explanation: string;
  updatedAt: string;
}

/**
 * Where this invoice originated — drives UI cues and informs
 * how aggressively to suggest matching against bank statements.
 *
 *   manual     — user uploaded or typed it in
 *   internet   — auto-detected from Gmail receipt scan
 *   auto_bank  — created from a bank statement transaction that
 *                lacked a matching invoice (placeholder for missing
 *                receipt — shown in red until user attaches one)
 */
export type InvoiceSourceChannel = "manual" | "internet" | "auto_bank";

export interface ReceivedInvoice {
  id: string;
  supplier: string;
  invoiceNumber: string;
  amount: number;
  iban: string;
  dueDate: string;
  status: ReceivedInvoiceStatus;
  fileName?: string;
  /** Drive file ID of the supplier invoice PDF. When set, the
   *  invoice card UI shows working 'View' and 'Download' buttons.
   *  When empty, those buttons are disabled with a tooltip
   *  explaining no file has been uploaded yet. */
  fileDriveId?: string;
  accountingMeta?: ReceivedInvoiceAccountingMeta;
  pnAkts?: string;
  pnAktsSource?: "generated" | "uploaded";
  pnAktsFileName?: string;
  /** Drive file ID of the associated PN akts PDF (when uploaded
   *  rather than generated). */
  pnAktsDriveId?: string;
  /** How this invoice came into the system. Defaults to 'manual'
   *  for legacy records that pre-date this field. */
  sourceChannel?: InvoiceSourceChannel;
  /** Drive URL of the payment receipt PDF (e.g. from a bank
   *  statement match or an email auto-scan). Optional. */
  paymentEvidence?: string;
  createdAt: string;
  /** Internal tracking for optimistic locking */
  updatedAt?: string;
}

export type IssuedInvoiceStatus = "gaidam_apmaksu" | "apmaksats" | "kave_maksajumu";

export interface IssuedInvoice {
  id: string;
  number: string;
  client: string;
  description: string;
  amount: number;
  vat: number;
  date: string;
  dueDate: string;
  status: IssuedInvoiceStatus;
  deliveryNote?: string;
  /** Drive file ID of the issued invoice PDF (the document we
   *  generated and sent to the client). */
  fileDriveId?: string;
  /** Drive file ID of the pavadzīme PDF, when one is attached. */
  deliveryNoteDriveId?: string;
  pnAkts?: string;
  pnAktsSource?: "generated" | "uploaded";
  pnAktsFileName?: string;
  /** Drive file ID of an uploaded PN akts PDF. */
  pnAktsDriveId?: string;
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
  received: ReceivedInvoice[];
  issued: IssuedInvoice[];
  salaries: Salary[];
  taxes: Tax[];

  addReceived: (p: Omit<ReceivedInvoice, "id" | "createdAt" | "status">) => void;
  updateReceived: (id: string, patch: Partial<ReceivedInvoice>) => void;
  markReceivedPaid: (id: string) => void;
  setReceivedMeta: (id: string, meta: ReceivedInvoiceAccountingMeta) => void;
  clearReceivedMeta: (id: string) => void;
  attachReceivedPN: (
    id: string,
    pn: string,
    source?: "generated" | "uploaded",
    fileName?: string
  ) => void;
  detachReceivedPN: (id: string) => void;

  addIssued: (i: Omit<IssuedInvoice, "id" | "createdAt">) => void;
  updateIssued: (id: string, patch: Partial<IssuedInvoice>) => void;
  attachDeliveryNote: (id: string, note: string) => void;
  attachIssuedPN: (
    id: string,
    pn: string,
    source?: "generated" | "uploaded",
    fileName?: string
  ) => void;
  detachIssuedPN: (id: string) => void;

  addSalary: (s: Omit<Salary, "id">) => void;
  updateSalary: (id: string, patch: Partial<Salary>) => void;

  addTax: (t: Omit<Tax, "id">) => void;
  updateTax: (id: string, patch: Partial<Tax>) => void;

  /** Force re-fetch of all data from the API. Used after operations
   *  that bulk-create rows server-side (e.g. email import) so the
   *  UI immediately reflects the new state without waiting for a
   *  page refresh. */
  refresh: () => Promise<void>;

  loading: boolean;
}

// ============================================================
// Cache
// ============================================================

const CACHE_RECEIVED = "workmanis:received-cache:";
const CACHE_ISSUED = "workmanis:issued-cache:";
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
  fileDriveId: string | undefined;
  pnAktsDriveId: string | undefined;
  deliveryNoteDriveId: string | undefined;
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
  sourceChannel: string | undefined;
  paymentEvidence: string | undefined;
  fileDriveId: string | undefined;
  pnAktsDriveId: string | undefined;
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

function apiToIssued(a: ApiInvoiceOut): IssuedInvoice {
  return {
    id: a.id,
    number: a.number,
    client: a.client,
    description: a.description,
    amount: a.amount,
    vat: a.vat,
    date: a.date,
    dueDate: a.dueDate,
    status: a.status as IssuedInvoiceStatus,
    deliveryNote: a.deliveryNote,
    pnAkts: a.pnAkts,
    pnAktsSource:
      a.pnAktsSource === "generated" || a.pnAktsSource === "uploaded"
        ? a.pnAktsSource
        : undefined,
    pnAktsFileName: a.pnAktsFileName,
    fileDriveId: a.fileDriveId,
    deliveryNoteDriveId: a.deliveryNoteDriveId,
    pnAktsDriveId: a.pnAktsDriveId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function apiToReceived(a: ApiInvoiceIn): ReceivedInvoice {
  const channel = a.sourceChannel;
  return {
    id: a.id,
    supplier: a.supplier,
    invoiceNumber: a.invoiceNumber,
    amount: a.amount,
    iban: a.iban,
    dueDate: a.dueDate,
    status: a.status as ReceivedInvoiceStatus,
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
    sourceChannel:
      channel === "manual" || channel === "internet" || channel === "auto_bank"
        ? channel
        : undefined,
    paymentEvidence: a.paymentEvidence || undefined,
    fileDriveId: a.fileDriveId,
    pnAktsDriveId: a.pnAktsDriveId,
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

  const [issued, setIssued] = useState<IssuedInvoice[]>([]);
  const [received, setReceived] = useState<ReceivedInvoice[]>([]);
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

      // 30_invoices_out holds documents we ISSUED to clients
      if (outRes.ok) {
        const data = (await outRes.json()) as { invoices: ApiInvoiceOut[] };
        for (const i of data.invoices) newMap.set(i.id, i.updatedAt);
        const mapped = data.invoices.map(apiToIssued);
        setIssued(mapped);
        writeCache(CACHE_ISSUED, companyId, mapped);
      }

      // 31_invoices_in holds documents we RECEIVED from suppliers
      if (inRes.ok) {
        const data = (await inRes.json()) as { invoices: ApiInvoiceIn[] };
        for (const i of data.invoices) newMap.set(i.id, i.updatedAt);
        const mapped = data.invoices.map(apiToReceived);
        setReceived(mapped);
        writeCache(CACHE_RECEIVED, companyId, mapped);
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
      pushToastGlobally(
        "error",
        "Neizdevās ielādēt rēķinu datus no Google Sheets. Pārbaudiet savienojumu."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setIssued([]);
      setReceived([]);
      setSalaries([]);
      setTaxes([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    setIssued(readCache<IssuedInvoice>(CACHE_ISSUED, companyId));
    setReceived(readCache<ReceivedInvoice>(CACHE_RECEIVED, companyId));
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
        pushToastGlobally(
          "error",
          "Saglabāšana neizdevās. Ieraksts tika atcelts."
        );
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
        pushToastGlobally(
          "error",
          "Izmaiņas nepaspēja saglabāties. Atgriezu vecās vērtības."
        );
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

  const addReceived: BillingStore["addReceived"] = (p) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const item: ReceivedInvoice = {
      ...p,
      id: tempId,
      status: "apstiprinat_banka",
      createdAt: now,
      updatedAt: now,
    };

    optimisticCreate<ReceivedInvoice, ApiInvoiceIn>({
      item,
      apiPath: "/api/invoices-in",
      body: receivedToBody(p),
      cachePrefix: CACHE_RECEIVED,
      companyId,
      setState: setReceived,
      apiToLocal: apiToReceived,
      responseKey: "invoice",
    });
  };

  const applyReceivedPatch = (id: string, patch: Partial<ReceivedInvoice>) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: ReceivedInvoice | undefined;
    setReceived((prev) => {
      previous = prev.find((p) => p.id === id);
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      writeCache(CACHE_RECEIVED, companyId, next);
      return next;
    });

    if (!previous) return;

    optimisticUpdate<ReceivedInvoice, ApiInvoiceIn>({
      id,
      previous,
      patch,
      apiPath: "/api/invoices-in",
      body: receivedPatchToBody(patch),
      cachePrefix: CACHE_RECEIVED,
      companyId,
      setState: setReceived,
      apiToLocal: apiToReceived,
      responseKey: "invoice",
    });
  };

  const updateReceived: BillingStore["updateReceived"] = (id, patch) =>
    applyReceivedPatch(id, patch);

  const markReceivedPaid: BillingStore["markReceivedPaid"] = (id) =>
    applyReceivedPatch(id, { status: "apmaksats" });

  const setReceivedMeta: BillingStore["setReceivedMeta"] = (id, meta) =>
    applyReceivedPatch(id, { accountingMeta: meta });

  const clearReceivedMeta: BillingStore["clearReceivedMeta"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: ReceivedInvoice | undefined;
    setReceived((prev) => {
      previous = prev.find((p) => p.id === id);
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        const { accountingMeta: _, ...rest } = p;
        return rest;
      });
      writeCache(CACHE_RECEIVED, companyId, next);
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
        const server = apiToReceived(body.invoice);
        updatedAtMapRef.current.set(server.id, body.invoice.updatedAt);
        setReceived((prev) => {
          const next = prev.map((p) => (p.id === id ? server : p));
          writeCache(CACHE_RECEIVED, companyId, next);
          return next;
        });
      } catch (err) {
        console.error("clearReceivedMeta sync failed:", err);
        pushToastGlobally(
          "error",
          "Grāmatvedības metadatu dzēšana neizdevās."
        );
        if (previous) {
          const prev2 = previous;
          setReceived((prev) => {
            const next = prev.map((p) => (p.id === id ? prev2 : p));
            writeCache(CACHE_RECEIVED, companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const attachReceivedPN: BillingStore["attachReceivedPN"] = (
    id,
    pn,
    source = "generated",
    fileName
  ) =>
    applyReceivedPatch(id, {
      pnAkts: pn,
      pnAktsSource: source,
      pnAktsFileName: fileName,
    });

  const detachReceivedPN: BillingStore["detachReceivedPN"] = (id) =>
    applyReceivedPatch(id, {
      pnAkts: "",
      pnAktsSource: undefined,
      pnAktsFileName: "",
    });

  // ============================================================
  // INCOMING (issued invoices → 30_invoices_out)
  // ============================================================

  const addIssued: BillingStore["addIssued"] = (i) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const item: IssuedInvoice = {
      ...i,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    optimisticCreate<IssuedInvoice, ApiInvoiceOut>({
      item,
      apiPath: "/api/invoices-out",
      body: issuedToBody(i),
      cachePrefix: CACHE_ISSUED,
      companyId,
      setState: setIssued,
      apiToLocal: apiToIssued,
      responseKey: "invoice",
    });
  };

  const applyIssuedPatch = (
    id: string,
    patch: Partial<IssuedInvoice>
  ) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: IssuedInvoice | undefined;
    setIssued((prev) => {
      previous = prev.find((i) => i.id === id);
      const next = prev.map((i) => (i.id === id ? { ...i, ...patch } : i));
      writeCache(CACHE_ISSUED, companyId, next);
      return next;
    });

    if (!previous) return;

    optimisticUpdate<IssuedInvoice, ApiInvoiceOut>({
      id,
      previous,
      patch,
      apiPath: "/api/invoices-out",
      body: issuedPatchToBody(patch),
      cachePrefix: CACHE_ISSUED,
      companyId,
      setState: setIssued,
      apiToLocal: apiToIssued,
      responseKey: "invoice",
    });
  };

  const updateIssued: BillingStore["updateIssued"] = (id, patch) =>
    applyIssuedPatch(id, patch);

  const attachDeliveryNote: BillingStore["attachDeliveryNote"] = (id, note) =>
    applyIssuedPatch(id, { deliveryNote: note });

  const attachIssuedPN: BillingStore["attachIssuedPN"] = (
    id,
    pn,
    source = "generated",
    fileName
  ) =>
    applyIssuedPatch(id, {
      pnAkts: pn,
      pnAktsSource: source,
      pnAktsFileName: fileName,
    });

  const detachIssuedPN: BillingStore["detachIssuedPN"] = (id) =>
    applyIssuedPatch(id, {
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
    received,
    issued,
    salaries,
    taxes,

    addReceived,
    updateReceived,
    markReceivedPaid,
    setReceivedMeta,
    clearReceivedMeta,
    attachReceivedPN,
    detachReceivedPN,

    addIssued,
    updateIssued,
    attachDeliveryNote,
    attachIssuedPN,
    detachIssuedPN,

    addSalary,
    updateSalary,

    addTax,
    updateTax,

    refresh: async () => {
      const id = activeCompany?.id;
      if (id) {
        await fetchAll(id);
      }
    },

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

function receivedToBody(
  o: Omit<ReceivedInvoice, "id" | "createdAt" | "status">
): Record<string, unknown> {
  return {
    supplier: o.supplier,
    invoice_number: o.invoiceNumber,
    amount: o.amount,
    iban: o.iban,
    due_date: o.dueDate,
    status: "apstiprinat_banka",
    file_name: o.fileName ?? "",
    file_drive_id: o.fileDriveId ?? "",
    pn_akts: o.pnAkts ?? "",
    pn_akts_source: o.pnAktsSource ?? "",
    pn_akts_file_name: o.pnAktsFileName ?? "",
    pn_akts_drive_id: o.pnAktsDriveId ?? "",
    source_channel: o.sourceChannel ?? "manual",
    payment_evidence: o.paymentEvidence ?? "",
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

function receivedPatchToBody(
  patch: Partial<ReceivedInvoice>
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
  if (patch.fileDriveId !== undefined) body.file_drive_id = patch.fileDriveId;
  if (patch.pnAkts !== undefined) body.pn_akts = patch.pnAkts;
  if (patch.pnAktsSource !== undefined)
    body.pn_akts_source = patch.pnAktsSource ?? "";
  if (patch.pnAktsFileName !== undefined)
    body.pn_akts_file_name = patch.pnAktsFileName;
  if (patch.pnAktsDriveId !== undefined)
    body.pn_akts_drive_id = patch.pnAktsDriveId;
  if (patch.sourceChannel !== undefined)
    body.source_channel = patch.sourceChannel;
  if (patch.paymentEvidence !== undefined)
    body.payment_evidence = patch.paymentEvidence ?? "";
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

function issuedToBody(
  i: Omit<IssuedInvoice, "id" | "createdAt">
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
    file_drive_id: i.fileDriveId ?? "",
    delivery_note_drive_id: i.deliveryNoteDriveId ?? "",
    pn_akts_drive_id: i.pnAktsDriveId ?? "",
  };
}

function issuedPatchToBody(
  patch: Partial<IssuedInvoice>
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
  if (patch.fileDriveId !== undefined)
    body.file_drive_id = patch.fileDriveId;
  if (patch.deliveryNoteDriveId !== undefined)
    body.delivery_note_drive_id = patch.deliveryNoteDriveId;
  if (patch.pnAktsDriveId !== undefined)
    body.pn_akts_drive_id = patch.pnAktsDriveId;
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
