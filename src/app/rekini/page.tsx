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
  LayoutGrid,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { SchemaDriftBanner } from "@/components/business/schema-drift-banner";
import { VisiMaksajumiTab } from "@/components/billing/visi-maksajumi-tab";
import { IzejosieTab } from "@/components/billing/izejosie-tab";
import { IenakosieTab } from "@/components/billing/ienakosie-tab";
import { AutomatiskieTab } from "@/components/billing/automatiskie-tab";
import { VeikalaTab } from "@/components/billing/veikala-tab";
import { AlgasTab } from "@/components/billing/algas-tab";
import { NodokliTab } from "@/components/billing/nodokli-tab";
import { BankExchangePanel } from "@/components/billing/bank-exchange-panel";
import { EmailImportRobotButton } from "@/components/billing/email-import-robot-button";
import { BankImportRobotButton } from "@/components/billing/bank-import-robot-button";
import { BankExportRobotButton } from "@/components/billing/bank-export-robot-button";
import { FirstTimeHint } from "@/components/billing/first-time-hint";
import { ReconcileActionsRow } from "@/components/billing/reconcile-actions-row";
import { useBilling } from "@/lib/billing-store";
import { usePayments } from "@/lib/payments-store";
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
  // Refresh hooks for the email-import button — when the scan
  // finishes we need to re-fetch invoices + payments so the new
  // rows show up without a manual page reload.
  const { refresh: refreshBilling } = useBilling();
  const { refresh: refreshPayments } = usePayments();

  const handleEmailImportComplete = () => {
    void refreshBilling();
    void refreshPayments();
  };

  // Bank exchange panel — separate state for each header button so
  // 'Uz banku' opens just the export view and 'No bankas' opens just
  // the import view. We keep ONE panel mount and toggle the section
  // prop based on which button was clicked.
  const [bankPanel, setBankPanel] = useState<{
    open: boolean;
    section: "export" | "import";
  }>({ open: false, section: "export" });

  const openBankExport = () =>
    setBankPanel({ open: true, section: "export" });
  // openBankImport intentionally removed in Sesija 3 — the bank
  // import flow is now the BankImportRobotButton's auto-reconcile
  // pipeline, not the side-panel import. The side panel still
  // exists for the export use case.
  const closeBankPanel = () =>
    setBankPanel((s) => ({ ...s, open: false }));

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
        <SchemaDriftBanner />
        <PageHeader
          title="Rēķini & Maksājumi"
          description="Visu rēķinu, maksājumu un nodokļu pārvaldība vienuviet"
        />

        {/* Three robot mascots — the primary actions for this page.
            Each handles one direction of data flow:
              1. Email-import (green)  — pull invoices FROM Gmail
              2. Bank-import (blue)    — pull bank data FROM bank
              3. Bank-export (violet)  — push payments TO bank

            Color-coding is the fastest visual cue. The robots
            sit in their own row beneath the page header, with a
            short shared description below. The previous design
            had two compact buttons in the header + one big
            robot below — visually inconsistent. Three robots
            unifies the affordance and signals "these are the
            actions that pull the rest of the page to life". */}
        <div className="space-y-3">
          <FirstTimeHint />
          <div className="flex items-start gap-3 flex-wrap">
            <EmailImportRobotButton onComplete={handleEmailImportComplete} />
            <BankImportRobotButton />
            <BankExportRobotButton onClick={openBankExport} />
          </div>
          <p className="text-[12.5px] text-graphite-600 leading-relaxed max-w-2xl">
            <strong className="text-graphite-900">Trīs roboti</strong> dara
            visu smago darbu: zaļais lasa rēķinus tavā Gmail, zilais ielasa
            bankas izrakstu un salīdzina ar rēķiniem, violetais sagatavo
            maksājumu pakotni augšupielādei bankā.
          </p>
          {/* Sesija 5 — secondary actions for re-running
              reconciliation and AI-classifying orphan transactions
              after the user has manually filled gaps in the data. */}
          <ReconcileActionsRow />
        </div>

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
            Mode is 'received' (incoming invoices). Section toggles
            between 'export' and 'import' depending on which header
            button was clicked, so each button shows just its own
            view. The Algas and Nodokļi tabs still have their own
            context-specific Uz banku buttons (which open the panel
            in 'salaries' / 'taxes' mode for those particular flows). */}
        <BankExchangePanel
          open={bankPanel.open}
          onOpenChange={(o) => (o ? null : closeBankPanel())}
          mode="received"
          section={bankPanel.section}
        />
      </div>
    </AppShell>
  );
}
