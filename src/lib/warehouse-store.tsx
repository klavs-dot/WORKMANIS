"use client";

/**
 * Warehouse data store.
 *
 * Single React context that holds inventory items, demo production,
 * finished production, employees, and the movement log. Loads on
 * mount, exposes optimistic CRUD plus a special atomic stock-change
 * operation that updates the item AND appends a movement log entry.
 *
 * Why one big store (vs four small ones): the movement log spans
 * all sections, and the stock-change operation needs to touch both
 * an item and the log. Keeping everything in one provider avoids
 * cross-store coordination headaches.
 *
 * Why no localStorage cache: warehouse data is shared with workshop
 * employees on shared devices — caching their stock counts in the
 * admin's browser doesn't make sense. Always fetch fresh.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { pushToastGlobally } from "./toast-context";

// ---------- Types ----------

export interface InventoryItem {
  id: string;
  category: string;
  imageUrl: string;
  name: string;
  supplier: string;
  qtyPerUnit: number;
  location: string;
  stock: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Movement {
  id: string;
  date: string;
  section: string;
  category: string;
  itemId: string;
  itemName: string;
  action: string;
  amount: number;
  stockBefore: number;
  stockAfter: number;
  user: string;
  note: string;
}

/** Which inventory section a stock change targets. Maps to the
 *  corresponding API endpoint. */
export type WarehouseSection =
  | "inventory"
  | "demo-production"
  | "finished-production";

export type StockChangeAction = "Paņemts" | "Nolikts";

interface WarehouseStoreValue {
  inventory: InventoryItem[];
  demoProduction: InventoryItem[];
  finishedProduction: InventoryItem[];
  employees: Employee[];
  movements: Movement[];
  loading: boolean;
  refresh: () => Promise<void>;

  // Inventory CRUD
  createItem: (
    section: WarehouseSection,
    data: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">
  ) => Promise<void>;
  updateItem: (
    section: WarehouseSection,
    id: string,
    patch: Partial<Omit<InventoryItem, "id" | "createdAt">>
  ) => Promise<void>;
  deleteItem: (section: WarehouseSection, id: string) => Promise<void>;

  /** Atomic stock change. Updates the item AND writes movement log.
   *  Throws if amount > current stock when taking. */
  changeStock: (input: {
    section: WarehouseSection;
    itemId: string;
    action: StockChangeAction;
    amount: number;
    note?: string;
  }) => Promise<void>;

  // Employee CRUD
  createEmployee: (data: {
    email: string;
    password: string;
    role: string;
    active: boolean;
  }) => Promise<void>;
  updateEmployee: (
    id: string,
    patch: { email?: string; password?: string; role?: string; active?: boolean }
  ) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
}

const WarehouseContext = createContext<WarehouseStoreValue | null>(null);

