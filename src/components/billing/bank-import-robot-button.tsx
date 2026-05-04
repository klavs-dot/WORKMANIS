"use client";

/**
 * BankImportRobotButton — sky-blue robot mascot card. Clicking
 * opens a hidden file picker; the user picks a bank statement
 * (FIDAVISTA XML / camt.053 / CSV) and the robot:
 *
 *   1. POSTs the file to /api/bank-statement/import
 *   2. Server parses, persists transactions to 35_payments,
 *      writes a row to 39_bank_statements, runs the reconciler
 *      to assign payment_status to every invoice
 *   3. Returns counts; we show a toast with what was matched
 *
 * No side panel anymore — the whole flow is one click + one
 * file picker dialog. Sesija 3 of the rēķini-redesign.
 *
 * Personality: data-pulling collector. Eyes scan left-to-right
 * like a barcode reader, body has a subtle pulled-forward lean,
 * arms reach forward.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCompany } from "@/lib/company-context";
import { useBilling } from "@/lib/billing-store";
import { usePayments } from "@/lib/payments-store";
import { pushToastGlobally } from "@/lib/toast-context";
import { RobotCard } from "./robot-card";

interface BankImportRobotButtonProps {
  /**
   * Optional: when set, clicking the robot opens this callback
   * instead of going straight to the file picker. Used when the
   * caller wants the legacy bank-exchange-panel side drawer.
   * Without it, default flow is auto-reconcile.
   */
  onClick?: () => void;
}

const PROCESSING_MESSAGES = [
  "📥 Lasu bankas izrakstu…",
  "🔍 Atpazīstu darījumus…",
  "💾 Saglabāju Sheets…",
  "🤝 Salīdzinu ar rēķiniem…",
  "✨ Gandrīz gatavs…",
];

