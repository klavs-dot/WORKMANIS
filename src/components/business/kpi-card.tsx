"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string;
  change?: number; // percentage change
  changeLabel?: string;
  icon?: LucideIcon;
  accent?: "default" | "warning" | "danger";
  delay?: number;
}

export function KPICard({
  label,
  value,
  change,
  changeLabel,
  icon: Icon,
  accent = "default",
  delay = 0,
}: KPICardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative rounded-2xl border bg-white p-5 shadow-soft-xs transition-shadow hover:shadow-soft-sm",
        accent === "default" && "border-graphite-200/70",
        accent === "warning" && "border-amber-200/70 bg-amber-50/20",
        accent === "danger" && "border-red-200/70 bg-red-50/20"
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-graphite-500">
          {label}
        </span>
        {Icon && (
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              accent === "default" && "bg-graphite-50 text-graphite-700",
              accent === "warning" && "bg-amber-100/80 text-amber-700",
              accent === "danger" && "bg-red-100/80 text-red-700"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tracking-tight text-graphite-900 tabular">
          {value}
        </span>
      </div>

      {(change !== undefined || changeLabel) && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px]">
          {change !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular",
                isPositive && "text-emerald-600",
                isNegative && "text-red-600",
                change === 0 && "text-graphite-500"
              )}
            >
              {isPositive && <ArrowUpRight className="h-3 w-3" />}
              {isNegative && <ArrowDownRight className="h-3 w-3" />}
              {change > 0 ? "+" : ""}
              {change}%
            </span>
          )}
          {changeLabel && (
            <span className="text-graphite-500">{changeLabel}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
