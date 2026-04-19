"use client";

import { useState } from "react";
import { Bell, Calendar, ChevronDown, Search, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompany } from "@/lib/company-context";
import { cn } from "@/lib/utils";

const dateRanges = [
  "Šodien",
  "Šonedēļ",
  "Šomēnes",
  "Šoceturksnī",
  "Šogad",
  "Pielāgots",
];

export function Topbar() {
  const { companies, activeCompany, setActiveCompany } = useCompany();
  const [dateRange, setDateRange] = useState("Šomēnes");

  return (
    <header className="sticky top-0 z-30 h-14 glass border-b border-graphite-100">
      <div className="flex h-full items-center gap-3 px-4 lg:px-6">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-graphite-400" />
          <input
            type="search"
            placeholder="Meklēt rēķinus, piegādātājus, maksājumus..."
            className={cn(
              "w-full h-9 rounded-lg bg-graphite-100/70 pl-9 pr-14 text-[13px] text-graphite-800 placeholder:text-graphite-400",
              "border border-transparent transition-colors",
              "hover:bg-graphite-100 focus:bg-white focus:border-graphite-200 focus:outline-none"
            )}
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 rounded-md border border-graphite-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-graphite-500 tabular">
            ⌘K
          </kbd>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden md:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-graphite-200 bg-white text-[12.5px] font-medium text-graphite-700 hover:border-graphite-300 transition-colors focus:outline-none">
              <Calendar className="h-3.5 w-3.5 text-graphite-500" />
              <span>{dateRange}</span>
              <ChevronDown className="h-3 w-3 text-graphite-400 ml-0.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Datumu periods</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dateRanges.map((range) => (
                <DropdownMenuItem
                  key={range}
                  onSelect={() => setDateRange(range)}
                >
                  <span className="flex-1">{range}</span>
                  {dateRange === range && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {activeCompany && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-3 rounded-lg border border-graphite-200 bg-white text-[12.5px] font-medium text-graphite-700 hover:border-graphite-300 transition-colors focus:outline-none">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-graphite-900 text-white text-[9px] font-semibold">
                  {activeCompany.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="truncate max-w-[160px]">
                  {activeCompany.name}
                </span>
                <ChevronDown className="h-3 w-3 text-graphite-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Pārslēgt uzņēmumu</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {companies.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => setActiveCompany(c.id)}
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-graphite-900 text-white text-[9px] font-semibold">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="flex-1 truncate">{c.name}</span>
                    {activeCompany.id === c.id && (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-transparent hover:bg-graphite-100 transition-colors focus:outline-none">
            <Bell className="h-4 w-4 text-graphite-600" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-graphite-900 text-white text-[11px] font-semibold transition-transform active:scale-95">
                KB
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2.5 py-2 border-b border-graphite-100 mb-1">
                <p className="text-[13px] font-medium text-graphite-900">
                  Klāvs Bērziņš
                </p>
                <p className="text-[11.5px] text-graphite-500 mt-0.5">
                  klavs@globalwolfmotors.com
                </p>
              </div>
              <DropdownMenuItem>Mans profils</DropdownMenuItem>
              <DropdownMenuItem>Komandas iestatījumi</DropdownMenuItem>
              <DropdownMenuItem>Palīdzība</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  // Clear active company and go to selector
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem("workmanis:active-company");
                    window.location.href = "/";
                  }
                }}
              >
                Atteikties
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
