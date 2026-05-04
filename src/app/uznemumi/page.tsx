"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@/components/business/add-company-modal";
import { GmailStatusChip } from "@/components/business/gmail-status-chip";
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

/**
 * Top-level export wraps the real page in Suspense so
 * useSearchParams() doesn't break static prerender.
 *
 * Next.js requires that any client component using
 * useSearchParams be inside a Suspense boundary at the page
 * level, otherwise the whole route bails out of static
 * rendering with a build-time error.
 *
 * Our pattern: the inner component does all the work; the
 * outer just provides the Suspense wrapper. Loading fallback
 * is invisible because companies + active state load fast.
 */
export default function UznemumiPage() {
  return (
    <Suspense fallback={null}>
      <UznemumiPageInner />
    </Suspense>
  );
}

function UznemumiPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    companies,
    activeCompany,
    setActiveCompany,
    deleteCompany,
    refresh,
  } = useCompany();
  const [editing, setEditing] = useState<Company | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [confirmText, setConfirmText] = useState("");
  /**
   * Drive disposition for the delete operation:
   *   'keep' (default)    → unregister from WORKMANIS only, leave
   *                         Drive folder intact (safer default —
   *                         user must explicitly opt in to data
   *                         loss)
   *   'trash'             → move folder + all contents to Drive Trash
   */
  const [driveAction, setDriveAction] = useState<"trash" | "keep">("keep");
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  /**
   * Pick up OAuth callback results from query params.
   *
   * After the user completes the per-company OAuth flow, the
   * server-side callback redirects to /uznemumi with one of:
   *
   *   ?created=COMPANY_ID&gmail=ADDRESS  → success
   *   ?oauth_error=MESSAGE               → user cancelled or
   *                                         server-side error
   *
   * We need to:
   *   - Show a toast (success or error)
   *   - Refresh the companies list (the new company isn't in
   *     local state yet — provisioning happened server-side
   *     during the OAuth round-trip)
   *   - Set the new company as active
   *   - Strip the params from the URL so a refresh doesn't
   *     re-trigger the toast
   *
   * Using router.replace (not router.push) prevents adding the
   * cleaned URL to history — back button stays useful.
   */
  // Bumped after OAuth callbacks (created or reconnected) so the
  // GmailStatusChip components refetch their status. Without this
  // they'd keep showing 'not connected' even after the user just
  // completed the OAuth flow.
  const [oauthRefreshKey, setOauthRefreshKey] = useState(0);

  useEffect(() => {
    const created = searchParams.get("created");
    const reconnected = searchParams.get("reconnected");
    const gmail = searchParams.get("gmail");
    const oauthError = searchParams.get("oauth_error");

    if (oauthError) {
      // Decode in case the server URL-encoded special chars
      const message = decodeURIComponent(oauthError);
      showToast(`OAuth kļūda: ${message}`);
      router.replace("/uznemumi");
      return;
    }

    if (created) {
      const gmailNote = gmail ? ` · ${decodeURIComponent(gmail)}` : "";
      showToast(`Uzņēmums izveidots${gmailNote}`);
      void refresh().then(() => {
        setActiveCompany(created);
      });
      setOauthRefreshKey((k) => k + 1);
      router.replace("/uznemumi");
    } else if (reconnected) {
      const gmailNote = gmail ? ` · ${decodeURIComponent(gmail)}` : "";
      showToast(`Gmail savienojums atjaunots${gmailNote}`);
      setOauthRefreshKey((k) => k + 1);
      router.replace("/uznemumi");
    }
    // Intentionally only run on mount + when searchParams change.
    // refresh / setActiveCompany are stable from useCompany().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
      await deleteCompany(deleting.id, {
        keepDrive: driveAction === "keep",
      });
      showToast(
        driveAction === "keep"
          ? `${deleting.name} dzēsts no WORKMANIS · Drive saglabāts`
          : `${deleting.name} dzēsts · Drive miskastē`
      );
      setDeleting(null);
      setConfirmText("");
      setDriveAction("keep"); // reset to safer default for next time
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
              oauthRefreshKey={oauthRefreshKey}
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

      {/* Add new company modal — submission redirects to Google
          OAuth via window.location.href, so onCreated is never
          called in the new flow. The useEffect above handles the
          post-OAuth callback when Google redirects back to
          /uznemumi?created=ID. We keep the prop for type
          compatibility but it's effectively dead code. */}
      <AddCompanyModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          // No-op: handled by useEffect on ?created= param
        }}
      />

      {/* Delete confirmation modal — destructive op gated by
          typing the company name exactly. Modal stays open during
          the API call so the user sees the spinner. Two-mode
          delete: trash everything, or keep Drive intact. */}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o && !deleteInProgress) {
            setDeleting(null);
            setConfirmText("");
            setDriveAction("keep");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst uzņēmumu?</DialogTitle>
            <DialogDescription>
              Izvēlies, ko darīt ar Drive datiem. Reģistra ieraksts no
              WORKMANIS tiks dzēsts abos gadījumos.
            </DialogDescription>
          </DialogHeader>

          {deleting && (
            <div className="space-y-4 pt-2">
              {/* Drive disposition choice */}
              <div className="space-y-2">
                <label className="text-[11.5px] font-medium text-graphite-700 block">
                  Drive datu apstrāde
                </label>

                <button
                  type="button"
                  onClick={() => setDriveAction("trash")}
                  disabled={deleteInProgress}
                  className={cn(
                    "w-full text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-50",
                    driveAction === "trash"
                      ? "border-red-300 bg-red-50"
                      : "border-graphite-200 bg-white hover:border-graphite-300"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                        driveAction === "trash"
                          ? "border-red-500 bg-red-500"
                          : "border-graphite-300 bg-white"
                      )}
                    >
                      {driveAction === "trash" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-graphite-900">
                        Dzēst arī Drive datus
                      </p>
                      <p className="text-[11.5px] text-graphite-500 mt-0.5 leading-snug">
                        Mape ar visu saturu pārvietota uz Drive miskasti.
                        Pieejama atjaunošanai 30 dienas no drive.google.com.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDriveAction("keep")}
                  disabled={deleteInProgress}
                  className={cn(
                    "w-full text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-50",
                    driveAction === "keep"
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-graphite-200 bg-white hover:border-graphite-300"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                        driveAction === "keep"
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-graphite-300 bg-white"
                      )}
                    >
                      {driveAction === "keep" && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-graphite-900">
                        Saglabāt Drive datus
                      </p>
                      <p className="text-[11.5px] text-graphite-500 mt-0.5 leading-snug">
                        Tikai noņem no WORKMANIS reģistra. Mape, rēķini
                        un dokumenti paliek tava Drive neskarti.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Affected items summary — content depends on choice */}
              {driveAction === "trash" ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-900">
                  <p className="font-medium mb-1">Tiks dzēsts:</p>
                  <ul className="space-y-0.5 list-disc list-inside text-red-800">
                    <li>{deleting.name} ({deleting.legalName ?? "—"})</li>
                    <li>Visi rēķini un maksājumi šajā struktūrvienībā</li>
                    <li>Drive mape ar visiem PDF un dokumentiem</li>
                    <li>Logo un rekvizīti</li>
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] text-emerald-900">
                  <p className="font-medium mb-1">Tiks saglabāts:</p>
                  <ul className="space-y-0.5 list-disc list-inside text-emerald-800">
                    <li>Drive mape un visi PDF dokumenti</li>
                    <li>Bankas izraksti un logo</li>
                    <li>Rēķinu kopijas (atrodamas tava Drive)</li>
                  </ul>
                  <p className="mt-1.5 text-[11.5px] text-emerald-700">
                    Reģistra ieraksts no WORKMANIS tiks dzēsts —
                    uzņēmums vairs neparādīsies sarakstā.
                  </p>
                </div>
              )}

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
                    setDriveAction("keep");
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
                      {driveAction === "keep"
                        ? "Dzēst no WORKMANIS"
                        : "Dzēst neatgriezeniski"}
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
  oauthRefreshKey,
  onEdit,
  onCopy,
  onSelectActive,
  onDelete,
}: {
  company: Company;
  isActive: boolean;
  index: number;
  oauthRefreshKey: number;
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
          {/* Gmail connection status — leftmost in the row's right
              cluster so it's seen before the user starts looking at
              copy/edit affordances. Shows green chip with the
              connected address, or amber/gray button to start the
              reconnect / connect OAuth flow. */}
          <GmailStatusChip
            companyId={company.id}
            refreshKey={oauthRefreshKey}
          />
          <span className="w-1.5" />
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
