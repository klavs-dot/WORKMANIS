"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ============================================================
// Types
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
  /** Manager-given title — e.g. "Komandējums uz Berlīni — IDEX 2026" */
  title: string;
  /** ISO YYYY-MM-DD — when the order was issued/signed */
  issueDate: string;
  /** Optional reference to an Employee.id from employees-store */
  employeeId?: string;
  /** Display-cached employee name (denormalized so order list reads fast) */
  employeeName?: string;

  // ─── Komandējums-specific fields ───
  destinationFrom?: string; // city/place
  destinationTo?: string; // city/place
  tripStartDate?: string; // ISO inclusive
  tripEndDate?: string; // ISO inclusive

  // ─── Atvaļinājums-specific fields ───
  vacationStartDate?: string; // ISO inclusive
  vacationEndDate?: string; // ISO inclusive
  /** When to pay the vacation premium */
  vacationPayTiming?: "before" | "after";

  // ─── Common ───
  notes?: string;
  fileName?: string; // optional attached PDF
  createdAt: string;
}

// ============================================================
// Helpers
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
}

const KEY = "workmanis:orders";

function readOrders(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Order[];
  } catch {
    return [];
  }
}

function writeOrders(list: Order[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

const OrdersContext = createContext<OrdersStore | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOrders(readOrders());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeOrders(orders);
  }, [orders, hydrated]);

  const store: OrdersStore = {
    orders,
    addOrder: (data) =>
      setOrders((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]),
    updateOrder: (id, patch) =>
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
      ),
    deleteOrder: (id) =>
      setOrders((prev) => prev.filter((o) => o.id !== id)),
    getOrder: (id) => orders.find((o) => o.id === id),
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
