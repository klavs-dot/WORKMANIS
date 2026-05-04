"use client";

/**
 * FirstTimeHint — appears at the top of /rekini ONLY when the
 * user has no invoices and no payments yet. Suggests the natural
 * order to use the three robots:
 *
 *   1. Pievienot klientus / piegādātājus (so AI knows who's who)
 *   2. Spied zaļo robotu — ielasi rēķinus no Gmail (last 30 days)
 *   3. Spied zilo robotu — augšupielādē bankas izrakstu
 *      → AI auto-saskanēs rēķinus un maksājumus
 *
 * Once the user has any data, the hint disappears. Dismissible
 * via X button (saved to localStorage so it doesn't come back
 * after a refresh, even if the user later deletes everything).
 *
 * Sesija 7 of the rēķini-redesign — added because new users
 * couldn't tell which robot to click first, and clicking them
 * in the wrong order produced confusing results (e.g. clicking
 * bank-import before email-import means every transaction is
 * an orphan).
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useBilling } from "@/lib/billing-store";
import { usePayments } from "@/lib/payments-store";
import { useCompany } from "@/lib/company-context";

const DISMISSED_KEY = "workmanis.first-time-hint.dismissed";

export function FirstTimeHint() {
  const { activeCompany } = useCompany();
  const { issued, received } = useBilling();
  const { payments } = usePayments();
  const [dismissed, setDismissed] = useState(false);

  // Read dismissed state from localStorage on mount. Per company,
  // so dismissing on one structure doesn't hide the hint on a
  // newly-added one.
  useEffect(() => {
    if (!activeCompany?.id) return;
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      const dismissedSet = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
      setDismissed(dismissedSet.has(activeCompany.id));
    } catch {
      // localStorage unavailable (private mode etc) — just
      // show the hint, no harm done
      setDismissed(false);
    }
  }, [activeCompany?.id]);

  const handleDismiss = () => {
    if (!activeCompany?.id) return;
    setDismissed(true);
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      if (!arr.includes(activeCompany.id)) {
        arr.push(activeCompany.id);
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
      }
    } catch {
      // best-effort persistence
    }
  };

  if (dismissed) return null;
  if (!activeCompany?.id) return null;

  // Only render when the user is genuinely new — has no data yet.
  // Counting both invoices and payments because the user may have
  // imported one but not the other (e.g. tested email scan but
  // hasn't uploaded a bank statement).
  const hasAnyData =
    issued.length > 0 || received.length > 0 || payments.length > 0;
  if (hasAnyData) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border-2 border-graphite-200 bg-gradient-to-br from-graphite-50/50 to-white p-4"
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-graphite-900 text-white flex items-center justify-center">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-graphite-900">
              Pirmā reize? Ieteicamā secība:
            </h3>
            <ol className="mt-2 space-y-1.5 text-[12.5px] text-graphite-700 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-graphite-200 text-[10px] font-semibold text-graphite-700 mt-0.5">
                  1
                </span>
                <span>
                  <strong className="text-graphite-900">
                    Pievieno klientus un piegādātājus
                  </strong>{" "}
                  sadaļās{" "}
                  <a
                    href="/klienti"
                    className="text-graphite-900 underline underline-offset-2 hover:text-graphite-700"
                  >
                    Klienti
                  </a>{" "}
                  un{" "}
                  <a
                    href="/partneri"
                    className="text-graphite-900 underline underline-offset-2 hover:text-graphite-700"
                  >
                    Partneri
                  </a>
                  . Bez tā AI nezinās, kā automātiski klasificēt bankas
                  maksājumus.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-800 mt-0.5">
                  2
                </span>
                <span>
                  <strong className="text-graphite-900">
                    Spied zaļo robotu
                  </strong>{" "}
                  — AI izlasīs Gmail rēķinus (pēdējais mēnesis pirmajā
                  reizē, pēc tam tikai jaunie).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-800 mt-0.5">
                  3
                </span>
                <span>
                  <strong className="text-graphite-900">
                    Augšupielādē bankas izrakstu
                  </strong>{" "}
                  caur zilo robotu — automātiski salīdzinās ar rēķiniem un
                  parādīs, kas apmaksāts.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-800 mt-0.5">
                  4
                </span>
                <span>
                  <strong className="text-graphite-900">
                    Sagatavo maksājumus
                  </strong>{" "}
                  caur violeto robotu, kad jāmaksā piegādātājiem.
                </span>
              </li>
            </ol>
            <p className="mt-3 text-[11.5px] text-graphite-500 flex items-center gap-1">
              Šī palīdzība pazudīs, tiklīdz pievienosi pirmo rēķinu vai
              maksājumu.
              <ArrowRight className="h-3 w-3 text-graphite-400" />
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 text-graphite-400 hover:text-graphite-700 p-1"
            title="Vairs nerādīt šim uzņēmumam"
            aria-label="Aizvērt palīdzību"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
