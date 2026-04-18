"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Download,
  MoreHorizontal,
  LayoutGrid,
  List as ListIcon,
  TrendingUp,
  Calendar,
  Ban,
  Pencil,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubscriptionStatusBadge } from "@/components/business/status-badge";
import { Badge } from "@/components/ui/badge";
import { subscriptions } from "@/lib/mock";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

const categoryColors: Record<string, string> = {
  Dizains: "from-violet-50 to-white border-violet-100",
  Produktivitāte: "from-sky-50 to-white border-sky-100",
  "AI / Izstrāde": "from-emerald-50 to-white border-emerald-100",
  Izstrāde: "from-teal-50 to-white border-teal-100",
  Sakari: "from-amber-50 to-white border-amber-100",
  Maksājumi: "from-indigo-50 to-white border-indigo-100",
  Komunikācija: "from-rose-50 to-white border-rose-100",
  Marketings: "from-orange-50 to-white border-orange-100",
  Glabāšana: "from-slate-50 to-white border-slate-100",
  Drošība: "from-red-50 to-white border-red-100",
};

export default function AbonementiPage() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [period, setPeriod] = useState<"month" | "year">("month");

  const normalized = useMemo(() => {
    return subscriptions.map((s) => {
      let monthly = s.price;
      if (s.periodicity === "gads") monthly = s.price / 12;
      if (s.periodicity === "ceturksnis") monthly = s.price / 3;
      return { ...s, monthly };
    });
  }, []);

  const activeSubscriptions = normalized.filter((s) => s.status === "aktīvs");
  const monthlyTotal = activeSubscriptions.reduce(
    (sum, s) => sum + s.monthly,
    0
  );
  const yearlyTotal = monthlyTotal * 12;

  const topSubscriptions = [...activeSubscriptions]
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 3);

  const displayValue = period === "month" ? monthlyTotal : yearlyTotal;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Abonementi"
          description={`${activeSubscriptions.length} aktīvi abonementi pār ${new Set(subscriptions.map((s) => s.companyId)).size} uzņēmumiem`}
          actions={
            <>
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Eksportēt
              </Button>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Pievienot abonementu
              </Button>
            </>
          }
        />

        {/* Summary cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Total */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="p-6 h-full relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <div className="inline-flex items-center rounded-full bg-graphite-100 p-0.5">
                  <button
                    onClick={() => setPeriod("month")}
                    className={cn(
                      "px-3 py-1 text-[11px] font-medium rounded-full transition-all",
                      period === "month"
                        ? "bg-white text-graphite-900 shadow-soft-xs"
                        : "text-graphite-500 hover:text-graphite-700"
                    )}
                  >
                    Mēneša
                  </button>
                  <button
                    onClick={() => setPeriod("year")}
                    className={cn(
                      "px-3 py-1 text-[11px] font-medium rounded-full transition-all",
                      period === "year"
                        ? "bg-white text-graphite-900 shadow-soft-xs"
                        : "text-graphite-500 hover:text-graphite-700"
                    )}
                  >
                    Gada
                  </button>
                </div>
              </div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-graphite-500">
                {period === "month" ? "Mēneša" : "Gada"} kopējās izmaksas
              </span>
              <motion.p
                key={period}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-4 text-[32px] font-semibold tracking-tight text-graphite-900 tabular"
              >
                {formatCurrency(displayValue)}
              </motion.p>
              <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                <TrendingUp className="h-3 w-3 text-emerald-600" />
                <span className="text-emerald-600 font-medium tabular">+2,4%</span>
                <span className="text-graphite-500">pret pagājušo mēn.</span>
              </div>
            </Card>
          </motion.div>

          {/* Top subs */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-2"
          >
            <Card className="p-6 h-full">
              <span className="text-[11px] font-medium uppercase tracking-wider text-graphite-500">
                Dārgākie abonementi
              </span>
              <div className="mt-4 space-y-3">
                {topSubscriptions.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-graphite-400 w-5">
                      0{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-graphite-900 truncate">
                        {s.service}
                      </p>
                      <p className="text-[11.5px] text-graphite-500">
                        {s.category} · {s.companyName}
                      </p>
                    </div>
                    <span className="text-[14px] font-semibold tabular text-graphite-900">
                      {formatCurrency(s.monthly)}
                      <span className="text-[10.5px] text-graphite-400 ml-0.5">
                        /mēn.
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* View switcher */}
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Visi abonementi
          </h2>
          <div className="inline-flex items-center rounded-lg border border-graphite-200 bg-white p-0.5 shadow-soft-xs">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-all",
                view === "grid"
                  ? "bg-graphite-100 text-graphite-900"
                  : "text-graphite-400 hover:text-graphite-700"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-all",
                view === "table"
                  ? "bg-graphite-100 text-graphite-900"
                  : "text-graphite-400 hover:text-graphite-700"
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Grid view */}
        {view === "grid" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4"
          >
            {normalized.map((s, i) => {
              const colorClass =
                categoryColors[s.category] ||
                "from-graphite-50 to-white border-graphite-100";
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.02 }}
                >
                  <Card className="p-5 hover:shadow-soft-sm transition-all cursor-pointer group h-full flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b border text-[13px] font-semibold text-graphite-900",
                          colorClass
                        )}
                      >
                        {s.service.slice(0, 2).toUpperCase()}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Pencil className="h-3.5 w-3.5" />
                            Rediģēt
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600 focus:text-red-700">
                            <Ban className="h-3.5 w-3.5" />
                            Atzīmēt kā atceltu
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <h3 className="text-[14.5px] font-semibold tracking-tight text-graphite-900">
                      {s.service}
                    </h3>
                    <p className="text-[11.5px] text-graphite-500 mt-0.5 flex items-center gap-1.5">
                      {s.category}
                      <span className="w-0.5 h-0.5 bg-graphite-300 rounded-full" />
                      {s.companyName}
                    </p>
                    <div className="mt-auto pt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[18px] font-semibold tabular text-graphite-900">
                          {formatCurrency(s.price)}
                        </span>
                        <span className="text-[11px] text-graphite-500">
                          /{s.periodicity === "mēnesis" ? "mēn." : s.periodicity === "gads" ? "gadā" : "cet."}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-graphite-100">
                        <span className="text-[11px] text-graphite-500 flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {formatDate(s.nextPayment)}
                        </span>
                        <SubscriptionStatusBadge status={s.status} />
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Table view */}
        {view === "table" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Pakalpojums</TableHead>
                    <TableHead>Kategorija</TableHead>
                    <TableHead className="text-right">Cena</TableHead>
                    <TableHead>Periodiskums</TableHead>
                    <TableHead>Nākamais maksājums</TableHead>
                    <TableHead>Uzņēmums</TableHead>
                    <TableHead>Statuss</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {normalized.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 text-[10px] font-semibold border border-graphite-100">
                            {s.service.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-graphite-900">
                            {s.service}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted">{s.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-graphite-900 tabular">
                        {formatCurrency(s.price)}
                      </TableCell>
                      <TableCell className="text-graphite-600 capitalize">
                        {s.periodicity}
                      </TableCell>
                      <TableCell className="text-graphite-600 tabular">
                        {formatDate(s.nextPayment)}
                      </TableCell>
                      <TableCell className="text-graphite-600">
                        {s.companyName}
                      </TableCell>
                      <TableCell>
                        <SubscriptionStatusBadge status={s.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}
