"use client";

/**
 * /demo — Demo produkcija (warehouse module).
 *
 * Thin wrapper around the shared <InventoryPageLayout /> bound to
 * the warehouse store's demoProduction collection.
 */

import { InventoryPageLayout } from "@/components/warehouse/inventory-page-layout";
import { useWarehouse } from "@/lib/warehouse-store";

export default function DemoProdukcijaPage() {
  const { demoProduction } = useWarehouse();
  return (
    <InventoryPageLayout
      title="Demo produkcija"
      description="Darba versijas un demonstrācijas paraugi"
      section="demo-production"
      items={demoProduction}
      showCategoryTabs={false}
    />
  );
}
