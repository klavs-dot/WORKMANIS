"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Check,
  Copy,
  Pencil,
  AlertCircle,
  Mail,
  Phone,
  Globe,
  Landmark,
  Hash,
  Receipt,
  MapPin,
  Truck,
  FileText,
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
  const [selectedId, setSelectedId] = useState<string>(
    activeCompany?.id ?? companies[0]?.id ?? ""
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selected = companies.find((c) => c.id === selectedId) ?? null;

  const handleCopy = async (format: CopyFormat) => {
    if (!selected) return;
    const text = formatRequisites(selected, format);
    try {
      await navigator.clipboard.writeText(text);
      setToast("Nokopēts");
      setTimeout(() => setToast(null), 1800);
    } catch {
      setToast("Kopēšana neizdevās");
      setTimeout(() => setToast(null), 1800);
    }
  };

  const handleSave = (patch: Partial<Company>) => {
    if (!selected) return;
    updateCompany(selected.id, patch);
  };

  const handleUseCompany = () => {
    if (!selected) return;
    setActiveCompany(selected.id);
    setToast(`Aktīvais: ${selected.name}`);
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Uzņēmumi / Struktūrvienības"
          description="Pārvaldi visus savus uzņēmumus un struktūrvienības vienuviet"
          actions={
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Pievienot struktūrvienību
            </Button>
          }
        />

        {/* ========= SELECTOR CARDS ========= */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {companies.map((c, i) => (
            <SelectorCard
              key={c.id}
              company={c}
              selected={selectedId === c.id}
              isActive={activeCompany?.id === c.id}
              onClick={() => setSelectedId(c.id)}
              index={i}
            />
          ))}
        </div>

        {/* ========= DETAIL PANEL ========= */}
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <DetailPanel
              company={selected}
              isActive={activeCompany?.id === selected.id}
              onEdit={() => setModalOpen(true)}
              onCopy={handleCopy}
              onUseCompany={handleUseCompany}
            />
          </motion.div>
        )}
      </div>

      {/* Edit modal */}
      <RequisitesModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        company={selected}
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
// Selector card — minimal: logo/initials + name + selected ring
// ============================================================

function SelectorCard({
  company,
  selected,
  isActive,
  onClick,
  index,
}: {
  company: Company;
  selected: boolean;
  isActive: boolean;
  onClick: () => void;
  index: number;
}) {
  const initials = company.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2.5 rounded-xl border bg-white p-4 transition-all",
        "hover:border-graphite-300 hover:shadow-soft-xs",
        selected
          ? "border-graphite-900 shadow-soft-sm"
          : "border-graphite-200"
      )}
    >
      {/* Active badge */}
      {isActive && (
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[9.5px] font-semibold border border-emerald-100">
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          Aktīvs
        </span>
      )}

      {company.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={company.logoUrl}
          alt={company.name}
          className="h-12 w-12 rounded-xl object-cover"
        />
      ) : (
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl text-white text-[14px] font-semibold tracking-tight shadow-soft-xs",
            selected ? "bg-graphite-900" : "bg-graphite-700"
          )}
        >
          {initials}
        </div>
      )}

      <p
        className={cn(
          "text-center text-[12.5px] font-medium leading-tight line-clamp-2 transition-colors",
          selected ? "text-graphite-900" : "text-graphite-700"
        )}
      >
        {company.name}
      </p>

      {/* Selected indicator dot */}
      {selected && (
        <motion.span
          layoutId="selector-dot"
          className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-graphite-900"
        />
      )}
    </motion.button>
  );
}

// ============================================================
// Detail panel
// ============================================================

function DetailPanel({
  company,
  isActive,
  onEdit,
  onCopy,
  onUseCompany,
}: {
  company: Company;
  isActive: boolean;
  onEdit: () => void;
  onCopy: (f: CopyFormat) => void;
  onUseCompany: () => void;
}) {
  const filled = hasRequisites(company);
  const initials = company.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-5 md:p-6 border-b border-graphite-100 flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-graphite-900 text-white text-[14px] font-semibold shadow-soft-sm">
            {initials}
          </div>
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight text-graphite-900">
              {company.name}
            </h2>
            <p className="text-[12.5px] text-graphite-500 mt-0.5">
              {company.legalName || (
                <span className="italic">Juridiskais nosaukums nav norādīts</span>
              )}
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          {filled && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCopy("lv")}
              >
                <Copy className="h-3.5 w-3.5" />
                Kopēt latviešu valodā
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCopy("en")}
              >
                <Copy className="h-3.5 w-3.5" />
                Kopēt angļu valodā
              </Button>
            </>
          )}
          {filled ? (
            <Button size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Labot rekvizītus
            </Button>
          ) : (
            <Button size="sm" onClick={onEdit}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot rekvizītus
            </Button>
          )}
          {!isActive && (
            <Button variant="success-outline" size="sm" onClick={onUseCompany}>
              <Check className="h-3.5 w-3.5" />
              Izvēlēties aktīvo
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      {!filled ? (
        <EmptyRequisites onAdd={onEdit} />
      ) : (
        <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <RequisiteRow
            icon={FileText}
            label="Juridiskais nosaukums"
            value={company.legalName}
          />
          <RequisiteRow
            icon={Hash}
            label="Reģistrācijas numurs"
            value={company.regNumber}
            mono
          />
          <RequisiteRow
            icon={Receipt}
            label="PVN numurs"
            value={company.vatNumber}
            mono
          />
          <RequisiteRow
            icon={MapPin}
            label="Juridiskā adrese"
            value={company.legalAddress}
          />
          <RequisiteRow
            icon={Truck}
            label="Faktiskā / piegādes adrese"
            value={company.deliveryAddress}
          />
          <RequisiteRow
            icon={Mail}
            label="E-pasts saziņai"
            value={company.contactEmail}
          />
          <RequisiteRow
            icon={Mail}
            label="E-pasts rēķiniem"
            value={company.invoiceEmail}
          />
          <RequisiteRow
            icon={Phone}
            label="Telefona numurs"
            value={company.phone}
          />
          <RequisiteRow
            icon={Globe}
            label="Mājaslapa"
            value={company.website}
          />
          <RequisiteRow
            icon={Landmark}
            label="Bankas nosaukums"
            value={company.bankName}
          />
          <RequisiteRow
            icon={Landmark}
            label="IBAN"
            value={company.iban}
            mono
          />
          <RequisiteRow
            icon={Landmark}
            label="SWIFT"
            value={company.swift}
            mono
          />
        </div>
      )}
    </Card>
  );
}

function RequisiteRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value?: string;
  mono?: boolean;
}) {
  const isEmpty = !value || !value.trim();
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-400 border border-graphite-100 mt-0.5">
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 text-[13.5px] text-graphite-900 break-words",
            mono && "font-mono text-[12.5px]",
            isEmpty && "text-graphite-300 italic"
          )}
        >
          {isEmpty ? "Nav norādīts" : value}
        </p>
      </div>
    </div>
  );
}

function EmptyRequisites({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-10 text-center">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100 mb-3">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
        Rekvizīti vēl nav pievienoti
      </h3>
      <p className="mt-1.5 text-[12.5px] text-graphite-500 max-w-md mx-auto">
        Pievieno uzņēmuma rekvizītus, lai ātri kopētu tos rēķinos, līgumos un
        sarakstē latviešu vai angļu valodā.
      </p>
      <Button size="sm" className="mt-4" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Pievienot rekvizītus
      </Button>
    </div>
  );
}
