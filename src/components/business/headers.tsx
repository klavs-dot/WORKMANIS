import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div>
        <h1 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-graphite-900 text-display">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[14px] text-graphite-500 max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-end justify-between mb-4",
        className
      )}
    >
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-graphite-900">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-graphite-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
