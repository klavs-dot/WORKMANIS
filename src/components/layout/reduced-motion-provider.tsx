"use client";

/**
 * Wraps the app tree in a Framer Motion <MotionConfig> with
 * `reducedMotion="user"` so the entire library honours the OS-level
 * prefers-reduced-motion media query. Without this, every motion.div
 * with `animate` / `whileHover` / etc. plays regardless of user
 * preferences.
 *
 * CSS-driven animations are handled separately in globals.css.
 */

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export function ReducedMotionProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
