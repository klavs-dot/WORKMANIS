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
  Upload,
  Download,
  LayoutGrid,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { VisiMaksajumiTab } from "@/components/billing/visi-maksajumi-tab";
import { IzejosieTab } from "@/components/billing/izejosie-tab";
import { IenakosieTab } from "@/components/billing/ienakosie-tab";
import { AutomatiskieTab } from "@/components/billing/automatiskie-tab";
import { VeikalaTab } from "@/components/billing/veikala-tab";
import { AlgasTab } from "@/components/billing/algas-tab";
import { NodokliTab } from "@/components/billing/nodokli-tab";
import { BankExchangePanel } from "@/components/billing/bank-exchange-panel";
import { useNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

type TabKey =
  | "visi"
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
  { key: "visi", label: "Visi maksājumi", icon: LayoutGrid },
  { key: "izejosie", label: "Izejošie", icon: ArrowUpFromLine },
  { key: "ienakosie", label: "Ienākošie", icon: ArrowDownToLine },
  { key: "automatiskie", label: "Automātiskie & Internetā", icon: Globe },
  { key: "veikala", label: "Fiziskie maksājumi", icon: ShoppingBag },
  { key: "algas", label: "Algas", icon: Users },
  { key: "nodokli", label: "Nodokļi", icon: Landmark },
];

export default function RekiniMaksajumiPage() {
  const [tab, setTab] = useState<TabKey>("visi");
  const notifications = useNotifications();

  // Bank exchange panel — single source of truth at page level so the
  // 'Uz banku' / 'No bankas' header buttons can open it from anywhere
  // on the page without prop-drilling through tabs. The panel itself
  // already supports both export (download XML) and import (upload
  // CSV) flows, so a single open boolean is enough — user picks the
  // action they want once the panel is open.
  const [bankPanelOpen, setBankPanelOpen] = useState(false);

  // Map tab key → red dot count (exclude ienakosie per spec)
  const tabBadge = (key: TabKey): number => {
    switch (key) {
      case "izejosie":
        return notifications.rekiniBreakdown.izejosie;
      case "automatiskie":
        return notifications.rekiniBreakdown.automatiskie;
      case "veikala":
        return notifications.rekiniBreakdown.veikala;
      case "algas":
        return notifications.rekiniBreakdown.algas;
      case "nodokli":
        return notifications.rekiniBreakdown.nodokli;
      default:
        return 0;
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Rēķini & Maksājumi"
          description="Visu rēķinu, maksājumu un nodokļu pārvaldība vienuviet"
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="default"
                variant="secondary"
                onClick={() => setBankPanelOpen(true)}
              >
                <Download className="h-4 w-4" />
                No bankas
              </Button>
              <Button
                size="default"
                onClick={() => setBankPanelOpen(true)}
              >
                <Upload className="h-4 w-4" />
                Uz banku
              </Button>
            </div>
          }
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
              const count = tabBadge(t.key);
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
                    {count > 0 && (
                      <span
                        className={cn(
                          "flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9.5px] font-semibold tabular",
                          isActive
                            ? "bg-red-600 text-white"
                            : "bg-red-50 text-red-600 border border-red-100"
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
            {tab === "visi" && <VisiMaksajumiTab />}
            {tab === "izejosie" && <IzejosieTab />}
            {tab === "ienakosie" && <IenakosieTab />}
            {tab === "automatiskie" && <AutomatiskieTab />}
            {tab === "veikala" && <VeikalaTab />}
            {tab === "algas" && <AlgasTab />}
            {tab === "nodokli" && <NodokliTab />}
          </motion.div>
        </AnimatePresence>

        {/* Bank exchange panel — opened by the page header buttons.
            Mode is 'received' (incoming invoices). The Algas and
            Nodokļi tabs still have their own context-specific Uz
            banku buttons (which open the panel in 'salaries' /
            'taxes' mode for those particular flows). */}
        <BankExchangePanel
          open={bankPanelOpen}
          onOpenChange={setBankPanelOpen}
          mode="received"
        />
      </div>
    </AppShell>
  );
}
