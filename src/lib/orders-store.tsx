"use client";

/**
 * OrdersProvider — Sheets-backed with localStorage cache and
 * optimistic-UI writes. Same pattern as the other migrated stores.
 *
 * Public API UNCHANGED — order-modal and related components don't
 * need changes.
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

// ============================================================
// Types (unchanged)
// ============================================================

export type OrderType =
  | "komandejums"
  | "atvalinajums"
  | "darba_piesakums"
  | "atlaisana"
  | "cits";

export interface Order {
  id: string;
  type: OrderType;
  title: string;
  issueDate: string;
  employeeId?: string;
  employeeName?: string;
  destinationFrom?: string;
  destinationTo?: string;
  tripStartDate?: string;
  tripEndDate?: string;
  vacationStartDate?: string;
  vacationEndDate?: string;
  vacationPayTiming?: "before" | "after";
  notes?: string;
  fileName?: string;
  createdAt: string;
  /** Tracked internally for optimistic locking */
  updatedAt?: string;
}

// ============================================================
// Helpers (unchanged)
// ============================================================

export function orderTypeLabel(t: OrderType): string {
  switch (t) {
    case "komandejums":
      return "Rīkojums par komandējumu";
    case "atvalinajums":
      return "Rīkojums par atvaļinājumu";
    case "darba_piesakums":
      return "Rīkojums par darba pieņemšanu";
    case "atlaisana":
      return "Rīkojums par atlaišanu";
    case "cits":
      return "Cits rīkojums";
  }
}

export function shortOrderTypeLabel(t: OrderType): string {
  switch (t) {
    case "komandejums":
      return "Komandējums";
    case "atvalinajums":
      return "Atvaļinājums";
    case "darba_piesakums":
      return "Darba pieņemšana";
    case "atlaisana":
      return "Atlaišana";
    case "cits":
      return "Cits";
  }
}

// ============================================================
// Store
// ============================================================

interface OrdersStore {
  orders: Order[];
  addOrder: (data: Omit<Order, "id" | "createdAt">) => void;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  deleteOrder: (id: string) => void;
  getOrder: (id: string) => Order | undefined;
  loading: boolean;
}

// ============================================================
// Cache + API
// ============================================================

const CACHE_PREFIX = "workmanis:orders-cache:";

function readCache(companyId: string): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as Order[];
  } catch {
    return [];
  }
}

function writeCache(companyId: string, orders: Order[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + companyId, JSON.stringify(orders));
  } catch {
    // ignore
  }
}

interface ApiOrder {
  id: string;
  type: string;
  title: string;
  issueDate: string;
  employeeId: string | undefined;
  employeeName: string | undefined;
  destinationFrom: string | undefined;
  destinationTo: string | undefined;
  tripStartDate: string | undefined;
  tripEndDate: string | undefined;
  vacationStartDate: string | undefined;
  vacationEndDate: string | undefined;
  vacationPayTiming: string | undefined;
  notes: string | undefined;
  fileName: string | undefined;
  createdAt: string;
  updatedAt: string;
}

function apiToOrder(a: ApiOrder): Order {
  return {
    id: a.id,
    type: a.type as OrderType,
    title: a.title,
    issueDate: a.issueDate,
    employeeId: a.employeeId,
    employeeName: a.employeeName,
    destinationFrom: a.destinationFrom,
    destinationTo: a.destinationTo,
    tripStartDate: a.tripStartDate,
    tripEndDate: a.tripEndDate,
    vacationStartDate: a.vacationStartDate,
    vacationEndDate: a.vacationEndDate,
    vacationPayTiming:
      a.vacationPayTiming === "before" || a.vacationPayTiming === "after"
        ? a.vacationPayTiming
        : undefined,
    notes: a.notes,
    fileName: a.fileName,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function orderToCreateBody(
  o: Omit<Order, "id" | "createdAt">
): Record<string, unknown> {
  return {
    type: o.type,
    title: o.title,
    issue_date: o.issueDate,
    employee_id: o.employeeId ?? "",
    employee_name: o.employeeName ?? "",
    destination_from: o.destinationFrom ?? "",
    destination_to: o.destinationTo ?? "",
    trip_start_date: o.tripStartDate ?? "",
    trip_end_date: o.tripEndDate ?? "",
    vacation_start_date: o.vacationStartDate ?? "",
    vacation_end_date: o.vacationEndDate ?? "",
    vacation_pay_timing: o.vacationPayTiming ?? "",
    notes: o.notes ?? "",
    file_name: o.fileName ?? "",
  };
}

function patchToApiBody(patch: Partial<Order>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.issueDate !== undefined) body.issue_date = patch.issueDate;
  if (patch.employeeId !== undefined) body.employee_id = patch.employeeId;
  if (patch.employeeName !== undefined)
    body.employee_name = patch.employeeName;
  if (patch.destinationFrom !== undefined)
    body.destination_from = patch.destinationFrom;
  if (patch.destinationTo !== undefined)
    body.destination_to = patch.destinationTo;
  if (patch.tripStartDate !== undefined)
    body.trip_start_date = patch.tripStartDate;
  if (patch.tripEndDate !== undefined)
    body.trip_end_date = patch.tripEndDate;
  if (patch.vacationStartDate !== undefined)
    body.vacation_start_date = patch.vacationStartDate;
  if (patch.vacationEndDate !== undefined)
    body.vacation_end_date = patch.vacationEndDate;
  if (patch.vacationPayTiming !== undefined)
    body.vacation_pay_timing = patch.vacationPayTiming;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.fileName !== undefined) body.file_name = patch.fileName;
  return body;
}