// ---------- Provider ----------

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [demoProduction, setDemoProduction] = useState<InventoryItem[]>([]);
  const [finishedProduction, setFinishedProduction] = useState<InventoryItem[]>(
    []
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, demoRes, finRes, empRes, movRes] = await Promise.all([
        fetch("/api/warehouse/inventory", { cache: "no-store" }),
        fetch("/api/warehouse/demo-production", { cache: "no-store" }),
        fetch("/api/warehouse/finished-production", { cache: "no-store" }),
        fetch("/api/warehouse/employees", { cache: "no-store" }),
        fetch("/api/warehouse/movements", { cache: "no-store" }),
      ]);

      if (invRes.ok) {
        const { items } = (await invRes.json()) as { items: InventoryItem[] };
        setInventory(items ?? []);
      }
      if (demoRes.ok) {
        const { items } = (await demoRes.json()) as { items: InventoryItem[] };
        setDemoProduction(items ?? []);
      }
      if (finRes.ok) {
        const { items } = (await finRes.json()) as { items: InventoryItem[] };
        setFinishedProduction(items ?? []);
      }
      if (empRes.ok) {
        const { employees: emps } = (await empRes.json()) as {
          employees: Employee[];
        };
        setEmployees(emps ?? []);
      }
      if (movRes.ok) {
        const { movements: movs } = (await movRes.json()) as {
          movements: Movement[];
        };
        // Newest first
        setMovements(
          (movs ?? []).sort((a, b) => b.date.localeCompare(a.date))
        );
      }
    } catch (err) {
      console.error("Warehouse load failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // ---------- Section helpers ----------

  const sectionState = useCallback(
    (section: WarehouseSection) => {
      if (section === "inventory")
        return { items: inventory, setItems: setInventory };
      if (section === "demo-production")
        return { items: demoProduction, setItems: setDemoProduction };
      return { items: finishedProduction, setItems: setFinishedProduction };
    },
    [inventory, demoProduction, finishedProduction]
  );

  const sectionLabel = (section: WarehouseSection): string => {
    if (section === "inventory") return "Noliktava";
    if (section === "demo-production") return "Demo produkcija";
    return "Gatavā produkcija";
  };

  // ---------- CRUD: inventory items ----------

  const createItem: WarehouseStoreValue["createItem"] = async (
    section,
    data
  ) => {
    try {
      const res = await fetch(`/api/warehouse/${section}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: data.category,
          image_url: data.imageUrl,
          name: data.name,
          supplier: data.supplier,
          qty_per_unit: data.qtyPerUnit,
          location: data.location,
          stock: data.stock,
          notes: data.notes,
        }),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      const { item } = (await res.json()) as { item: InventoryItem };
      const { setItems } = sectionState(section);
      setItems((prev) => [...prev, item]);

      // Log creation
      void writeMovementLog({
        section: sectionLabel(section),
        category: item.category,
        itemId: item.id,
        itemName: item.name,
        action: "Izveidots",
        amount: item.stock,
        stockBefore: 0,
        stockAfter: item.stock,
      });

      pushToastGlobally("success", "Prece pievienota.", 3500);
    } catch (err) {
      console.error("Create item failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  const updateItem: WarehouseStoreValue["updateItem"] = async (
    section,
    id,
    patch
  ) => {
    const { items, setItems } = sectionState(section);
    const current = items.find((i) => i.id === id);
    if (!current) return;

    try {
      const res = await fetch(`/api/warehouse/${section}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: current.updatedAt,
          ...(patch.category !== undefined && { category: patch.category }),
          ...(patch.imageUrl !== undefined && { image_url: patch.imageUrl }),
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.supplier !== undefined && { supplier: patch.supplier }),
          ...(patch.qtyPerUnit !== undefined && {
            qty_per_unit: patch.qtyPerUnit,
          }),
          ...(patch.location !== undefined && { location: patch.location }),
          ...(patch.stock !== undefined && { stock: patch.stock }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
        }),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      const { item } = (await res.json()) as { item: InventoryItem };
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)));

      void writeMovementLog({
        section: sectionLabel(section),
        category: item.category,
        itemId: item.id,
        itemName: item.name,
        action: "Labots",
        amount: 0,
        stockBefore: current.stock,
        stockAfter: item.stock,
      });

      pushToastGlobally("success", "Prece saglabāta.", 3500);
    } catch (err) {
      console.error("Update item failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  const deleteItem: WarehouseStoreValue["deleteItem"] = async (section, id) => {
    const { items, setItems } = sectionState(section);
    const current = items.find((i) => i.id === id);
    if (!current) return;

    try {
      const res = await fetch(`/api/warehouse/${section}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));

      void writeMovementLog({
        section: sectionLabel(section),
        category: current.category,
        itemId: current.id,
        itemName: current.name,
        action: "Dzēsts",
        amount: 0,
        stockBefore: current.stock,
        stockAfter: 0,
      });

      pushToastGlobally("success", "Prece dzēsta.", 3500);
    } catch (err) {
      console.error("Delete item failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  // ---------- Stock change (atomic) ----------

  const changeStock: WarehouseStoreValue["changeStock"] = async ({
    section,
    itemId,
    action,
    amount,
    note,
  }) => {
    const { items, setItems } = sectionState(section);
    const current = items.find((i) => i.id === itemId);
    if (!current) {
      pushToastGlobally("error", "Prece nav atrasta.", 5000);
      throw new Error("Item not found");
    }

    if (amount <= 0) {
      pushToastGlobally("error", "Ievadi korektu skaitu.", 5000);
      throw new Error("Invalid amount");
    }

    const stockBefore = current.stock;
    const delta = action === "Paņemts" ? -amount : amount;
    const stockAfter = stockBefore + delta;

    if (stockAfter < 0) {
      pushToastGlobally("error", "Nepietiekams atlikums noliktavā.", 5000);
      throw new Error("Insufficient stock");
    }

    // Optimistic update — flip immediately, roll back on failure
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, stock: stockAfter } : i))
    );

    try {
      const res = await fetch(`/api/warehouse/${section}/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: current.updatedAt,
          stock: stockAfter,
        }),
      });
      if (!res.ok) {
        // Roll back optimistic update
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, stock: stockBefore } : i
          )
        );
        throw new Error(`Stock update failed: ${res.status}`);
      }
      const { item } = (await res.json()) as { item: InventoryItem };
      setItems((prev) => prev.map((i) => (i.id === itemId ? item : i)));

      void writeMovementLog({
        section: sectionLabel(section),
        category: current.category,
        itemId: current.id,
        itemName: current.name,
        action,
        amount,
        stockBefore,
        stockAfter,
        note,
      });

      pushToastGlobally("success", "Atlikums atjaunots.", 3500);
    } catch (err) {
      console.error("Stock change failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  // ---------- Movement log helper ----------

  const writeMovementLog = async (entry: {
    section: string;
    category: string;
    itemId: string;
    itemName: string;
    action: string;
    amount: number;
    stockBefore: number;
    stockAfter: number;
    note?: string;
  }) => {
    try {
      const res = await fetch("/api/warehouse/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString(),
          section: entry.section,
          category: entry.category,
          item_id: entry.itemId,
          item_name: entry.itemName,
          action: entry.action,
          amount: entry.amount,
          stock_before: entry.stockBefore,
          stock_after: entry.stockAfter,
          user: "",
          note: entry.note ?? "",
        }),
      });
      if (res.ok) {
        const { item } = (await res.json()) as { item: Movement };
        setMovements((prev) => [item, ...prev]);
      }
    } catch (err) {
      // Movement log failure is non-fatal — the item update already
      // succeeded, log entry just won't show. Worth noting but not
      // worth a user-facing error.
      console.error("Movement log write failed:", err);
    }
  };

  // ---------- CRUD: employees ----------

  const createEmployee: WarehouseStoreValue["createEmployee"] = async (data) => {
    try {
      const res = await fetch("/api/warehouse/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Create employee failed: ${res.status}`);
      const { item } = (await res.json()) as { item: Employee };
      setEmployees((prev) => [...prev, item]);
      pushToastGlobally("success", "Darbinieks pievienots.", 3500);
    } catch (err) {
      console.error("Create employee failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  const updateEmployee: WarehouseStoreValue["updateEmployee"] = async (
    id,
    patch
  ) => {
    const current = employees.find((e) => e.id === id);
    if (!current) return;
    try {
      const res = await fetch(`/api/warehouse/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_updated_at: current.updatedAt,
          ...patch,
        }),
      });
      if (!res.ok) throw new Error(`Update employee failed: ${res.status}`);
      const { item } = (await res.json()) as { item: Employee };
      setEmployees((prev) => prev.map((e) => (e.id === id ? item : e)));
      pushToastGlobally(
        "success",
        patch.password ? "Parole atjaunota." : "Darbinieks atjaunots.",
        3500
      );
    } catch (err) {
      console.error("Update employee failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  const deleteEmployee: WarehouseStoreValue["deleteEmployee"] = async (id) => {
    try {
      const res = await fetch(`/api/warehouse/employees/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete employee failed: ${res.status}`);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      pushToastGlobally("success", "Darbinieks dzēsts.", 3500);
    } catch (err) {
      console.error("Delete employee failed:", err);
      pushToastGlobally("error", "Kļūda saglabājot datus.", 7000);
      throw err;
    }
  };

  const value = useMemo<WarehouseStoreValue>(
    () => ({
      inventory,
      demoProduction,
      finishedProduction,
      employees,
      movements,
      loading,
      refresh: fetchAll,
      createItem,
      updateItem,
      deleteItem,
      changeStock,
      createEmployee,
      updateEmployee,
      deleteEmployee,
    }),
    // Recompute when underlying data changes; handlers themselves
    // are stable since they read from useState getters at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      inventory,
      demoProduction,
      finishedProduction,
      employees,
      movements,
      loading,
      fetchAll,
    ]
  );

  return (
    <WarehouseContext.Provider value={value}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  const ctx = useContext(WarehouseContext);
  if (!ctx) {
    throw new Error("useWarehouse must be used inside WarehouseProvider");
  }
  return ctx;
}
