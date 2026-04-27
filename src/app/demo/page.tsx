"use client";

/**
 * /demo — Demo produkcija (warehouse module).
 *
 * Replaces the older per-company demo-units page. The previous
 * implementation lives at _old-demo-units.tsx.bak in this folder
 * for reference until the warehouse module is fully validated.
 *
 * If you need to roll back: rename .bak → page.tsx and restart.
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
