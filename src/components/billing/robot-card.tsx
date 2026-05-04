"use client";

/**
 * RobotCard — shared visual primitive for the three robot mascot
 * buttons in the Rēķini & Maksājumi header:
 *
 *   1. Email-import robot   (green, antenna wiggles, eyes blink)
 *   2. Bank-import robot    (blue, body slides as if pulling data,
 *                            eyes scan side-to-side)
 *   3. Bank-export robot    (purple, arms reach upward, eyes pulse,
 *                            chest LED beats)
 *
 * Each robot is the SAME basic anatomy (antenna + head + eyes +
 * body + arms + chest LED) but the colors and motion patterns
 * differ so users learn at a glance which one is which. We do
 * NOT use icons — the personality comes from movement, not glyphs.
 *
 * Why three siblings instead of one configurable robot:
 *   - Each robot's animation set is hand-tuned for its action
 *     (mail-skimming feels different from data-pulling feels
 *     different from data-pushing). A unified config matrix
 *     would either be too generic or too sprawling.
 *   - Visual identity matters here. Three slightly different
 *     creatures > one creature in three costumes.
 *
 * The shared piece is the CARD WRAPPER + label/state machine.
 * The robot itself is rendered via children, letting each
 * caller bring its own anatomy + animations.
 */

import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RobotAccent = "emerald" | "sky" | "violet";

export interface RobotCardProps {
  /** The robot mascot — caller renders Antenna, Head, Body etc. */
  children: ReactNode;
  /** Idle label shown under the robot when not busy */
  idleLabel: string;
  /** Cycling messages shown one-at-a-time while busy. Pass [] to
   *  use idleLabel even during work (rare). */
  busyMessages: string[];
  /** Currently shown busy message index (caller controls timing) */
  busyIndex: number;
  /** Click handler — fires only when not busy */
  onClick: () => void;
  /** Whether the robot is currently working */
  busy: boolean;
  /** Color accent — drives border tint while busy + LED color */
  accent: RobotAccent;
  /** Tooltip on hover */
  title: string;
  /** Optional disabled state separate from busy (e.g. no company) */
  disabled?: boolean;
}

const ACCENT_BORDER: Record<RobotAccent, string> = {
  emerald: "border-emerald-700 bg-emerald-50/40",
  sky: "border-sky-700 bg-sky-50/40",
  violet: "border-violet-700 bg-violet-50/40",
};

export function RobotCard({
  children,
  idleLabel,
  busyMessages,
  busyIndex,
  onClick,
  busy,
  accent,
  title,
  disabled,
}: RobotCardProps) {
  const handleClick = () => {
    if (busy || disabled) return;
    onClick();
  };

  const message =
    busy && busyMessages.length > 0
      ? busyMessages[busyIndex % busyMessages.length]
      : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2",
        "rounded-2xl border-2 transition-all overflow-hidden",
        "h-[140px] w-[140px] shrink-0",
        busy
          ? cn("cursor-wait", ACCENT_BORDER[accent])
          : disabled
            ? "border-graphite-200 bg-graphite-50/50 cursor-not-allowed opacity-60"
            : "border-graphite-200 bg-white hover:border-graphite-400 hover:bg-graphite-50/40 hover:shadow-soft cursor-pointer"
      )}
      title={title}
    >
      {children}

      <AnimatePresence mode="wait">
        {message ? (
          <motion.div
            key={busyIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="text-[10px] font-medium text-graphite-700 text-center px-2 leading-tight min-h-[24px]"
          >
            {message}
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] font-semibold text-graphite-900 text-center px-2 leading-tight"
          >
            {idleLabel}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
