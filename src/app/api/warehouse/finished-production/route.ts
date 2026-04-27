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
  tab: "03_finished_production",
  responseKey: "items",
  parseCreateBody: parseInventoryCreateBody,
  rowToApi: inventoryRowToApi,
});
