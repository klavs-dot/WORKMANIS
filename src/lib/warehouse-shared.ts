/**
 * Shared parsers and API row mappers for warehouse endpoints.
 *
 * Three of the four CRUD endpoints (warehouse, demo-production,
 * finished-production) share most fields. Only the warehouse tab
 * adds 'category'. Centralizing here keeps the route files thin.
 */

// ---------- Inventory item types (warehouse, demo, finished) ----------

export interface ApiInventoryItem {
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

export interface InventoryRow extends Record<string, string> {
  category: string;
  image_url: string;
  name: string;
  supplier: string;
  qty_per_unit: string;
  location: string;
  stock: string;
  notes: string;
}

const INVENTORY_FIELDS = [
  "category",
  "image_url",
  "name",
  "supplier",
  "qty_per_unit",
  "location",
  "stock",
  "notes",
] as const;

/**
 * Parse a CREATE request body. Requires 'name' (the only required
 * field per the spec); everything else defaults to empty string or 0.
 *
 * Numeric fields (qty_per_unit, stock) are stored as strings in the
 * sheet — Sheets has no number column type — but coerced to number
 * on the client. We accept either type from the request body.
 */
export function parseInventoryCreateBody(body: unknown): InventoryRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return null;

  return {
    category: typeof b.category === "string" ? b.category : "",
    image_url: typeof b.image_url === "string" ? b.image_url : "",
    name: (b.name as string).trim(),
    supplier: typeof b.supplier === "string" ? b.supplier : "",
    qty_per_unit: numToStr(b.qty_per_unit),
    location: typeof b.location === "string" ? b.location : "",
    stock: numToStr(b.stock),
    notes: typeof b.notes === "string" ? b.notes : "",
  };
}

/**
 * Parse a PATCH request body. expected_updated_at is required for
 * optimistic locking. Other fields are optional — only included keys
 * are updated.
 */
export function parseInventoryUpdateBody(
  body: unknown
): (Record<string, string> & { expected_updated_at: string }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.expected_updated_at !== "string" || !b.expected_updated_at) {
    return null;
  }

  const patch: Record<string, string> & { expected_updated_at: string } = {
    expected_updated_at: b.expected_updated_at,
  };

  for (const key of INVENTORY_FIELDS) {
    const v = b[key];
    if (typeof v === "string") patch[key] = v;
    else if (typeof v === "number") patch[key] = String(v);
  }

  return patch;
}

export function inventoryRowToApi(
  row: Record<string, unknown>
): ApiInventoryItem {
  return {
    id: row.id as string,
    category: (row.category as string) ?? "",
    imageUrl: (row.image_url as string) ?? "",
    name: (row.name as string) ?? "",
    supplier: (row.supplier as string) ?? "",
    qtyPerUnit: strToNum(row.qty_per_unit),
    location: (row.location as string) ?? "",
    stock: strToNum(row.stock),
    notes: (row.notes as string) ?? "",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

// ---------- Helpers ----------

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
