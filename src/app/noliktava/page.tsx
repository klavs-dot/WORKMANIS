"use client";

/**
 * Noliktava — warehouse / inventory management placeholder.
 *
 * Real implementation pending. Will eventually track raw materials,
 * stock levels, locations, and movement history. For now the route
 * exists so the sidebar link doesn't 404 and the user can see where
 * the feature is going.
 */

import { Warehouse } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";

export default function NoliktavaPage() {
  return (
    <AppShell>
      <PageHeader
        title="Noliktava"
        description="Izejvielu un materiālu uzskaite"
      />
      <EmptyState
        icon={Warehouse}
        title="Drīzumā"
        description="Šeit varēsi pārvaldīt noliktavas atlikumus, pievienot izejvielas un sekot līdzi krājumu kustībai. Saraksts būs pieejams nākamajā atjauninājumā."
      />
    </AppShell>
  );
}
