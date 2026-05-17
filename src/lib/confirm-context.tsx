"use client";

/**
 * Programmatic confirmation dialog — replacement for window.confirm().
 *
 * Native confirm() blocks the event loop, can't be styled, and on
 * some browsers is suppressed entirely. This provider mounts a
 * single styled Dialog and exposes a Promise-returning helper.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: "Dzēst log ierakstus?",
 *     description: "Šo darbību nevar atsaukt.",
 *     destructive: true,
 *   });
 *   if (!ok) return;
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{opts?.title ?? ""}</DialogTitle>
            {opts?.description && (
              <DialogDescription>{opts.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-3 border-t border-graphite-100">
            <Button variant="ghost" size="sm" onClick={() => close(false)}>
              {opts?.cancelLabel ?? "Atcelt"}
            </Button>
            <Button
              size="sm"
              variant={opts?.destructive ? "destructive" : "default"}
              onClick={() => close(true)}
              autoFocus
            >
              {opts?.confirmLabel ?? "Apstiprināt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}
