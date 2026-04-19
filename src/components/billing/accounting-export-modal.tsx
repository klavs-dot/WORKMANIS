"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Sparkles,
  ArrowUpFromLine,
  ArrowDownToLine,
  CreditCard,
  Package,
  Check,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ============================================================
// Export center for the accountant
//
// Front-end mock only. Each card simulates a download with a
// small "done" flash. In production these will resolve to
// real Google Sheets exports or generated CSV/PDF files.
// ============================================================

interface ExportAction {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "violet" | "emerald" | "sky" | "amber" | "graphite";
}

const actions: ExportAction[] = [
  {
    key: "explanations",
    title: "Lejuplādēt rēķinu skaidrojumus",
    description:
      "Visi izejošie rēķini ar grāmatvedības skaidrojumiem — kategorija, periods, paskaidrojums.",
    icon: Sparkles,
    tone: "violet",
  },
  {
    key: "outgoing",
    title: "Lejuplādēt izejošos rēķinus",
    description:
      "Rēķini no piegādātājiem un partneriem, ar IBAN, summām un apmaksas termiņiem.",
    icon: ArrowUpFromLine,
    tone: "graphite",
  },
  {
    key: "incoming",
    title: "Lejuplādēt ienākošos rēķinus",
    description:
      "Mūsu izrakstītie rēķini klientiem — PVN, pavadzīmes, apmaksas statusi.",
    icon: ArrowDownToLine,
    tone: "emerald",
  },
  {
    key: "card_payments",
    title: "Lejuplādēt maksājumus ar karti",
    description:
      "Online abonementu un veikalu pirkumi ar karti. Grāmatošanai pa kategorijām.",
    icon: CreditCard,
    tone: "sky",
  },
  {
    key: "all",
    title: "Lejuplādēt visus rēķinus un maksājumus",
    description:
      "Pilnīgs eksports ar visiem rēķiniem un maksājumiem atskaites periodam.",
    icon: Package,
    tone: "amber",
  },
];

const toneStyles: Record<
  ExportAction["tone"],
  { iconBg: string; iconText: string; border: string }
> = {
  violet: {
    iconBg: "bg-violet-50",
    iconText: "text-violet-600",
    border: "hover:border-violet-200",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    border: "hover:border-emerald-200",
  },
  sky: {
    iconBg: "bg-sky-50",
    iconText: "text-sky-600",
    border: "hover:border-sky-200",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    border: "hover:border-amber-200",
  },
  graphite: {
    iconBg: "bg-graphite-100",
    iconText: "text-graphite-700",
    border: "hover:border-graphite-300",
  },
};

interface AccountingExportModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function AccountingExportModal({
  open,
  onOpenChange,
}: AccountingExportModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const simulate = (key: string) => {
    if (busy) return;
    setBusy(key);
    setDone(null);
    setTimeout(() => {
      setBusy(null);
      setDone(key);
      setTimeout(() => setDone((curr) => (curr === key ? null : curr)), 2000);
    }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grāmatvedībai</DialogTitle>
          <DialogDescription>
            Eksporta centrs — gatavo atskaites grāmatvedim pa kategorijām
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 pt-2">
          {actions.map((a, idx) => {
            const styles = toneStyles[a.tone];
            const Icon = a.icon;
            const isBusy = busy === a.key;
            const isDone = done === a.key;
            return (
              <motion.button
                key={a.key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                onClick={() => simulate(a.key)}
                disabled={!!busy}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border border-graphite-200 bg-white p-4 text-left transition-all",
                  "hover:shadow-soft-sm disabled:opacity-60 disabled:cursor-not-allowed",
                  styles.border
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    styles.iconBg,
                    styles.iconText
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold tracking-tight text-graphite-900">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-graphite-500 leading-relaxed">
                    {a.description}
                  </p>
                </div>
                <div className="flex items-center justify-center w-6 h-6 shrink-0 mt-1">
                  <AnimatePresence mode="wait">
                    {isBusy ? (
                      <motion.div
                        key="busy"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-4 w-4 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin"
                      />
                    ) : isDone ? (
                      <motion.div
                        key="done"
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Download className="h-4 w-4 text-graphite-400" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="rounded-lg border border-graphite-100 bg-graphite-50/50 p-3 flex items-start gap-2.5 mt-4">
          <Info className="h-3.5 w-3.5 text-graphite-400 mt-0.5 shrink-0" />
          <p className="text-[11.5px] text-graphite-500 leading-relaxed">
            Šie dati vēlāk tiks eksportēti no Google Sheets / sistēmas
            integrācijas. Pašreizējā versijā eksports tiek simulēts priekšējās
            puses vajadzībām.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