// ============================================================
// Provider
// ============================================================

const uid = () => Math.random().toString(36).slice(2, 10);

const OrdersContext = createContext<OrdersStore | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const updatedAtMapRef = useRef<Map<string, string>>(new Map());
  const lastCompanyIdRef = useRef<string | null>(null);

  const fetchFromServer = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/orders?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`List orders failed: ${res.status}`);
      const data = (await res.json()) as { orders: ApiOrder[] };

      const newMap = new Map<string, string>();
      for (const o of data.orders) newMap.set(o.id, o.updatedAt);
      updatedAtMapRef.current = newMap;

      const fresh = data.orders.map(apiToOrder);
      setOrders(fresh);
      writeCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch orders failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setOrders([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    setOrders(readCache(companyId));
    void fetchFromServer(companyId);
  }, [activeCompany, fetchFromServer]);

  // ========== Mutations ==========

  const addOrder: OrdersStore["addOrder"] = (data) => {
    const companyId = activeCompany?.id;
    if (!companyId) {
      console.warn("addOrder without active company");
      return;
    }

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const optimistic: Order = {
      ...data,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    setOrders((prev) => {
      const next = [optimistic, ...prev];
      writeCache(companyId, next);
      return next;
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/orders?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderToCreateBody(data)),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`POST failed: ${res.status} ${text}`);
        }
        const body = (await res.json()) as { order: ApiOrder };
        const server = apiToOrder(body.order);
        updatedAtMapRef.current.set(server.id, body.order.updatedAt);

        setOrders((prev) => {
          const next = prev.map((o) => (o.id === tempId ? server : o));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("addOrder sync failed:", err);
        setOrders((prev) => {
          const next = prev.filter((o) => o.id !== tempId);
          writeCache(companyId, next);
          return next;
        });
      }
    })();
  };

  const updateOrder: OrdersStore["updateOrder"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Order | undefined;
    setOrders((prev) => {
      previous = prev.find((o) => o.id === id);
      const next = prev.map((o) => (o.id === id ? { ...o, ...patch } : o));
      writeCache(companyId, next);
      return next;
    });

    if (!previous) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtMapRef.current.get(id) ?? previous.createdAt;

    const apiBody = {
      expected_updated_at: expectedUpdatedAt,
      ...patchToApiBody(patch),
    };

    void (async () => {
      try {
        const res = await fetch(
          `/api/orders/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiBody),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`PATCH failed: ${res.status} ${text}`);
        }
        const body = (await res.json()) as { order: ApiOrder };
        const server = apiToOrder(body.order);
        updatedAtMapRef.current.set(server.id, body.order.updatedAt);
        setOrders((prev) => {
          const next = prev.map((o) => (o.id === id ? server : o));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("updateOrder sync failed:", err);
        if (previous) {
          const prev2 = previous;
          setOrders((prev) => {
            const next = prev.map((o) => (o.id === id ? prev2 : o));
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const deleteOrder: OrdersStore["deleteOrder"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let removed: Order | undefined;
    setOrders((prev) => {
      removed = prev.find((o) => o.id === id);
      const next = prev.filter((o) => o.id !== id);
      writeCache(companyId, next);
      return next;
    });

    if (!removed) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtMapRef.current.get(id) ?? removed.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/orders/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      } catch (err) {
        console.error("deleteOrder sync failed:", err);
        if (removed) {
          const restored = removed;
          setOrders((prev) => {
            const next = [restored, ...prev];
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const getOrder: OrdersStore["getOrder"] = (id) =>
    orders.find((o) => o.id === id);

  const store: OrdersStore = {
    orders,
    addOrder,
    updateOrder,
    deleteOrder,
    getOrder,
    loading,
  };

  return (
    <OrdersContext.Provider value={store}>{children}</OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used inside OrdersProvider");
  return ctx;
}
