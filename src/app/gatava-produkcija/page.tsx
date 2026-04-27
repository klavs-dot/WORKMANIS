"use client";

/**
 * Gatavā produkcija — finished goods inventory placeholder.
 *
 * Real implementation pending. Will track production output ready
 * for sale or distribution, separate from work-in-progress demo
 * units (which live in /demo). For now the route exists so the
 * sidebar link doesn't 404.
 */

import { Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";

export default function GatavaProdukcijaPage() {
  return (
    <AppShell>
      <PageHeader
        title="Gatavā produkcija"
        description="Saražotā un realizācijai gatavā produkcija"
      />
      <EmptyState
        icon={Sparkles}
        title="Drīzumā"
        description="Šeit varēsi pārvaldīt saražoto produkciju, kas gatava pārdošanai vai izsūtīšanai distributoriem. Saraksts būs pieejams nākamajā atjauninājumā."
      />
    </AppShell>
  );
}
