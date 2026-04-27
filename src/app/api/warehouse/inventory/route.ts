/**
 * Warehouse main inventory — CRUD on 01_warehouse tab.
 * Categorized by 'category' field.
 */

import { makeWarehouseListCreateHandlers } from "@/lib/warehouse-routes";
import {
  parseInventoryCreateBody,
  inventoryRowToApi,
  type ApiInventoryItem,
  type InventoryRow,
} from "@/lib/warehouse-shared";

export const maxDuration = 30;

export const { GET, POST } = makeWarehouseListCreateHandlers<
  InventoryRow,
  ApiInventoryItem
>({
  tab: "01_warehouse",
  responseKey: "items",
  parseCreateBody: parseInventoryCreateBody,
  rowToApi: inventoryRowToApi,
});
