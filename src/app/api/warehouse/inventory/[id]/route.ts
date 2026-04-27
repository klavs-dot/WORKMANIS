import { makeWarehouseUpdateDeleteHandlers } from "@/lib/warehouse-routes";
import {
  parseInventoryUpdateBody,
  inventoryRowToApi,
  type ApiInventoryItem,
} from "@/lib/warehouse-shared";

export const maxDuration = 30;

export const { PATCH, DELETE } = makeWarehouseUpdateDeleteHandlers<ApiInventoryItem>({
  tab: "01_warehouse",
  parseUpdateBody: parseInventoryUpdateBody,
  rowToApi: inventoryRowToApi,
});
