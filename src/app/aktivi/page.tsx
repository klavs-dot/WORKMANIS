"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Car, Package } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { AssetTab } from "@/components/assets/asset-tab";
import { useAssets } from "@/lib/assets-store";
import { cn } from "@/lib/utils";

type TabKey = "domeni" | "automasinas" | "citi";

const tabs: {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  emptyTitle: string;
  emptyDescription: string;
}[] = [
  {
    key: "domeni",
    label: "Domēni",
    icon: Globe,
    emptyTitle: "Nav pievienotu domēnu",
    emptyDescription:
      "Pievienojiet savus domēnus, lai sekotu līdzi to atjaunošanai un statusam.",
  },
  {
    key: "automasinas",
    label: "Automašīnas",
    icon: Car,
    emptyTitle: "Nav pievienotu automašīnu",
    emptyDescription:
      "Pievienojiet uzņēmuma transportlīdzekļus, lai uzturētu to pārskatu.",
  },
  {
    key: "citi",
    label: "Citi",
    icon: Package,
    emptyTitle: "Nav pievienotu aktīvu",
    emptyDescription:
      "Pievienojiet iekārtas, tehniku un citus uzņēmuma īpašumus.",
  },
];

export default function AktiviPage() {
  const [tab, setTab] = useState<TabKey>("domeni");
  const { getByCategory } = useAssets();

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Aktīvi"
          description="Uzņēmuma īpašumu un resursu uzskaite — domēni, transportlīdzekļi un tehnika"
        />

        {/* Segmented control */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div
            role="tablist"
            className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              const count = getByCategory(t.key).length;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-graphite-900/10 whitespace-nowrap",
                    isActive
                      ? "text-graphite-900"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="aktivi-segmented-pill"
                      className="absolute inset-0 rounded-lg bg-white shadow-soft-xs border border-graphite-200/40"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {t.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular",
                          isActive
                            ? "bg-graphite-900 text-white"
                            : "bg-graphite-200/70 text-graphite-600"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {tabs
              .filter((t) => t.key === tab)
              .map((t) => (
                <AssetTab
                  key={t.key}
                  category={t.key}
                  icon={t.icon as any}
                  emptyTitle={t.emptyTitle}
                  emptyDescription={t.emptyDescription}
                />
              ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
