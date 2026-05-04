"use client";

/**
 * EmailImportRobotButton — green robot mascot card. Clicking it
 * scans the active company's connected Gmail (per-company OAuth)
 * for invoices, parses them with AI, and persists results.
 *
 * Personality: cheerful inbox-skimmer. Antenna wiggles like it's
 * tuning into a signal, eyes blink, mouth opens into an excited
 * "O" while reading.
 *
 * Visual identity within the trio:
 *   - This robot:        emerald/green   — "in" (mail arriving)
 *   - Bank-import robot: sky blue        — "down" (data flowing in)
 *   - Bank-export robot: violet/purple   — "up" (payments going out)
 *
 * The card chrome (border, label, status messages) lives in the
 * shared <RobotCard>. This file owns the robot anatomy + animations
 * + the actual scan logic.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCompany } from "@/lib/company-context";
import { pushToastGlobally } from "@/lib/toast-context";
import { RobotCard } from "./robot-card";

interface EmailImportRobotButtonProps {
  /** Called after the scan completes (or fails) so the parent can
   *  refetch invoices and show a summary toast. */
  onComplete?: () => void;
  className?: string;
}

const SCAN_MESSAGES = [
  "🔍 Lasu visas vēstules…",
  "👀 Skatos kas par ko sūtīts…",
  "🤔 Vai šis ir rēķins?",
  "📑 Atlasu finansiāli būtiskos…",
  "📎 Atrodu pielikumus…",
  "📄 Lasu PDF failus…",
  "📝 Lasu HTML rēķinus…",
  "✨ AI domā cītīgi…",
  "🧠 Izvelk supplieru, summas, datumus…",
  "💾 Saglabāju Drive…",
  "📊 Pievienoju tabelei…",
  "🧹 Pārbaudu dublikātus…",
  "🎯 Gandrīz gatavs…",
];

