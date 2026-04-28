/**
 * Warehouse module schema.
 *
 * Lives in a SEPARATE Google Sheet from the per-company sheets —
 * named 'Workmanis_noliktava'. Per the user's specification, the
 * warehouse module is currently a single global sheet that the
 * authenticated user owns, not partitioned by company.
 *
 * Tabs follow the same naming pattern as the per-company schema
 * (numeric prefix, snake_case English names, ASCII columns) so
 * existing tooling (sheets-client, store-routes, makeCrud) works
 * without special cases.
 */

export const WAREHOUSE_SHEET_NAME = "Workmanis_noliktava";

export const WAREHOUSE_TABS = [
  // 01 — Raw materials and standard parts. Categorized.
  {
    name: "01_warehouse",
    idPrefix: "wh",
    cols: [
      "category",
      "image_url",
      "name",
      "supplier",
      "qty_per_unit",
      "location",
      "stock",
      "notes",
    ],
  },

  // 02 — Demo production units (work-in-progress, ready for testing
  // or pilot deployment but not for sale)
  {
    name: "02_demo_production",
    idPrefix: "dp",
    cols: [
      "image_url",
      "name",
      "supplier",
      "qty_per_unit",
      "location",
      "stock",
      "notes",
    ],
  },

  // 03 — Finished goods, ready for sale or distribution
  {
    name: "03_finished_production",
    idPrefix: "fp",
    cols: [
      "image_url",
      "name",
      "supplier",
      "qty_per_unit",
      "location",
      "stock",
      "notes",
    ],
  },

  // 04 — Warehouse staff. Auth flow is deferred (see commit history);
  // this tab stores the records, login wiring comes in a future pass.
  {
    name: "04_warehouse_employees",
    idPrefix: "we",
    cols: [
      "email",
      "password",
      "role",
      "active",
    ],
  },

  // 05 — Movement log. Append-only audit of every stock change,
  // create, edit, and delete. Used for the Kustību žurnāls UI.
  {
    name: "05_movements",
    idPrefix: "mv",
    cols: [
      "date",
      "section",
      "category",
      "item_id",
      "item_name",
      "action",
      "amount",
      "stock_before",
      "stock_after",
      "user",
      "note",
    ],
  },
] as const;

/** Categories for the main warehouse tab. */
export const WAREHOUSE_CATEGORIES = [
  { id: "standarta", label: "Standarta komponentes", emoji: "🔩" },
  { id: "baterijas", label: "Baterijām", emoji: "🔋" },
  { id: "aksesuari", label: "Aksesuāriem", emoji: "🎒" },
  { id: "riepas", label: "Riepas", emoji: "🛞" },
] as const;

export type WarehouseCategoryId = (typeof WAREHOUSE_CATEGORIES)[number]["id"];

/** Movement log action types. */
export type MovementAction =
  | "Paņemts"
  | "Nolikts"
  | "Izveidots"
  | "Labots"
  | "Dzēsts";

/** Warehouse employee roles. */
export type WarehouseRole =
  | "Noliktavas darbinieks"
  | "Noliktavas administrators";
