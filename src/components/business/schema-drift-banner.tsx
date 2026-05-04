"use client";

/**
 * SchemaDriftBanner — shows a yellow warning bar at the top of
 * pages when the active company's Sheet tabs are missing columns
 * that newer code expects.
 *
 * Without this, users had to manually navigate to /iestatijumi
 * and find the "Salabot tabulas" button — most never did, and
 * Sesija 3+ features (payment_status pills, partner_id linking,
 * AI auto-classify) silently failed because the columns simply
 * didn't exist on their Sheets.
 *
 * Behavior:
 *   - On mount, calls /api/companies/schema-check
 *   - If everything is in sync → renders nothing
 *   - If drift detected → renders a yellow banner with summary +
 *     a "Salabot tagad" button
 *   - Button calls /api/companies/repair, then re-runs schema-check
 *     to confirm fixed
 *   - After successful repair, banner fades out
 *
 * Sesija 7 of the rēķini-redesign.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, X, CheckCircle2 } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { pushToastGlobally } from "@/lib/toast-context";
import { cn } from "@/lib/utils";

interface SchemaCheckResult {
  ok: boolean;
  missingTabs: string[];
  driftingTabs: Array<{ tab: string; missingColumns: string[] }>;
}

type State =
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "drift"; result: SchemaCheckResult }
  | { kind: "repairing" }
  | { kind: "fixed" }
  | { kind: "error"; message: string }
  | { kind: "dismissed" };

export function SchemaDriftBanner() {
  const { activeCompany } = useCompany();
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    if (!activeCompany?.id) return;
    let cancelled = false;
    setState({ kind: "checking" });

    fetch(
      `/api/companies/schema-check?company_id=${encodeURIComponent(activeCompany.id)}`,
      { cache: "no-store" }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SchemaCheckResult) => {
        if (cancelled) return;
        if (data.ok) {
          setState({ kind: "ok" });
        } else {
          setState({ kind: "drift", result: data });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Non-fatal — show nothing rather than scaring the user
        // with a banner about a check that itself failed.
        console.warn("[schema-drift] check failed:", err);
        setState({ kind: "ok" });
      });

    return () => {
      cancelled = true;
    };
  }, [activeCompany?.id]);

  const runRepair = async () => {
    if (!activeCompany?.id) return;
    setState({ kind: "repairing" });
    try {
      const res = await fetch(
        `/api/companies/repair?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody?.error || `Kļūda ${res.status}`);
      }
      pushToastGlobally(
        "success",
        "Tabulas atjauninātas. Atsvaidzini lapu (F5), lai redzētu jaunās funkcijas.",
        9000
      );
      setState({ kind: "fixed" });
      // Auto-fade banner after 3s so the page doesn't keep the
      // green chip taking up space forever.
      setTimeout(() => setState({ kind: "dismissed" }), 3000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Atjaunināšana neizdevās";
      pushToastGlobally("error", msg, 9000);
      setState({ kind: "error", message: msg });
    }
  };

  // Render nothing in these states
  if (
    state.kind === "checking" ||
    state.kind === "ok" ||
    state.kind === "dismissed"
  ) {
    return null;
  }

  const totalMissing =
    state.kind === "drift"
      ? state.result.missingTabs.length +
        state.result.driftingTabs.reduce(
          (n, t) => n + t.missingColumns.length,
          0
        )
      : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "rounded-lg border-2 p-3 mb-4 flex items-center gap-3",
          state.kind === "fixed"
            ? "border-emerald-300 bg-emerald-50/40"
            : state.kind === "error"
              ? "border-red-300 bg-red-50/40"
              : "border-amber-300 bg-amber-50/40"
        )}
      >
        <div
          className={cn(
            "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
            state.kind === "fixed"
              ? "bg-emerald-100 text-emerald-700"
              : state.kind === "error"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
          )}
        >
          {state.kind === "fixed" ? (
            <CheckCircle2 className="h-4.5 w-4.5" />
          ) : state.kind === "repairing" ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          ) : (
            <AlertTriangle className="h-4.5 w-4.5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {state.kind === "drift" && (
            <>
              <h4 className="text-[13px] font-semibold text-amber-900">
                Tabulas atpaliek no jaunākās versijas
              </h4>
              <p className="text-[11.5px] text-graphite-600 mt-0.5 leading-relaxed">
                Trūkst {totalMissing}{" "}
                {totalMissing === 1 ? "kolonna" : "kolonnas"} no jaunākajām
                funkcijām (bankas salīdzināšana, partneru sasaiste, AI
                klasifikācija). Bez šī atjauninājuma jaunās funkcijas klusi
                nestrādās.
              </p>
            </>
          )}
          {state.kind === "repairing" && (
            <>
              <h4 className="text-[13px] font-semibold text-graphite-900">
                Atjaunoju tabulas…
              </h4>
              <p className="text-[11.5px] text-graphite-600 mt-0.5">
                Pievienoju trūkstošās kolonnas. Tas aizņem ~30 sekundes.
              </p>
            </>
          )}
          {state.kind === "fixed" && (
            <>
              <h4 className="text-[13px] font-semibold text-emerald-900">
                Tabulas atjauninātas
              </h4>
              <p className="text-[11.5px] text-graphite-600 mt-0.5">
                Atsvaidzini lapu (F5), lai redzētu jaunās funkcijas.
              </p>
            </>
          )}
          {state.kind === "error" && (
            <>
              <h4 className="text-[13px] font-semibold text-red-900">
                Atjaunināšana neizdevās
              </h4>
              <p className="text-[11.5px] text-graphite-600 mt-0.5">
                {state.message}
              </p>
            </>
          )}
        </div>

        {state.kind === "drift" && (
          <button
            type="button"
            onClick={runRepair}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98] transition-all"
          >
            Salabot tagad
          </button>
        )}
        {state.kind === "error" && (
          <button
            type="button"
            onClick={runRepair}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Mēģināt vēlreiz
          </button>
        )}
        {(state.kind === "drift" || state.kind === "error") && (
          <button
            type="button"
            onClick={() => setState({ kind: "dismissed" })}
            className="shrink-0 text-graphite-400 hover:text-graphite-700 p-1"
            title="Aizvērt — nepatiks"
            aria-label="Aizvērt brīdinājumu"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
