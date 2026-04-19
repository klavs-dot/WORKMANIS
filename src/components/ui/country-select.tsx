"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COUNTRIES, flagEmoji, getCountryByCode } from "@/lib/countries";
import { cn } from "@/lib/utils";

interface CountrySelectProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  placeholder?: string;
}

export function CountrySelect({
  value,
  onChange,
  className,
  placeholder,
}: CountrySelectProps) {
  const selected = getCountryByCode(value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-graphite-200 bg-white px-3 py-2 text-[13.5px] text-graphite-800 transition-colors",
          "hover:border-graphite-300",
          "focus:outline-none focus:border-graphite-900 focus:ring-2 focus:ring-graphite-900/5",
          className
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2 truncate">
            <span className="text-[16px] leading-none">
              {flagEmoji(selected.code)}
            </span>
            <span className="truncate">{selected.name}</span>
            <span className="font-mono text-[10px] text-graphite-400 ml-1">
              {selected.code}
            </span>
          </span>
        ) : (
          <span className="text-graphite-400">
            {placeholder ?? "Izvēlēties valsti"}
          </span>
        )}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[240px] max-h-[320px] overflow-y-auto"
      >
        {COUNTRIES.map((c) => (
          <DropdownMenuItem key={c.code} onSelect={() => onChange(c.code)}>
            <span className="text-[15px] leading-none">
              {flagEmoji(c.code)}
            </span>
            <span className="flex-1">{c.name}</span>
            <span className="font-mono text-[10px] text-graphite-400">
              {c.code}
            </span>
            {value === c.code && <Check className="h-3.5 w-3.5 ml-1" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline flag + country name display */
export function CountryLabel({ code }: { code: string }) {
  const c = getCountryByCode(code);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[14px] leading-none">{flagEmoji(code)}</span>
      <span className="text-[12.5px] text-graphite-800">
        {c?.name ?? code}
      </span>
    </span>
  );
}
