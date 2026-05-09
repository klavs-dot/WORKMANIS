"use client";

/**
 * OrphanPaymentsBanner — shown at the top of Ienākošie and
 * Izejošie tabs when bank reconciliation found transactions
 * that have no matching invoice on file.
 *
 * Each orphan row gets a red-bordered card with:
 *   - Direction icon + amount + counterparty + date
 *   - Bank reference (the memo/purpose line)
 *   - "Augšupielādēt manuāli" button → opens file picker
 *
 * Clicking upload sends the file to
 * /api/payments/[id]/attach-invoice which uploads to Drive and
 * flips payment_status to 'sasaistits'. Once flipped, the row
 * vanishes from this banner on the next refresh.
 *
 * The component takes a 'direction' prop ('incoming' or 'outgoing')
 * and filters the global payments list itself — keeping the parent
 * tabs unaware of orphan-specific logic.
 *
 * Sesija 4 of the rēķini-redesign.
 */

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Upload,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
  UserCheck,
  X,
} from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { usePayments, type BankPayment } from "@/lib/payments-store";
import { pushToastGlobally } from "@/lib/toast-context";
import { cn } from "@/lib/utils";

interface OrphanPaymentsBannerProps {
  /** 'incoming' shows positive-amount orphans (we received money);
   *  'outgoing' shows negative-amount orphans (we paid out) */
  direction: "incoming" | "outgoing";
}

