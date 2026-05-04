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

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Upload,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Loader2,
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
    if (direction === "incoming") return p.amount > 0;
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
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <h3 className="text-[13px] font-semibold text-red-900">
          {direction === "incoming"
            ? "Saņemti maksājumi bez rēķina"
            : "Veikti maksājumi bez rēķina"}
          <span className="ml-2 text-[11px] font-normal text-red-600">
            ({orphans.length})
          </span>
        </h3>
      </div>
      <p className="text-[11.5px] text-graphite-600 leading-relaxed">
        {direction === "incoming"
          ? "Šie maksājumi ir saņemti, bet nav atrasts atbilstošs izrakstītais rēķins. Augšupielādē rēķinu manuāli, lai sasaistītu."
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
        "rounded-lg border-2 border-red-300 bg-red-50/40 p-3",
        "flex items-center gap-3"
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

      <button
        type="button"
        onClick={() => !uploading && fileInputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5",
          "text-[11.5px] font-medium border transition-colors",
          uploading
            ? "bg-graphite-100 border-graphite-200 text-graphite-500 cursor-wait"
            : "bg-white border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400"
        )}
        title="Izvēlies rēķina PDF / attēlu"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {uploading ? "Augšupielādē…" : "Augšupielādēt manuāli"}
      </button>
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
