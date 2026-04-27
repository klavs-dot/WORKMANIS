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
  tab: "02_demo_production",
  responseKey: "items",
  parseCreateBody: parseInventoryCreateBody,
  rowToApi: inventoryRowToApi,
});