export function BankImportRobotButton({
  onClick,
}: BankImportRobotButtonProps) {
  const { activeCompany } = useCompany();
  const { refresh: refreshBilling } = useBilling();
  const { refresh: refreshPayments } = usePayments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle messages every 2s while processing
  useEffect(() => {
    if (!busy) {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % PROCESSING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [busy]);

  const handleClick = () => {
    if (!activeCompany?.id) {
      pushToastGlobally(
        "error",
        "Vispirms izvēlies struktūrvienību sānjoslā",
        4000
      );
      return;
    }
    if (onClick) {
      onClick();
      return;
    }
    // Default: open the file picker
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCompany?.id) return;

    // Reset the input so the same file can be picked again later
    e.target.value = "";

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(
        `/api/bank-statement/import?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "POST", body: fd }
      );

      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody?.error || `Kļūda ${res.status}`);
      }

      const data = (await res.json()) as {
        ok: true;
        parsed: {
          transactionCount: number;
          format: string;
          period: { from: string; to: string };
        };
        reconciled: {
          matched: number;
          waiting: number;
          notReconciled: number;
          orphansIncoming: number;
          orphansOutgoing: number;
          autoClassified?: number;
        };
      };

      console.group("[bank-import] result");
      console.log("Parsed:", data.parsed);
      console.log("Reconciled:", data.reconciled);
      console.groupEnd();

      const { matched, orphansIncoming, orphansOutgoing, autoClassified } =
        data.reconciled;
      const auto = autoClassified ?? 0;
      // Sesija 5: 'orphansIncoming/Outgoing' from the server
      // count ALL orphans BEFORE auto-classification — including
      // ones that got auto-classified. The actual remaining red
      // banner count is: orphans − autoClassified. We can't know
      // the per-direction split of auto-classified without server
      // detail, so we deduct proportionally for the toast text.
      // This is fine for messaging (close enough); the actual UI
      // reflects truth from the refreshed store.
      const remainingOrphans = Math.max(
        0,
        orphansIncoming + orphansOutgoing - auto
      );

      const parts: string[] = [];
      parts.push(`${data.parsed.transactionCount} darījumi`);
      if (matched > 0) parts.push(`${matched} apmaksāti`);
      if (auto > 0)
        parts.push(`${auto} automātiski sasaistīti`);
      if (remainingOrphans > 0)
        parts.push(`${remainingOrphans} bez rēķina`);

      let toastMsg = `Importēts: ${parts.join(", ")}.`;
      if (auto > 0) {
        toastMsg += ` AI atpazina ${auto} darījumus pēc klientu/piegādātāju saraksta un izveidoja rēķinus automātiski.`;
      }
      if (remainingOrphans > 0) {
        toastMsg += ` Pārējie ${remainingOrphans} bez atbilstošā rēķina — pārbaudi Ienākošie/Izejošie sadaļas.`;
      }

      pushToastGlobally(
        remainingOrphans > 0 ? "info" : "success",
        toastMsg,
        remainingOrphans > 0 ? 12000 : 8000
      );

      // Refresh stores so the new statuses show up immediately
      void refreshBilling();
      void refreshPayments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Importēšana neizdevās";
      pushToastGlobally("error", msg, 9000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.csv,.txt,application/xml,text/xml,text/csv,text/plain"
        onChange={handleFileChange}
        className="hidden"
      />
      <RobotCard
        idleLabel="Ielasīt datus no bankas"
        busyMessages={PROCESSING_MESSAGES}
        busyIndex={messageIndex}
        onClick={handleClick}
        busy={busy}
        accent="sky"
        title="Augšupielādē bankas izrakstu (FIDAVISTA XML, CSV) un automātiski salīdzini ar rēķiniem"
      >
        <BankImportRobot busy={busy} />
      </RobotCard>
    </>
  );
}

// ============================================================
// Bank-import robot — eyes scan, body leans forward, "pulling in"
// ============================================================

function BankImportRobot({ busy }: { busy: boolean }) {
  return (
    <div className="relative h-[60px] w-[50px] flex flex-col items-center">
      {/* Antenna with sky-blue LED — pulses rather than wiggling
          (this robot is "receiving", not "broadcasting") */}
      <motion.div
        className="absolute -top-1 left-1/2 -translate-x-1/2 flex flex-col items-center"
        animate={busy ? { y: [0, -1, 0] } : { y: 0 }}
        transition={
          busy
            ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        <motion.div
          className="h-1.5 w-1.5 rounded-full bg-sky-500 shadow-[0_0_4px_rgba(14,165,233,0.7)]"
          animate={busy ? { opacity: [1, 0.4, 1], scale: [1, 1.3, 1] } : { opacity: 1, scale: 1 }}
          transition={
            busy
              ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
        <div className="h-3 w-px bg-graphite-700" />
      </motion.div>

      {/* Head — leans forward (positive rotateX-like effect via
          translateY + scaleY) when busy, suggesting attention */}
      <motion.div
        className="relative mt-3 h-7 w-9 rounded-md bg-sky-50 border-2 border-graphite-700 flex items-center justify-center gap-1.5"
        animate={
          busy
            ? { y: [0, 1, 0], rotate: [0, -1, 1, 0] }
            : { y: 0, rotate: 0 }
        }
        transition={
          busy
            ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {/* Eyes — scan side-to-side (barcode-reader vibe) */}
        <ScanningEye busy={busy} />
        <ScanningEye busy={busy} delay={0.1} />

        {/* Mouth — straight line, shifts horizontally a bit when
            busy as if mumbling numbers under its breath */}
        <motion.div
          className="absolute bottom-1 bg-graphite-700 rounded-sm"
          animate={
            busy
              ? { width: ["5px", "7px", "5px"], x: [-1, 1, -1] }
              : { width: "5px", x: 0 }
          }
          style={{ height: "1px" }}
          transition={
            busy
              ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      </motion.div>

      {/* Body */}
      <motion.div
        className="relative h-5 w-7 rounded-sm bg-sky-100 border-2 border-graphite-700 flex items-center justify-center -mt-px"
        animate={busy ? { x: [0, -1, 0] } : { x: 0 }}
        transition={
          busy
            ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {/* Arms reach forward — both hinge from body outward, then
            bend back, suggesting "pulling something in" */}
        <motion.div
          className="absolute -left-2 top-1/2 -translate-y-1/2 h-1 w-2.5 rounded-sm bg-graphite-700"
          animate={busy ? { x: [0, 2, 0] } : { x: 0 }}
          transition={
            busy
              ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
        <motion.div
          className="absolute -right-2 top-1/2 -translate-y-1/2 h-1 w-2.5 rounded-sm bg-graphite-700"
          animate={busy ? { x: [0, -2, 0] } : { x: 0 }}
          transition={
            busy
              ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />

        {/* Chest LED — sky color */}
        <motion.div
          className={
            busy
              ? "h-1.5 w-1.5 rounded-full bg-sky-500"
              : "h-1.5 w-1.5 rounded-full bg-graphite-400"
          }
          animate={
            busy
              ? { opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }
              : { opacity: 1, scale: 1 }
          }
          transition={
            busy
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      </motion.div>
    </div>
  );
}

/**
 * Eye that scans side-to-side when busy. The pupil is a small
 * circle inside the eye that translates horizontally — gives
 * the impression of reading a row of numbers.
 */
function ScanningEye({ busy, delay = 0 }: { busy: boolean; delay?: number }) {
  return (
    <div className="relative h-2 w-2 overflow-hidden rounded-full bg-graphite-100 border border-graphite-700">
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1 w-1 rounded-full bg-graphite-900"
        animate={busy ? { x: [-1, 1, -1] } : { x: 0 }}
        transition={
          busy
            ? { duration: 1.0, repeat: Infinity, ease: "easeInOut", delay }
            : { duration: 0.3 }
        }
      />
    </div>
  );
}
