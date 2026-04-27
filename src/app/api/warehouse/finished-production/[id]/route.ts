import { makeWarehouseUpdateDeleteHandlers } from "@/lib/warehouse-routes";
import {
  parseInventoryUpdateBody,
  inventoryRowToApi,
  type ApiInventoryItem,
} from "@/lib/warehouse-shared";

export const maxDuration = 30;

export const { PATCH, DELETE } = makeWarehouseUpdateDeleteHandlers<ApiInventoryItem>({
  tab: "03_finished_production",
  parseUpdateBody: parseInventoryUpdateBody,
  rowToApi: inventoryRowToApi,
});
