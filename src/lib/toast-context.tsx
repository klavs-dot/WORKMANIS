"use client";

/**
 * Toast notifications for user-facing error reporting.
 *
 * Built because the store migrations use optimistic UI: if a
 * background sync to Sheets fails, we silently roll back the
 * optimistic change and log to console. Without a visible
 * notification, the user has no way to know their action didn't
 * stick — they'd see their invoice appear, then vanish after
 * a reload.
 *
 * Messages should be short, actionable, and in Latvian. Error
 * toasts are more important than success toasts (optimistic UI
 * already conveys success). We mostly just surface errors.
 *
 * Usage:
 *   const { pushError, pushSuccess } = useToast();
 *   pushError('Rēķina saglabāšana neizdevās. Pārbaudiet savienojumu.');
 *   pushSuccess('Rēķins saglabāts.');
 *
 * Toasts auto-dismiss after 6 seconds by default. User can click
 * to dismiss early.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

// ============================================================
// Types
// ============================================================

type ToastKind = "error" | "success" | "info";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. 0 = no auto-dismiss. */
  ttlMs: number;
}

interface ToastStore {
  pushError: (message: string, ttlMs?: number) => void;
  pushSuccess: (message: string, ttlMs?: number) => void;
  pushInfo: (message: string, ttlMs?: number) => void;
}

const ToastContext = createContext<ToastStore | undefined>(undefined);

// ============================================================
// Provider
// ============================================================

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, ttlMs: number) => {
      const id = Math.random().toString(36).slice(2, 10);
      setToasts((prev) => {
        // Keep max 5 toasts on screen — drop oldest if we exceed
        const next = [...prev, { id, kind, message, ttlMs }];
        return next.slice(-5);
      });
      if (ttlMs > 0) {
        setTimeout(() => dismiss(id), ttlMs);
      }
    },
    [dismiss]
  );

  // Register the module-level push so non-React code (store error
  // handlers) can fire toasts via pushToastGlobally().
  useEffect(() => {
    globalPush = push;
    return () => {
      globalPush = null;
    };
  }, [push]);

  const store: ToastStore = {
    pushError: (message, ttlMs = 7000) => push("error", message, ttlMs),
    pushSuccess: (message, ttlMs = 3500) => push("success", message, ttlMs),
    pushInfo: (message, ttlMs = 4500) => push("info", message, ttlMs),
  };

  return (
    <ToastContext.Provider value={store}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

// ============================================================
// Module-level push for use outside React tree (e.g. from stores
// that mount before ToastProvider)
// ============================================================

/**
 * Ref-like pointer to the current toast provider's push function.
 * Set by ToastProvider on mount; cleared on unmount. Allows
 * non-component code (e.g. billing-store fetch handlers) to push
 * toasts without going through useToast().
 *
 * If no provider is mounted (e.g. during SSR or before hydration),
 * pushToastGlobally() is a no-op.
 */
let globalPush:
  | ((kind: ToastKind, message: string, ttlMs?: number) => void)
  | null = null;

export function pushToastGlobally(
  kind: ToastKind,
  message: string,
  ttlMs?: number
) {
  globalPush?.(kind, message, ttlMs ?? (kind === "error" ? 7000 : 3500));
}

// ============================================================
// Toast UI container
// ============================================================

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-auto"
          >
            <ToastItem toast={t} onDismiss={() => onDismiss(t.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const styles = {
    error:
      "bg-red-50 border-red-200 text-red-900 [&_[data-icon]]:text-red-600",
    success:
      "bg-emerald-50 border-emerald-200 text-emerald-900 [&_[data-icon]]:text-emerald-600",
    info: "bg-graphite-50 border-graphite-200 text-graphite-900 [&_[data-icon]]:text-graphite-600",
  }[toast.kind];

  const Icon = toast.kind === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 pl-3 pr-2 py-2.5 rounded-lg border shadow-sm min-w-[280px] max-w-[420px] ${styles}`}
    >
      <Icon data-icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 text-[12.5px] leading-snug pt-0.5">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
        aria-label="Aizvērt"
      >
        <X className="h-3.5 w-3.5 opacity-60" />
      </button>
    </div>
  );
}
