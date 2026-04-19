"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Globe,
  ShoppingBag,
  Users,
  Landmark,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { IzejosieTab } from "@/components/billing/izejosie-tab";
import { IenakosieTab } from "@/components/billing/ienakosie-tab";
import { AutomatiskieTab } from "@/components/billing/automatiskie-tab";
import { VeikalaTab } from "@/components/billing/veikala-tab";
import { AlgasTab } from "@/components/billing/algas-tab";
import { NodokliTab } from "@/components/billing/nodokli-tab";
import { cn } from "@/lib/utils";

type TabKey =
  | "izejosie"
  | "ienakosie"
  | "automatiskie"
  | "veikala"
  | "algas"
  | "nodokli";

const tabs: {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { key: "izejosie", label: "Izejošie", icon: ArrowUpFromLine },
  { key: "ienakosie", label: "Ienākošie", icon: ArrowDownToLine },
  { key: "automatiskie", label: "Automātiskie & Internetā", icon: Globe },
  { key: "veikala", label: "Fiziskie maksājumi", icon: ShoppingBag },
  { key: "algas", label: "Algas & Darbinieki", icon: Users },
  { key: "nodokli", label: "Nodokļi", icon: Landmark },
];

export default function RekiniMaksajumiPage() {
  const [tab, setTab] = useState<TabKey>("izejosie");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Rēķini & Maksājumi"
          description="Visu rēķinu, maksājumu un nodokļu pārvaldība vienuviet"
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
                      layoutId="segmented-pill"
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
            {tab === "izejosie" && <IzejosieTab />}
            {tab === "ienakosie" && <IenakosieTab />}
            {tab === "automatiskie" && <AutomatiskieTab />}
            {tab === "veikala" && <VeikalaTab />}
            {tab === "algas" && <AlgasTab />}
            {tab === "nodokli" && <NodokliTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
