"use client";

import { InventoryPageLayout } from "@/components/warehouse/inventory-page-layout";
import { useWarehouse } from "@/lib/warehouse-store";

export default function GatavaProdukcijaPage() {
  const { finishedProduction } = useWarehouse();
  return (
    <InventoryPageLayout
      title="Gatavā produkcija"
      description="Saražotā un realizācijai gatavā produkcija"
      section="finished-production"
      items={finishedProduction}
      showCategoryTabs={false}
    />
  );
}
