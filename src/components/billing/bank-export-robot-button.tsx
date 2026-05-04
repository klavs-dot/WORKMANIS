"use client";

/**
 * BankExportRobotButton — violet/purple robot mascot card. Clicking
 * it opens the bank-exchange panel in EXPORT mode where the user
 * generates a FIDAVISTA / pain.001 XML payment batch to upload to
 * their bank.
 *
 * Personality: dispatcher / sender. Arms reach upward as if handing
 * off a package, eyes pulse rhythmically, body bobs slightly forward
 * to suggest forward motion. Color is violet to clearly distinguish
 * from the sky-blue bank-import sibling — the two operations are
 * directional opposites (data IN vs payments OUT).
 *
 * Like the bank-import robot, this is a launch button for the
 * existing BankExchangePanel — the actual XML generation lives there.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCompany } from "@/lib/company-context";
import { pushToastGlobally } from "@/lib/toast-context";
import { RobotCard } from "./robot-card";

interface BankExportRobotButtonProps {
  onClick: () => void;
}

const OPENING_MESSAGES = [
  "📤 Atveru export paneli…",
  "📦 Iepakoju maksājumus…",
];

export function BankExportRobotButton({
  onClick,
}: BankExportRobotButtonProps) {
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

    setOpening(true);
    setTimeout(() => {
      onClick();
      setTimeout(() => setOpening(false), 600);
    }, 300);
  };

  return (
    <RobotCard
      idleLabel="Sagatavot maksājumus bankai"
      busyMessages={OPENING_MESSAGES}
      busyIndex={messageIndex}
      onClick={handleClick}
      busy={opening}
      accent="violet"
      title="Eksportē maksājumu pakotni bankai (XML formātā)"
    >
      <BankExportRobot busy={opening} />
    </RobotCard>
  );
}

// ============================================================
// Bank-export robot — arms reach up, body bobs, "dispatching"
// ============================================================

function BankExportRobot({ busy }: { busy: boolean }) {
  return (
    <div className="relative h-[60px] w-[50px] flex flex-col items-center">
      {/* Antenna with violet LED — beats steadily like a heartbeat */}
      <motion.div
        className="absolute -top-1 left-1/2 -translate-x-1/2 flex flex-col items-center"
        animate={busy ? { y: [0, -2, 0] } : { y: 0 }}
        transition={
          busy
            ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        <motion.div
          className="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_4px_rgba(139,92,246,0.7)]"
          animate={busy ? { scale: [1, 1.4, 1, 1.4, 1] } : { scale: 1 }}
          transition={
            busy
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
        <div className="h-3 w-px bg-graphite-700" />
      </motion.div>

      {/* Head — bobs forward (subtle nod, like 'sending it off') */}
      <motion.div
        className="relative mt-3 h-7 w-9 rounded-md bg-violet-50 border-2 border-graphite-700 flex items-center justify-center gap-1.5"
        animate={
          busy
            ? { y: [0, -1, 1, 0], rotate: [0, 2, -2, 0] }
            : { y: 0, rotate: 0 }
        }
        transition={
          busy
            ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {/* Eyes — pulse (close-and-reopen) rhythmically */}
        <PulsingEye busy={busy} />
        <PulsingEye busy={busy} delay={0} />

        {/* Mouth — slight smile when busy (happy to dispatch) */}
        <motion.div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-graphite-700"
          animate={
            busy
              ? {
                  width: ["5px", "7px", "5px"],
                  borderRadius: ["1px", "0 0 50% 50% / 0 0 100% 100%", "1px"],
                }
              : { width: "5px", borderRadius: "1px" }
          }
          style={{ height: "1px" }}
          transition={
            busy
              ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      </motion.div>

      {/* Body */}
      <motion.div
        className="relative h-5 w-7 rounded-sm bg-violet-100 border-2 border-graphite-700 flex items-center justify-center -mt-px"
        animate={busy ? { y: [0, -0.5, 0] } : { y: 0 }}
        transition={
          busy
            ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {/* Arms — REACH UPWARD when busy (handing-off motion).
            Both arms swing up together, opposite to the email
            robot's wave. */}
        <motion.div
          className="absolute -left-1 -top-2 h-2.5 w-1 rounded-sm bg-graphite-700 origin-bottom"
          animate={
            busy
              ? { rotate: [-30, -60, -30], y: [0, -1, 0] }
              : { rotate: 0, y: 0 }
          }
          transition={
            busy
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
        <motion.div
          className="absolute -right-1 -top-2 h-2.5 w-1 rounded-sm bg-graphite-700 origin-bottom"
          animate={
            busy
              ? { rotate: [30, 60, 30], y: [0, -1, 0] }
              : { rotate: 0, y: 0 }
          }
          transition={
            busy
              ? { duration: 1.0, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />

        {/* Chest LED — violet */}
        <motion.div
          className={
            busy
              ? "h-1.5 w-1.5 rounded-full bg-violet-500"
              : "h-1.5 w-1.5 rounded-full bg-graphite-400"
          }
          animate={
            busy
              ? { opacity: [1, 0.4, 1], scale: [1, 1.3, 1] }
              : { opacity: 1, scale: 1 }
          }
          transition={
            busy
              ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
        />
      </motion.div>
    </div>
  );
}

/**
 * Eye that pulses (closes briefly then reopens) rhythmically.
 * Both eyes pulse in sync — feels like a deliberate "blink and
 * dispatch" motion, distinct from the email robot's individual
 * blinks and the bank-import's side-to-side scan.
 */
function PulsingEye({ busy, delay = 0 }: { busy: boolean; delay?: number }) {
  return (
    <motion.div
      className="relative h-2 w-2 overflow-hidden"
      animate={
        busy
          ? { scaleY: [1, 0.2, 1, 0.2, 1] }
          : { scaleY: [1, 1, 0.1, 1] }
      }
      transition={
        busy
          ? {
              duration: 1.0,
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
