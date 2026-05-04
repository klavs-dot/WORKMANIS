"use client";

/**
 * BankImportRobotButton — sky-blue robot mascot card. Clicking it
 * opens the bank-exchange panel in IMPORT mode, where the user
 * uploads a bank statement file (FIDAVISTA XML, CSV, etc.) and
 * the system reconciles it against existing invoices.
 *
 * Personality: data-pulling collector. Eyes scan left-to-right
 * like a barcode reader, body has a subtle pulled-forward lean,
 * arms reach forward.
 *
 * This robot does NOT do the import itself — it's a launch button.
 * The actual file picker + matching engine lives in the existing
 * BankExchangePanel side-drawer. We just need a visually unified
 * sibling to the email-import robot.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCompany } from "@/lib/company-context";
import { pushToastGlobally } from "@/lib/toast-context";
import { RobotCard } from "./robot-card";

interface BankImportRobotButtonProps {
  onClick: () => void;
}

// Cycled while the panel is opening — much shorter sequence than
// email scan because the user takes over once the panel is open.
// In practice these flash for ~1s during the open animation, then
// the robot returns to idle.
const OPENING_MESSAGES = [
  "📥 Atveru bankas paneli…",
  "🏦 Sagatavoju import…",
];

export function BankImportRobotButton({
  onClick,
}: BankImportRobotButtonProps) {
  const { activeCompany } = useCompany();
  const [opening, setOpening] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!opening) {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % OPENING_MESSAGES.length);
    }, 700);
    return () => clearInterval(interval);
  }, [opening]);

  const handleClick = () => {
    if (!activeCompany?.id) {
      pushToastGlobally(
        "error",
        "Vispirms izvēlies struktūrvienību sānjoslā",
        4000
      );
      return;
    }

    // Brief animation before delegating to parent. Gives the
    // robot a chance to "react" before the panel slides over it.
    setOpening(true);
    setTimeout(() => {
      onClick();
      // Keep the busy state for another beat so the robot doesn't
      // visually pop back to idle while the panel is still
      // animating in. Then the panel covers it anyway.
      setTimeout(() => setOpening(false), 600);
    }, 300);
  };

  return (
    <RobotCard
      idleLabel="Ielasīt datus no bankas"
      busyMessages={OPENING_MESSAGES}
      busyIndex={messageIndex}
      onClick={handleClick}
      busy={opening}
      accent="sky"
      title="Augšupielādē bankas izrakstu un salīdzini ar rēķiniem"
    >
      <BankImportRobot busy={opening} />
    </RobotCard>
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
