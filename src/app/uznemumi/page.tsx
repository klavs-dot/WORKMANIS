"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Check,
  Copy,
  Pencil,
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RequisitesModal } from "@/components/business/requisites-modal";
import { useCompany } from "@/lib/company-context";
import {
  formatRequisites,
  hasRequisites,
} from "@/lib/company-requisites";
import { cn } from "@/lib/utils";
import type { Company, CopyFormat } from "@/lib/types";

export default function UznemumiPage() {
  const { companies, activeCompany, setActiveCompany, updateCompany } =
    useCompany();
  const [editing, setEditing] = useState<Company | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleCopy = async (company: Company, format: CopyFormat) => {
    const text = formatRequisites(company, format);
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Nokopēts · ${company.name}`);
    } catch {
      showToast("Kopēšana neizdevās");
    }
  };

  const handleSave = (patch: Partial<Company>) => {
    if (!editing) return;
    updateCompany(editing.id, patch);
  };

  const handleSelectActive = (company: Company) => {
    setActiveCompany(company.id);
    showToast(`Aktīvais: ${company.name}`);
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="Uzņēmumi / Struktūrvienības"
          description="Ātri pārslēdzies starp uzņēmumiem un nokopē rekvizītus rēķiniem vai sarakstei"
          actions={
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Pievienot struktūrvienību
            </Button>
          }
        />

        <div className="space-y-2">
          {companies.map((c, i) => (
            <CompanyRow
              key={c.id}
              company={c}
              isActive={activeCompany?.id === c.id}
              index={i}
              onEdit={() => setEditing(c)}
              onCopy={(f) => handleCopy(c, f)}
              onSelectActive={() => handleSelectActive(c)}
            />
          ))}
        </div>
      </div>

      {/* Edit modal */}
      <RequisitesModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        company={editing}
        onSave={handleSave}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 rounded-full bg-graphite-900 text-white px-4 py-2 text-[12.5px] font-medium shadow-soft-xl"
          >
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

// ============================================================
// Horizontal row: logo + name/legal name + action buttons
// ============================================================

function CompanyRow({
  company,
  isActive,
  index,
  onEdit,
  onCopy,
  onSelectActive,
}: {
  company: Company;
  isActive: boolean;
  index: number;
  onEdit: () => void;
  onCopy: (f: CopyFormat) => void;
  onSelectActive: () => void;
}) {
  const filled = hasRequisites(company);
  const initials = company.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <Card
        className={cn(
          "p-3.5 flex items-center justify-between gap-4 transition-all",
          isActive
            ? "active-company-pulse shadow-soft-sm"
            : "hover:border-graphite-300"
        )}
      >
        {/* ============ LEFT GROUP: logo + name ============ */}
        <div className="flex items-center gap-3.5 min-w-0 flex-shrink">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={company.name}
              className="h-11 w-11 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white text-[13px] font-semibold tracking-tight shadow-soft-xs",
                isActive ? "bg-emerald-600" : "bg-graphite-700"
              )}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 max-w-[260px]">
            <p className="text-[14.5px] font-semibold text-graphite-900 truncate">
              {company.name}
            </p>
            <p className="text-[12px] text-graphite-500 truncate mt-0.5">
              {company.legalName || (
                <span className="italic text-graphite-400">
                  Juridiskais nosaukums nav norādīts
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ============ CENTER: primary action ============ */}
        {isActive ? (
          <div
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white px-5 py-2 text-[13.5px] font-semibold shadow-soft-sm shrink-0"
            aria-label="Šis uzņēmums ir izvēlēts kā aktīvs"
          >
            <Check className="h-4 w-4" strokeWidth={2.75} />
            Izvēlēts
          </div>
        ) : (
          <Button
            variant="default"
            size="default"
            onClick={onSelectActive}
            className="shrink-0"
          >
            <Check className="h-3.5 w-3.5" />
            Izvēlēties
          </Button>
        )}

        {/* ============ RIGHT GROUP: secondary actions ============ */}
        <div className="flex items-center gap-1 shrink-0">
          {!filled && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium border border-amber-100 mr-1"
              title="Rekvizīti nav pievienoti"
            >
              <AlertCircle className="h-2.5 w-2.5" />
              Rekvizīti
            </span>
          )}
          {filled && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopy("lv")}
                title="Kopēt latviešu valodā"
              >
                <Copy className="h-3.5 w-3.5" />
                LV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopy("en")}
                title="Kopēt angļu valodā"
              >
                <Copy className="h-3.5 w-3.5" />
                EN
              </Button>
            </>
          )}
          <Button
            variant={filled ? "ghost" : "secondary"}
            size="sm"
            onClick={onEdit}
          >
            {filled ? (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Labot
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Pievienot rekvizītus
              </>
            )}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
