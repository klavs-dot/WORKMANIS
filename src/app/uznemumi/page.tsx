"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Check,
  Copy,
  Pencil,
  AlertCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RequisitesModal } from "@/components/business/requisites-modal";
import {
  AddCompanyModal,
  type CreatedCompany,
} from "@/components/business/add-company-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCompany } from "@/lib/company-context";
import {
  formatRequisites,
  hasRequisites,
} from "@/lib/company-requisites";
import { buildDriveFileUrl } from "@/lib/drive-files";
import { cn } from "@/lib/utils";
import type { Company, CopyFormat } from "@/lib/types";

export default function UznemumiPage() {
  const {
    companies,
    activeCompany,
    setActiveCompany,
    upsertCompany,
    deleteCompany,
  } = useCompany();
  const [editing, setEditing] = useState<Company | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteInProgress, setDeleteInProgress] = useState(false);
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

  const handleSelectActive = (company: Company) => {
    setActiveCompany(company.id);
    showToast(`Aktīvais: ${company.name}`);
  };

  /**
   * Confirm delete: user must type the company's exact name.
   * This is a destructive operation (Drive folder + master row
   * gone) so we ask for explicit confirmation rather than a
   * single-click. Native confirm() is too easy to mis-click.
   */
  const handleConfirmDelete = async () => {
    if (!deleting) return;
    if (confirmText.trim() !== deleting.name) {
      showToast("Nosaukums neatbilst — pārbaudi pareizrakstību");
      return;
    }
    setDeleteInProgress(true);
    try {
      await deleteCompany(deleting.id);
      showToast(`${deleting.name} dzēsts`);
      setDeleting(null);
      setConfirmText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Dzēšana neizdevās";
      showToast(msg);
    } finally {
      setDeleteInProgress(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="Uzņēmumi / Struktūrvienības"
          description="Ātri pārslēdzies starp uzņēmumiem un nokopē rekvizītus rēķiniem vai sarakstei"
          actions={
            <Button size="sm" onClick={() => setAddOpen(true)}>
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
              onDelete={() => {
                setDeleting(c);
                setConfirmText("");
              }}
            />
          ))}
        </div>
      </div>

      {/* Edit modal */}
      <RequisitesModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        company={editing}
      />

      {/* Add new company modal */}
      <AddCompanyModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(created: CreatedCompany) => {
          // Add to local state immediately so sidebar + list update
          upsertCompany({
            id: created.id,
            name: created.name,
            legalName: created.legalName,
            regNumber: created.regNumber,
            vatNumber: created.vatNumber ?? undefined,
            folderDriveId: created.folderId,
            sheetId: created.sheetId,
            slug: created.slug,
          });
          // Auto-activate the newly created company
          setActiveCompany(created.id);
          showToast(`Izveidots: ${created.name}`);
        }}
      />

      {/* Delete confirmation modal — destructive op gated by
          typing the company name exactly. Modal stays open during
          the API call so the user sees the spinner. */}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o && !deleteInProgress) {
            setDeleting(null);
            setConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst uzņēmumu?</DialogTitle>
            <DialogDescription>
              Šī darbība ir <strong>neatgriezeniska</strong>. Visi rēķini,
              maksājumi, klienti un dokumenti tiks pārvietoti uz Google
              Drive miskasti. Drive miskaste tiek automātiski iztīrīta
              pēc 30 dienām.
            </DialogDescription>
          </DialogHeader>

          {deleting && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-900">
                <p className="font-medium mb-1">Tiks dzēsts:</p>
                <ul className="space-y-0.5 list-disc list-inside text-red-800">
                  <li>{deleting.name} ({deleting.legalName ?? "—"})</li>
                  <li>Visi rēķini un maksājumi šajā struktūrvienībā</li>
                  <li>Drive mape ar visiem PDF un dokumentiem</li>
                  <li>Logo un rekvizīti</li>
                </ul>
              </div>

              <div>
                <label className="text-[11.5px] font-medium text-graphite-700 block mb-1.5">
                  Lai apstiprinātu, ieraksti uzņēmuma nosaukumu:{" "}
                  <span className="font-mono text-graphite-900">
                    {deleting.name}
                  </span>
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={deleteInProgress}
                  autoFocus
                  className="w-full rounded-lg border border-graphite-200 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-graphite-50 disabled:text-graphite-400"
                  placeholder={deleting.name}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleting(null);
                    setConfirmText("");
                  }}
                  disabled={deleteInProgress}
                >
                  Atcelt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  disabled={
                    deleteInProgress ||
                    confirmText.trim() !== deleting.name
                  }
                >
                  {deleteInProgress ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Dzēš…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Dzēst neatgriezeniski
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
  onDelete,
}: {
  company: Company;
  isActive: boolean;
  index: number;
  onEdit: () => void;
  onCopy: (f: CopyFormat) => void;
  onSelectActive: () => void;
  onDelete: () => void;
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
          "px-3.5 grid items-center gap-4 transition-all h-[68px]",
          "grid-cols-[1fr_auto_1fr]",
          isActive
            ? "active-company-pulse shadow-soft-sm"
            : "hover:border-graphite-300"
        )}
      >
        {/* ============ LEFT COLUMN: logo + name ============ */}
        <div className="flex items-center gap-3.5 min-w-0">
          {company.logoDriveId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={buildDriveFileUrl(
                company.logoDriveId,
                company.id,
                "view"
              )}
              alt={company.name}
              className="h-11 w-11 shrink-0 rounded-xl object-cover bg-white border border-graphite-200"
            />
          ) : company.logoUrl ? (
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
          <div className="min-w-0 min-h-[40px] flex flex-col justify-center">
            <p className="text-[14.5px] font-semibold text-graphite-900 truncate leading-tight">
              {company.name}
            </p>
            <p className="text-[12px] text-graphite-500 truncate mt-0.5 leading-tight">
              {company.legalName || (
                <span className="italic text-graphite-400">
                  Juridiskais nosaukums nav norādīts
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ============ CENTER COLUMN: primary action — fixed dimensions
              + grid 'auto' column means it lives in the dead-center of
              the row, regardless of left/right column widths ============ */}
        <div className="justify-self-center">
          {isActive ? (
            <div
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white text-[13.5px] font-semibold shadow-soft-sm h-10 w-[140px]"
              aria-label="Šis uzņēmums ir izvēlēts kā aktīvs"
            >
              <Check className="h-4 w-4" strokeWidth={2.75} />
              Izvēlēts
            </div>
          ) : (
            <button
              onClick={onSelectActive}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-graphite-900 text-white text-[13.5px] font-semibold shadow-soft-xs hover:bg-graphite-800 active:scale-[0.98] transition-all h-10 w-[140px]"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
              Izvēlēties
            </button>
          )}
        </div>

        {/* ============ RIGHT COLUMN: secondary actions ============ */}
        <div className="flex items-center gap-1 justify-self-end">
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title={`Dzēst ${company.name}`}
            className="text-graphite-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
