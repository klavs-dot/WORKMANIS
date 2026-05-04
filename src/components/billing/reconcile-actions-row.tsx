"use client";

/**
 * ReconcileActionsRow — secondary action strip on the Rēķini page
 * with two utility buttons:
 *
 *   1. "Atkārtot salīdzināšanu" — re-runs the reconciliation
 *      pipeline against existing data. Use case: user uploaded
 *      a bank statement, then later added a missing invoice
 *      that the original reconciliation couldn't find. This
 *      button reprocesses without requiring a re-upload.
 *
 *   2. "AI klasificēt orphan'us" — runs the orphan classifier
 *      over all unmatched bank transactions, bucketing each
 *      into alga / nodoklis / rēķins / automatiskais / nezināms.
 *      The user then sees colored badges on each orphan row
 *      so they know which ones need action.
 *
 * Both buttons show a spinner while running and a result toast
 * when done. Both invalidate the relevant stores so UI updates
 * immediately.
 *
 * Sesija 5 of the rēķini-redesign.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { useBilling } from "@/lib/billing-store";
import { usePayments } from "@/lib/payments-store";
import { pushToastGlobally } from "@/lib/toast-context";
import { cn } from "@/lib/utils";

export function ReconcileActionsRow() {
  const { activeCompany } = useCompany();
  const { refresh: refreshBilling } = useBilling();
  const { refresh: refreshPayments } = usePayments();

  const [reconciling, setReconciling] = useState(false);
  const [classifying, setClassifying] = useState(false);

  const handleReconcile = async () => {
    if (!activeCompany?.id || reconciling) return;
    setReconciling(true);
    try {
      const res = await fetch(
        `/api/reconcile/run?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err?.error || `Kļūda ${res.status}`);
      }
      const data = (await res.json()) as {
        ok: true;
        reconciled: {
          matched: number;
          waiting: number;
          notReconciled: number;
          orphansIncoming: number;
          orphansOutgoing: number;
        };
        latestStatementDate?: string;
        hadNoStatements: boolean;
      };

      console.group("[reconcile/run] result");
      console.log("Reconciled:", data.reconciled);
      console.log("Latest statement:", data.latestStatementDate);
      console.groupEnd();

      const orphanTotal =
        data.reconciled.orphansIncoming + data.reconciled.orphansOutgoing;

      if (data.hadNoStatements) {
        pushToastGlobally(
          "info",
          "Nav augšupielādēts bankas izraksts. Vispirms ielasi izrakstu (zilais robots).",
          7000
        );
      } else {
        const parts: string[] = [];
        parts.push(`${data.reconciled.matched} apmaksāti`);
        if (data.reconciled.waiting > 0)
          parts.push(`${data.reconciled.waiting} gaida`);
        if (orphanTotal > 0) parts.push(`${orphanTotal} bez rēķina`);
        pushToastGlobally(
          "success",
          `Salīdzināšana pabeigta: ${parts.join(", ")}.`,
          7000
        );
      }

      void refreshBilling();
      void refreshPayments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kļūda";
      pushToastGlobally("error", msg, 7000);
    } finally {
      setReconciling(false);
    }
  };

  const handleClassify = async () => {
    if (!activeCompany?.id || classifying) return;
    setClassifying(true);
    try {
      const res = await fetch(
        `/api/orphans/classify?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err?.error || `Kļūda ${res.status}`);
      }
      const data = (await res.json()) as {
        ok: true;
        classifiedCount: number;
        failedCount?: number;
        breakdown?: Record<string, number>;
        message?: string;
      };

      console.group("[orphans/classify] result");
      console.log("Classified:", data.classifiedCount);
      console.log("Breakdown:", data.breakdown);
      console.groupEnd();

      if (data.classifiedCount === 0) {
        pushToastGlobally(
          "info",
          data.message || "Nav orphan'u, ko klasificēt.",
          5000
        );
      } else {
        const b = data.breakdown ?? {};
        const parts: string[] = [];
        if (b.rekins) parts.push(`${b.rekins} rēķini`);
        if (b.alga) parts.push(`${b.alga} algas`);
        if (b.nodoklis) parts.push(`${b.nodoklis} nodokļi`);
        if (b.automatiskais) parts.push(`${b.automatiskais} automātiski`);
        if (b.nezinams) parts.push(`${b.nezinams} nezināmi`);
        pushToastGlobally(
          "success",
          `AI klasificēja ${data.classifiedCount}: ${parts.join(", ")}.`,
          7000
        );
      }

      void refreshPayments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kļūda";
      pushToastGlobally("error", msg, 7000);
    } finally {
      setClassifying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-2 flex-wrap"
    >
      <button
        type="button"
        onClick={handleReconcile}
        disabled={reconciling}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border transition-colors",
          "text-[12px] font-medium",
          reconciling
            ? "bg-graphite-100 border-graphite-200 text-graphite-500 cursor-wait"
            : "bg-white border-graphite-300 text-graphite-700 hover:bg-graphite-50 hover:border-graphite-400"
        )}
        title="Atkārto rēķinu un bankas darījumu salīdzināšanu, neaugšupielādējot jaunu izrakstu"
      >
        {reconciling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {reconciling ? "Salīdzina…" : "Atkārtot salīdzināšanu"}
      </button>

      <button
        type="button"
        onClick={handleClassify}
        disabled={classifying}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border transition-colors",
          "text-[12px] font-medium",
          classifying
            ? "bg-graphite-100 border-graphite-200 text-graphite-500 cursor-wait"
            : "bg-white border-graphite-300 text-graphite-700 hover:bg-graphite-50 hover:border-graphite-400"
        )}
        title="AI iešķiro nesasaistītos maksājumus pa kategorijām (alga, nodoklis, rēķins, automātiskais)"
      >
        {classifying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {classifying ? "AI klasificē…" : "AI klasificēt orphan'us"}
      </button>
    </motion.div>
  );
}