export function EmailImportRobotButton({
  onComplete,
}: EmailImportRobotButtonProps) {
  const { activeCompany } = useCompany();
  const [scanning, setScanning] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle status messages every 2.5s while scanning
  useEffect(() => {
    if (!scanning) {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % SCAN_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [scanning]);

  const handleClick = async () => {
    if (!activeCompany?.id) {
      pushToastGlobally(
        "error",
        "Vispirms izvēlies struktūrvienību sānjoslā",
        4000
      );
      return;
    }

    setScanning(true);
    try {
      const res = await fetch(
        `/api/email-import?company_id=${encodeURIComponent(activeCompany.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mailboxes: ["INBOX", "SENT"] }),
        }
      );

      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody?.error || `Kļūda ${res.status}`);
      }

      const { scans } = (await res.json()) as {
        scans: Array<{
          mailbox: "INBOX" | "SENT";
          messagesFound: number;
          messagesProcessed: number;
          invoicesCreated: number;
          duplicatesSkipped: number;
          errors: number;
          unmatchedCount: number;
          summary: string;
          debugErrors?: Array<{ messageId: string; reason: string }>;
          unmatchedDetails?: Array<{
            messageId: string;
            supplier: string;
            recipient: string;
            reason: string;
          }>;
        }>;
      };

      console.group("[email-import] scan results");
      for (const scan of scans) {
        console.log(
          `${scan.mailbox}: found=${scan.messagesFound} processed=${scan.messagesProcessed} created=${scan.invoicesCreated} dup=${scan.duplicatesSkipped} errors=${scan.errors} unmatched=${scan.unmatchedCount}`
        );
        console.log(`  ${scan.mailbox} summary: ${scan.summary}`);
        if (scan.debugErrors && scan.debugErrors.length > 0) {
          console.log(`  Errors in ${scan.mailbox}:`);
          for (const err of scan.debugErrors) {
            console.log(`    [${err.messageId}] ${err.reason}`);
          }
        }
        if (scan.unmatchedDetails && scan.unmatchedDetails.length > 0) {
          // Surfaced verbosely so user can audit AI's match decisions.
          // Each row: who the invoice was addressed to, who the
          // supplier was, why it was rejected.
          console.log(
            `  Citi uzņēmumi (${scan.unmatchedCount}) — citi uzņēmumi šajā Gmail kontā:`
          );
          for (const u of scan.unmatchedDetails) {
            console.log(
              `    [${u.messageId}] no '${u.supplier}' uz '${u.recipient}' — ${u.reason}`
            );
          }
        }
      }
      console.groupEnd();

      const inbox = scans.find((s) => s.mailbox === "INBOX");
      const sent = scans.find((s) => s.mailbox === "SENT");

      const totalCreated =
        (inbox?.invoicesCreated ?? 0) + (sent?.invoicesCreated ?? 0);
      const totalDup =
        (inbox?.duplicatesSkipped ?? 0) + (sent?.duplicatesSkipped ?? 0);
      const totalErrors = (inbox?.errors ?? 0) + (sent?.errors ?? 0);
      const totalUnmatched =
        (inbox?.unmatchedCount ?? 0) + (sent?.unmatchedCount ?? 0);
      const totalFound =
        (inbox?.messagesFound ?? 0) + (sent?.messagesFound ?? 0);

      const SCAN_CAP_PER_MAILBOX = 12;
      const inboxCapped =
        (inbox?.messagesFound ?? 0) >= SCAN_CAP_PER_MAILBOX;
      const sentCapped =
        (sent?.messagesFound ?? 0) >= SCAN_CAP_PER_MAILBOX;
      const moreAvailable = inboxCapped || sentCapped;

      const parts: string[] = [];
      if (inbox && inbox.messagesFound > 0) {
        parts.push(`Iesūtne: ${inbox.invoicesCreated} jauni`);
      }
      if (sent && sent.messagesFound > 0) {
        parts.push(`Nosūtīti: ${sent.invoicesCreated} jauni`);
      }
      if (totalDup > 0) parts.push(`dublikāti: ${totalDup}`);
      if (totalUnmatched > 0)
        parts.push(`citiem uzņēmumiem: ${totalUnmatched}`);

      let toastMessage: string;
      if (totalFound === 0) {
        toastMessage =
          "Nav jaunu vēstuļu e-pastā kopš pēdējās skenēšanas.";
      } else if (totalCreated === 0 && totalDup === 0 && totalUnmatched === 0) {
        toastMessage = `Atradu ${totalFound} vēstules, bet AI nevarēja izvilkt rēķinu datus. Pārbaudi Vercel logus.`;
      } else if (totalCreated === 0 && totalUnmatched > 0) {
        // Special case: AI parsed invoices but ALL of them were
        // for other companies. Tells the user the filter is working
        // and clicked-on Gmail isn't this company's primary.
        toastMessage = `Atradu ${totalFound} vēstules, bet visi ${totalUnmatched} rēķini bija citiem uzņēmumiem. Atver browser console (F12) detalizētam sarakstam.`;
      } else {
        toastMessage = `Pievienoti ${totalCreated} rēķini no ${totalFound} vēstulēm${parts.length ? ` (${parts.join(", ")})` : ""}.`;
        if (totalErrors > 0) {
          toastMessage += ` ${totalErrors} ar kļūdām.`;
        }
        if (moreAvailable) {
          toastMessage += " Spied robotu vēlreiz nākamajiem.";
        }
      }

      pushToastGlobally(
        totalErrors > 0 ? "info" : "success",
        toastMessage,
        moreAvailable ? 12000 : 9000
      );
      onComplete?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Skenēšana neizdevās";
      pushToastGlobally("error", msg, 9000);
    } finally {
      setScanning(false);
    }
  };

  return (
    <RobotCard
      idleLabel="Ielasīt e-pasta rēķinus"
      busyMessages={SCAN_MESSAGES}
      busyIndex={messageIndex}
      onClick={handleClick}
      busy={scanning}
      accent="emerald"
      title="Ielasīt rēķinus no e-pasta (Iesūtne + Nosūtītie)"
    >
      <EmailRobot scanning={scanning} />
    </RobotCard>
  );
}

// ============================================================
// Email robot — antenna wiggles, eyes blink (mail-skimmer vibe)
// ============================================================

function EmailRobot({ scanning }: { scanning: boolean }) {
  return (
    <div className="relative h-[60px] w-[50px] flex flex-col items-center">
      {/* Antenna with green LED */}
      <motion.div
        className="absolute -top-1 left-1/2 -translate-x-1/2 flex flex-col items-center"
        animate={
          scanning
            ? { rotate: [-12, 12, -8, 10, -12], y: [0, -1, 0] }
            : { rotate: 0, y: 0 }
        }
        transition={
          scanning
            ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
        style={{ originY: 1 }}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
        <div className="h-3 w-px bg-graphite-700" />
      </motion.div>

      {/* Head */}
      <motion.div
        className="relative mt-3 h-7 w-9 rounded-md bg-emerald-50 border-2 border-graphite-700 flex items-center justify-center gap-1.5"
        animate={
          scanning
            ? { y: [0, -2, 0, 2, 0], rotate: [-2, 2, -1, 1, -2] }
            : { y: 0, rotate: 0 }
        }
        transition={
          scanning
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        <BlinkingEye scanning={scanning} />
        <BlinkingEye scanning={scanning} delay={0.15} />

        {/* Mouth — opens into 'O' while busy (excited) */}
        <motion.div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-graphite-700"
          animate={
            scanning
              ? {
                  width: ["6px", "3px", "6px"],
                  height: ["1px", "3px", "1px"],
                  borderRadius: ["1px", "50%", "1px"],
                }
              : { width: "5px", height: "1px", borderRadius: "1px" }
          }
          transition={
            scanning
              ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      </motion.div>

      {/* Body */}
      <motion.div
        className="relative h-5 w-7 rounded-sm bg-emerald-100 border-2 border-graphite-700 flex items-center justify-center -mt-px"
        animate={scanning ? { y: [0, 1, 0] } : { y: 0 }}
        transition={
          scanning
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {/* Arms wave */}
        <motion.div
          className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-1 w-2 rounded-sm bg-graphite-700"
          animate={
            scanning ? { rotate: [-15, 15, -15] } : { rotate: 0 }
          }
          transition={
            scanning
              ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ originX: 1 }}
        />
        <motion.div
          className="absolute -right-1.5 top-1/2 -translate-y-1/2 h-1 w-2 rounded-sm bg-graphite-700"
          animate={
            scanning ? { rotate: [15, -15, 15] } : { rotate: 0 }
          }
          transition={
            scanning
              ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          style={{ originX: 0 }}
        />

        {/* Chest LED */}
        <motion.div
          className={
            scanning
              ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
              : "h-1.5 w-1.5 rounded-full bg-graphite-400"
          }
          animate={
            scanning
              ? { opacity: [1, 0.3, 1], scale: [1, 1.2, 1] }
              : { opacity: 1, scale: 1 }
          }
          transition={
            scanning
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      </motion.div>
    </div>
  );
}

function BlinkingEye({
  scanning,
  delay = 0,
}: {
  scanning: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      className="relative h-2 w-2 overflow-hidden"
      animate={
        scanning
          ? { scaleY: [1, 0.1, 1, 1, 1], scaleX: [1, 1, 1, 0.6, 1] }
          : { scaleY: [1, 1, 0.1, 1] }
      }
      transition={
        scanning
          ? { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }
          : { duration: 4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }
      }
    >
      <div className="h-full w-full rounded-full bg-graphite-900" />
    </motion.div>
  );
}
