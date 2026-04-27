/**
 * Movement log — append-only audit on 05_movements tab.
 *
 * GET returns the full log (newest first). POST appends a new
 * entry. No PATCH/DELETE — the log is immutable by design.
 *
 * Stock-change endpoints (warehouse, demo, finished) call POST
 * here after every increment/decrement/create/edit/delete so we
 * have a single source of truth for who changed what when.
 */

import { makeWarehouseListCreateHandlers } from "@/lib/warehouse-routes";

export const maxDuration = 30;

interface MovementRow extends Record<string, string> {
  date: string;
  section: string;
  category: string;
  item_id: string;
  item_name: string;
  action: string;
  amount: string;
  stock_before: string;
  stock_after: string;
  user: string;
  note: string;
}

export interface ApiMovement {
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

function parseCreateBody(body: unknown): MovementRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.section !== "string" || !b.section) return null;
  if (typeof b.action !== "string" || !b.action) return null;

  return {
    date:
      typeof b.date === "string" && b.date
        ? b.date
        : new Date().toISOString(),
    section: b.section as string,
    category: typeof b.category === "string" ? b.category : "",
    item_id: typeof b.item_id === "string" ? b.item_id : "",
    item_name: typeof b.item_name === "string" ? b.item_name : "",
    action: b.action as string,
    amount: numToStr(b.amount),
    stock_before: numToStr(b.stock_before),
    stock_after: numToStr(b.stock_after),
    user: typeof b.user === "string" ? b.user : "",
    note: typeof b.note === "string" ? b.note : "",
  };
}

function rowToApi(row: Record<string, unknown>): ApiMovement {
  return {
    id: row.id as string,
    date: (row.date as string) ?? "",
    section: (row.section as string) ?? "",
    category: (row.category as string) ?? "",
    itemId: (row.item_id as string) ?? "",
    itemName: (row.item_name as string) ?? "",
    action: (row.action as string) ?? "",
    amount: strToNum(row.amount),
    stockBefore: strToNum(row.stock_before),
    stockAfter: strToNum(row.stock_after),
    user: (row.user as string) ?? "",
    note: (row.note as string) ?? "",
  };
}

function numToStr(v: unknown): string {
  if (typeof v === "number" && !isNaN(v)) return String(v);
  if (typeof v === "string" && v !== "") return v;
  return "0";
}

function strToNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export const { GET, POST } = makeWarehouseListCreateHandlers<
  MovementRow,
  ApiMovement
>({
  tab: "05_movements",
  responseKey: "movements",
  parseCreateBody,
  rowToApi,
});