export function OrphanPaymentsBanner({
  direction,
}: OrphanPaymentsBannerProps) {
  const { payments } = usePayments();

  const orphans = payments.filter((p) => {
    if (p.paymentStatus !== "maksajums_bez_rekina") return false;
    // Direction filter — incoming = money in (positive amount in
    // store's signed convention), outgoing = money out (negative)
    if (direction === "incoming") {
      if (p.amount <= 0) return false;

      // Sesija 7 hotfix — exclude two patterns that look like
      // 'incoming' but aren't real client payments:
      //
      //   1. CARD REFUNDS (atmaksas) — counterparty contains
      //      'karte' (Latvian for 'card') with a positive amount.
      //      These are refunds from physical/online stores after
      //      a returned purchase, NOT a client paying us.
      //      Example: 'DEPO-VEIKALS-LIEPAJA / 18/04/2026 14:21
      //               karte...658798' with amount +60.64€.
      //      User correctly identified these as confusing the tab.
      //
      //   2. BANK FEE REVERSALS — counterparty 'SEB banka',
      //      'Swedbank', 'Citadele', 'Luminor' with tiny amounts
      //      (under 5€). These are usually fee reversals or
      //      account rounding, not client payments.
      const ref = (p.bankReference || p.rawReference || "").toLowerCase();
      const cp = (p.counterparty || "").toLowerCase();

      // Card-refund detection: 'karte' or 'card' with no IBAN
      // (real client payments have IBAN; card refunds don't)
      const looksLikeCardRefund =
        (ref.includes("karte") || ref.includes(" card") || ref.includes(" pos")) &&
        !p.counterpartyIban;
      if (looksLikeCardRefund) return false;

      // Bank-fee reversal: known bank counterparty + small amount
      const knownBanks = [
        "seb banka",
        "swedbank",
        "citadele",
        "luminor",
        "rietumu",
      ];
      const isBankCounterparty = knownBanks.some((b) => cp.includes(b));
      if (isBankCounterparty && p.amount < 5) return false;

      return true;
    }
    return p.amount < 0;
  });

  if (orphans.length === 0) return null;

  // Sesija 5 — count classified vs unclassified for the header
  // hint. If many orphans are classified as 'rekins', we surface
  // it: "12 izskatās pēc rēķiniem — augšupielādē tos manuāli".
  const classified = orphans.filter((o) => o.aiCategory).length;
  const rekins = orphans.filter((o) => o.aiCategory === "rekins").length;
  const algas = orphans.filter((o) => o.aiCategory === "alga").length;
  const nodokli = orphans.filter((o) => o.aiCategory === "nodoklis").length;
  const automatiskie = orphans.filter(
    (o) => o.aiCategory === "automatiskais"
  ).length;

  const aiHints: string[] = [];
  if (rekins > 0) aiHints.push(`${rekins} rēķinu`);
  if (algas > 0) aiHints.push(`${algas} algu`);
  if (nodokli > 0) aiHints.push(`${nodokli} nodokļu`);
  if (automatiskie > 0) aiHints.push(`${automatiskie} automātisko`);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        {direction === "incoming" ? (
          <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        )}
        <h3
          className={cn(
            "text-[13px] font-semibold",
            direction === "incoming" ? "text-emerald-900" : "text-red-900"
          )}
        >
          {direction === "incoming"
            ? "Saņemtie maksājumi"
            : "Veikti maksājumi bez rēķina"}
          <span
            className={cn(
              "ml-2 text-[11px] font-normal",
              direction === "incoming" ? "text-emerald-600" : "text-red-600"
            )}
          >
            ({orphans.length})
          </span>
        </h3>
      </div>
      <p className="text-[11.5px] text-graphite-600 leading-relaxed">
        {direction === "incoming"
          ? "Klientu samaksāti maksājumi par izrakstītajiem rēķiniem. Sasaisti tos ar atbilstošo izrakstīto rēķinu vai augšupielādē, ja rēķins vēl nav sistēmā."
          : "Šie maksājumi ir veikti, bet nav atrasts atbilstošs piegādātāja rēķins. Augšupielādē rēķinu manuāli, lai sasaistītu."}
        {classified > 0 && aiHints.length > 0 && (
          <span className="block mt-1 text-graphite-500">
            AI šķiroja: {aiHints.join(", ")}.
          </span>
        )}
      </p>
      <AnimatePresence initial={false}>
        {orphans.map((orphan) => (
          <OrphanRow key={orphan.id} payment={orphan} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Single orphan row with upload affordance
// ============================================================

function OrphanRow({ payment }: { payment: BankPayment }) {
  const { activeCompany } = useCompany();
  const { refresh: refreshPayments } = usePayments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);

  const isIncoming = payment.amount > 0;
  const Icon = isIncoming ? ArrowDownToLine : ArrowUpFromLine;
  const absAmount = Math.abs(payment.amount);

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeCompany?.id) return;
    e.target.value = ""; // allow re-picking same file later

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(
        `/api/payments/${encodeURIComponent(payment.id)}/attach-invoice?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "POST", body: fd }
      );

      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody?.error || `Kļūda ${res.status}`);
      }

      pushToastGlobally(
        "success",
        `Rēķins '${file.name}' sasaistīts ar maksājumu.`,
        6000
      );
      // Refresh so the orphan row vanishes from this banner
      void refreshPayments();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Augšupielāde neizdevās";
      pushToastGlobally("error", msg, 7000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "rounded-lg border-2 p-3 flex items-center gap-3",
        // Sesija 7 hotfix — green for incoming (received money is
        // a positive event, not an error). Red still for outgoing
        // because outgoing-without-invoice IS a problem (we need
        // an invoice for accounting).
        isIncoming
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-red-300 bg-red-50/40"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
          isIncoming ? "bg-emerald-100" : "bg-violet-100"
        )}
      >
        <Icon
          className={cn(
            "h-4.5 w-4.5",
            isIncoming ? "text-emerald-700" : "text-violet-700"
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold text-graphite-900 truncate">
            {payment.counterparty || "(nav norādīts)"}
          </span>
          {/* AI classification badge — Sesija 5. Shows what
              category the AI thinks this orphan is, so user
              knows whether to upload an invoice (rekins),
              accept it as a tax/salary, or ignore. */}
          <CategoryBadge
            category={payment.aiCategory}
            confidence={payment.aiConfidence}
            reasoning={payment.aiReasoning}
            expectedSupplier={payment.aiExpectedSupplier}
          />
          <span className="text-[12.5px] font-semibold text-graphite-700 ml-auto whitespace-nowrap">
            {isIncoming ? "+" : "−"}
            {absAmount.toFixed(2)} EUR
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-graphite-500">
            {payment.paymentDate || "—"}
          </span>
          {payment.bankReference && (
            <>
              <span className="text-graphite-300">·</span>
              <span className="text-[11px] text-graphite-500 truncate">
                {payment.bankReference}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1.5 relative">
        <button
          type="button"
          onClick={() => !uploading && fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5",
            "text-[11.5px] font-medium border transition-colors",
            uploading
              ? "bg-graphite-100 border-graphite-200 text-graphite-500 cursor-wait"
              : isIncoming
                ? "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400"
                : "bg-white border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400"
          )}
          title={
            isIncoming
              ? "Augšupielādē izrakstītā rēķina PDF lai sasaistītu ar šo maksājumu"
              : "Izvēlies rēķina PDF / attēlu"
          }
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading
            ? "Augšupielādē…"
            : isIncoming
              ? "Sasaistīt ar rēķinu"
              : "Augšupielādēt rēķinu"}
        </button>

        {/* Sesija 6 — register as partner / employee. Only shown
            for outgoing payments (we don't pay clients via salaries
            or commissions in the typical case; if we did, the
            user could still use 'Augšupielādēt rēķinu' instead). */}
        {!isIncoming && (
          <button
            type="button"
            onClick={() => setClassifyOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5",
              "text-[11.5px] font-medium border transition-colors",
              "bg-white border-graphite-300 text-graphite-700",
              "hover:bg-graphite-50 hover:border-graphite-400"
            )}
            title="Reģistrē šo maksājumu kā maksājumu darbiniekam, partnerim vai aģentam"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Reģistrēt kā…
          </button>
        )}

        {classifyOpen && (
          <ClassifyPopover
            payment={payment}
            onClose={() => setClassifyOpen(false)}
          />
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// Classify popover — Sesija 6 partner/employee picker
// ============================================================

interface PartnerOption {
  id: string;
  name: string;
  kind: string;
}

interface EmployeeOption {
  id: string;
  fullName: string;
}

function ClassifyPopover({
  payment,
  onClose,
}: {
  payment: BankPayment;
  onClose: () => void;
}) {
  const { activeCompany } = useCompany();
  const { refresh: refreshPayments } = usePayments();
  const [tab, setTab] = useState<"partner" | "employee">("partner");
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("");

  // Load both lists once when popover opens. Cheap (these tabs
  // are typically small) and the user might switch between them.
  useEffect(() => {
    if (!activeCompany?.id) return;
    let cancelled = false;
    fetch(
      `/api/partners?company_id=${encodeURIComponent(activeCompany.id)}`
    )
      .then((r) => (r.ok ? r.json() : { partners: [] }))
      .then((data) => {
        if (cancelled) return;
        const items = (data.partners ?? data.items ?? []) as Array<
          Record<string, unknown>
        >;
        setPartners(
          items.map((p) => ({
            id: String(p.id ?? ""),
            name: String(p.name ?? ""),
            kind: String(p.partnerKind ?? p.partner_kind ?? "partner"),
          }))
        );
      })
      .catch(() => !cancelled && setPartners([]));
    fetch(
      `/api/employees?company_id=${encodeURIComponent(activeCompany.id)}`
    )
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((data) => {
        if (cancelled) return;
        const items = (data.employees ?? data.items ?? []) as Array<
          Record<string, unknown>
        >;
        setEmployees(
          items.map((e) => ({
            id: String(e.id ?? ""),
            fullName:
              `${e.firstName ?? e.first_name ?? ""} ${e.lastName ?? e.last_name ?? ""}`.trim() ||
              "(bez vārda)",
          }))
        );
      })
      .catch(() => !cancelled && setEmployees([]));
    return () => {
      cancelled = true;
    };
  }, [activeCompany?.id]);

  const handleSelect = async (
    kind: "partner" | "employee",
    entityId: string
  ) => {
    if (submitting || !activeCompany?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/payments/${encodeURIComponent(payment.id)}/classify-as?company_id=${encodeURIComponent(activeCompany.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, entity_id: entityId }),
        }
      );
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody?.error || `Kļūda ${res.status}`);
      }
      const data = (await res.json()) as { ok: boolean; ibanSaved: boolean };
      pushToastGlobally(
        "success",
        data.ibanSaved
          ? `Maksājums sasaistīts. IBAN saglabāts nākamajai reizei — turpmākie maksājumi sasaistīsies automātiski.`
          : `Maksājums sasaistīts.`,
        7000
      );
      void refreshPayments();
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Neizdevās";
      pushToastGlobally("error", msg, 6000);
      setSubmitting(false);
    }
  };

  const visiblePartners = (partners ?? []).filter((p) =>
    filter ? p.name.toLowerCase().includes(filter.toLowerCase()) : true
  );
  const visibleEmployees = (employees ?? []).filter((e) =>
    filter ? e.fullName.toLowerCase().includes(filter.toLowerCase()) : true
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full right-0 mt-1 w-[280px] rounded-lg border border-graphite-200 bg-white shadow-soft-lg z-20 overflow-hidden"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-graphite-100">
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => setTab("partner")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium",
              tab === "partner"
                ? "bg-graphite-900 text-white"
                : "text-graphite-600 hover:bg-graphite-50"
            )}
          >
            Partneris/aģents
          </button>
          <button
            type="button"
            onClick={() => setTab("employee")}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-medium",
              tab === "employee"
                ? "bg-graphite-900 text-white"
                : "text-graphite-600 hover:bg-graphite-50"
            )}
          >
            Darbinieks
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-graphite-400 hover:text-graphite-700"
          aria-label="Aizvērt"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        type="text"
        placeholder="Meklēt…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-2.5 py-1.5 border-b border-graphite-100 text-[12px] outline-none focus:bg-graphite-50/50"
      />

      <div className="max-h-[200px] overflow-y-auto">
        {tab === "partner" && (
          <>
            {partners === null && (
              <div className="px-2.5 py-3 text-[11px] text-graphite-500">
                Ielādē…
              </div>
            )}
            {partners !== null && visiblePartners.length === 0 && (
              <div className="px-2.5 py-3 text-[11px] text-graphite-500">
                {filter
                  ? "Neviens neatbilst"
                  : "Nav reģistrētu partneru — pievieno tos /partneri sadaļā"}
              </div>
            )}
            {visiblePartners.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={submitting}
                onClick={() => handleSelect("partner", p.id)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-graphite-50 disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span className="text-[12px] text-graphite-900 truncate">
                  {p.name}
                </span>
                {p.kind === "agent" && (
                  <span className="text-[9.5px] uppercase font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                    aģents
                  </span>
                )}
              </button>
            ))}
          </>
        )}
        {tab === "employee" && (
          <>
            {employees === null && (
              <div className="px-2.5 py-3 text-[11px] text-graphite-500">
                Ielādē…
              </div>
            )}
            {employees !== null && visibleEmployees.length === 0 && (
              <div className="px-2.5 py-3 text-[11px] text-graphite-500">
                {filter
                  ? "Neviens neatbilst"
                  : "Nav reģistrētu darbinieku"}
              </div>
            )}
            {visibleEmployees.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={submitting}
                onClick={() => handleSelect("employee", e.id)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-graphite-50 disabled:opacity-50"
              >
                <span className="text-[12px] text-graphite-900 truncate">
                  {e.fullName}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// Status pill — used inline on regular invoice cards
// ============================================================

/**
 * Small visual pill showing the bank-reconciliation status of an
 * invoice. Rendered on each invoice card next to the amount or
 * client name (positioning is up to the parent).
 *
 * Statuses:
 *   apmaksats        — green ✓
 *   gaida_apmaksu    — yellow ⏳
 *   nav_salidzinats  — gray (informational)
 *   '' or unknown    — null (don't render)
 */
export function PaymentStatusPill({
  status,
}: {
  status: string | undefined;
}) {
  if (!status) return null;

  if (status === "apmaksats") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 text-[10.5px] font-medium">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Apmaksāts
      </span>
    );
  }

  if (status === "gaida_apmaksu") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 text-[10.5px] font-medium">
        Gaida apmaksu
      </span>
    );
  }

  if (status === "nav_salidzinats") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-graphite-100 border border-graphite-200 text-graphite-600 px-1.5 py-0.5 text-[10.5px] font-medium"
        title="Nav augšupielādēts bankas izraksts par šo periodu"
      >
        Nav salīdzināts ar banku
      </span>
    );
  }

  return null;
}

// ============================================================
// AI category badge — shown on orphan rows
// ============================================================

/**
 * Small inline badge showing the AI's bucket for an orphan
 * transaction. Color-coded by category so the user can at a
 * glance see which orphans are routine (alga, nodoklis,
 * automatiskais — typically don't need invoices) vs which
 * need action ('rekins' — these need a PDF attached).
 *
 * Returns null if no classification (orphan hasn't been
 * processed yet, or this isn't an orphan).
 */
function CategoryBadge({
  category,
  confidence,
  reasoning,
  expectedSupplier,
}: {
  category: string | undefined;
  confidence: string | undefined;
  reasoning: string | undefined;
  expectedSupplier: string | undefined;
}) {
  if (!category) return null;

  const palette: Record<string, { bg: string; text: string; label: string }> = {
    alga: {
      bg: "bg-blue-50 border-blue-200",
      text: "text-blue-800",
      label: "Alga",
    },
    nodoklis: {
      bg: "bg-purple-50 border-purple-200",
      text: "text-purple-800",
      label: "Nodoklis",
    },
    rekins: {
      bg: "bg-red-100 border-red-300",
      text: "text-red-800",
      label: "Rēķins",
    },
    automatiskais: {
      bg: "bg-amber-50 border-amber-200",
      text: "text-amber-800",
      label: "Automātisks",
    },
    nezinams: {
      bg: "bg-graphite-100 border-graphite-300",
      text: "text-graphite-600",
      label: "Nezināms",
    },
  };
  const p = palette[category];
  if (!p) return null;

  // Tooltip: full AI reasoning + confidence + suggested supplier
  const tooltipParts: string[] = [];
  if (reasoning) tooltipParts.push(reasoning);
  if (confidence) tooltipParts.push(`Konfidence: ${confidence}`);
  if (expectedSupplier)
    tooltipParts.push(`Sagaidāmais piegādātājs: ${expectedSupplier}`);
  const tooltip = tooltipParts.join("\n\n");

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${p.bg} ${p.text}`}
      title={tooltip}
    >
      {p.label}
      {confidence === "low" && (
        <span className="ml-1 opacity-60">?</span>
      )}
    </span>
  );
}
