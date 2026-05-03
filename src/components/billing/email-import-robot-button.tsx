"use client";

/**
 * EmailImportRobotButton — square card button with animated robot
 * mascot that triggers the Gmail invoice scan.
 *
 * The button has two states:
 *
 *   IDLE — Static robot, label "Ielasīt e-pasta rēķinus".
 *          Click triggers the scan.
 *
 *   SCANNING — Robot bobs and tilts, eyes blink, antenna wiggles.
 *              Below it, a rotating set of cute Latvian status
 *              messages cycles every ~2.5s ('Kasās pa iesūtni…',
 *              'Lasa rēķinus…', 'Šķiro PDF failus…').
 *              Click during scan is ignored.
 *
 * After scan completes, fires onComplete with the API response so
 * the parent can refetch the invoice store and show a result toast.
 *
 * Robot is built from primitives — Body, Eyes, Antenna — each is a
 * <motion.div> so we can animate parts independently. Keeps the
 * SVG-free, just CSS shapes — gives the cute "pixel toy" look that
 * fits the rest of the app's playful side.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCompany } from "@/lib/company-context";
import { pushToastGlobally } from "@/lib/toast-context";
import { cn } from "@/lib/utils";

interface EmailImportRobotButtonProps {
  /** Called after the scan completes (or fails) so the parent can
   *  refetch invoices and show a summary toast. */
  onComplete?: () => void;
  className?: string;
}

// Cute progress messages cycled while scanning. Latvian, and a bit
// playful — the user is going to see this for 30-60 seconds, so it
// shouldn't feel like a serious system spinner. Order matters: we
// loop through them in sequence.
//
// Updated to reflect the two-phase pipeline (triage every email,
// then extract from the relevant ones) — older messages assumed
// only PDF attachments were scanned.
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
  className,
}: EmailImportRobotButtonProps) {
  const { activeCompany } = useCompany();
  const [scanning, setScanning] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  // Cycle through status messages while scanning. 2.5s per message
  // gives the user enough time to read each one without it feeling
  // sluggish. Reset to first message when scan starts.
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
    if (scanning || !activeCompany?.id) return;

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
          summary: string;
        }>;
      };

      // Build per-mailbox summary
      const inbox = scans.find((s) => s.mailbox === "INBOX");
      const sent = scans.find((s) => s.mailbox === "SENT");

      const totalCreated =
        (inbox?.invoicesCreated ?? 0) + (sent?.invoicesCreated ?? 0);
      const totalDup =
        (inbox?.duplicatesSkipped ?? 0) + (sent?.duplicatesSkipped ?? 0);
      const totalErrors = (inbox?.errors ?? 0) + (sent?.errors ?? 0);
      const totalFound =
        (inbox?.messagesFound ?? 0) + (sent?.messagesFound ?? 0);
      const totalProcessed =
        (inbox?.messagesProcessed ?? 0) + (sent?.messagesProcessed ?? 0);

      // The scan caps each click at 6 messages per mailbox. If
      // Gmail returned exactly the cap for a mailbox, there are
      // probably more emails behind. Tell the user to click again.
      // Cap on messages PER MAILBOX scanned per click. If Gmail
      // returned >= the cap, there are probably more emails behind.
      // Tell the user to click again. Synced with email-scanner.ts
      // default (12 messages × 2 mailboxes = up to 24 emails per
      // click, but only ~3-5 will typically pass triage and
      // become invoices).
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

      let toastMessage: string;
      if (totalFound === 0) {
        toastMessage = "Nav jaunu rēķinu e-pastā kopš pēdējās skenēšanas.";
      } else if (totalCreated === 0 && totalDup === 0) {
        toastMessage = `Atrasti ${totalFound} ziņojumi, bet neviens nebija atpazīts kā rēķins.`;
      } else {
        toastMessage = `Pievienoti ${totalCreated} rēķini${parts.length ? ` (${parts.join(", ")})` : ""}.`;
        if (moreAvailable) {
          toastMessage += " Spied robotu vēlreiz, lai turpinātu ar nākamajiem.";
        }
      }

      pushToastGlobally(
        totalErrors > 0 ? "info" : "success",
        toastMessage,
        moreAvailable ? 12000 : 9000
      );
      void totalProcessed; // currently unused but kept for future logging
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
    <button
      type="button"
      onClick={handleClick}
      disabled={scanning}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2",
        "rounded-2xl border-2 transition-all overflow-hidden",
        "h-[140px] w-[140px] shrink-0",
        scanning
          ? "border-graphite-900 bg-graphite-50 cursor-wait"
          : "border-graphite-200 bg-white hover:border-graphite-400 hover:bg-graphite-50/40 hover:shadow-soft cursor-pointer",
        className
      )}
      title="Ielasīt rēķinus no e-pasta (Iesūtne + Nosūtītie)"
    >
      <Robot scanning={scanning} />

      <AnimatePresence mode="wait">
        {scanning ? (
          <motion.div
            key={messageIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="text-[10px] font-medium text-graphite-700 text-center px-2 leading-tight min-h-[24px]"
          >
            {SCAN_MESSAGES[messageIndex]}
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] font-semibold text-graphite-900 text-center px-2 leading-tight"
          >
            Ielasīt e-pasta rēķinus
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

// ============================================================
// Robot mascot
// ============================================================

/**
 * The robot itself. Built from CSS-only shapes so it's crisp at
 * any resolution and trivially tweakable.
 *
 * Anatomy:
 *   - antenna  — top, wiggles when scanning
 *   - head     — main body container
 *   - eyes     — two dots, blink occasionally even when idle
 *   - mouth    — small horizontal line, becomes a wavy 'O' when
 *                scanning (excited robot)
 *   - body     — squat torso below head
 *   - arms     — small protrusions on each side, jiggle when busy
 */
function Robot({ scanning }: { scanning: boolean }) {
  return (
    <div className="relative h-[60px] w-[50px] flex flex-col items-center">
      {/* Antenna */}
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
        className="relative mt-3 h-7 w-9 rounded-md bg-graphite-100 border-2 border-graphite-700 flex items-center justify-center gap-1.5"
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
        {/* Eyes */}
        <Eye scanning={scanning} />
        <Eye scanning={scanning} delay={0.15} />

        {/* Mouth — small horizontal dash idle, animated 'O' when scanning */}
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
        className="relative h-5 w-7 rounded-sm bg-graphite-200 border-2 border-graphite-700 flex items-center justify-center -mt-px"
        animate={
          scanning
            ? { y: [0, 1, 0] }
            : { y: 0 }
        }
        transition={
          scanning
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {/* Arms */}
        <motion.div
          className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-1 w-2 rounded-sm bg-graphite-700"
          animate={
            scanning
              ? { rotate: [-15, 15, -15], originX: 1 }
              : { rotate: 0 }
          }
          transition={
            scanning
              ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
        <motion.div
          className="absolute -right-1.5 top-1/2 -translate-y-1/2 h-1 w-2 rounded-sm bg-graphite-700"
          animate={
            scanning
              ? { rotate: [15, -15, 15], originX: 0 }
              : { rotate: 0 }
          }
          transition={
            scanning
              ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />

        {/* Status LED on chest */}
        <motion.div
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            scanning ? "bg-emerald-500" : "bg-graphite-400"
          )}
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

/**
 * Single eye. Blinks at random-ish intervals even when idle (gives
 * the robot a bit of life), blinks faster + scans side-to-side
 * when actively working.
 */
function Eye({
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
          ? {
              duration: 1.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }
          : {
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 1.5,
            }
      }
    >
      <div className="h-full w-full rounded-full bg-graphite-900" />
    </motion.div>
  );
}
