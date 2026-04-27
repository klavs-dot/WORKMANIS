"use client";

import { InventoryPageLayout } from "@/components/warehouse/inventory-page-layout";
import { useWarehouse } from "@/lib/warehouse-store";

export default function NoliktavaPage() {
  const { inventory } = useWarehouse();
  return (
    <InventoryPageLayout
      title="Noliktava"
      description="Standarta komponentes, baterijas, aksesuāri un riepas"
      section="inventory"
      items={inventory}
      showCategoryTabs
    />
  );
}
