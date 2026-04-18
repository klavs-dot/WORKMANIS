"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader, SectionHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/switch-tabs";
import { companies, invoices, subscriptions } from "@/lib/mock";
import { formatCurrency, cn } from "@/lib/utils";

const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
const monthlySpend = [10420, 11890, 11240, 12860, 13540, 14020];
const monthlyUnpaid = [4, 6, 3, 7, 5, 8];

export default function ParskatiPage() {
  const maxSpend = Math.max(...monthlySpend);
  const maxUnpaid = Math.max(...monthlyUnpaid);

  // Category breakdown
  const categoryTotals = subscriptions
    .filter((s) => s.status === "aktīvs")
    .reduce((acc, s) => {
      const monthly =
        s.periodicity === "mēnesis"
          ? s.price
          : s.periodicity === "gads"
          ? s.price / 12
          : s.price / 3;
      acc[s.category] = (acc[s.category] || 0) + monthly;
      return acc;
    }, {} as Record<string, number>);

  const categories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const totalCategorySpend = categories.reduce((s, [, v]) => s + v, 0);

  // Company comparison
  const companyStats = companies.map((c) => {
    const compInvoices = invoices.filter((i) => i.companyId === c.id);
    const compSubs = subscriptions.filter(
      (s) => s.companyId === c.id && s.status === "aktīvs"
    );
    const monthly = compSubs.reduce((sum, s) => {
      if (s.periodicity === "mēnesis") return sum + s.price;
      if (s.periodicity === "gads") return sum + s.price / 12;
      return sum + s.price / 3;
    }, 0);
    const invoiceTotal = compInvoices.reduce((s, i) => s + i.total, 0);
    return { ...c, monthly, invoiceTotal };
  });
  const maxCompanyMonthly = Math.max(...companyStats.map((c) => c.monthly));

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          title="Pārskati"
          description="Analītika un tendences visiem jūsu uzņēmumiem"
          actions={
            <>
              <Tabs defaultValue="6m">
                <TabsList>
                  <TabsTrigger value="1m">1M</TabsTrigger>
                  <TabsTrigger value="3m">3M</TabsTrigger>
                  <TabsTrigger value="6m">6M</TabsTrigger>
                  <TabsTrigger value="1y">1G</TabsTrigger>
                  <TabsTrigger value="all">Viss</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Eksportēt
              </Button>
            </>
          }
        />

        {/* Top metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "Kopējās izmaksas (6 mēn.)",
              value: formatCurrency(monthlySpend.reduce((s, v) => s + v, 0)),
              change: 8.2,
              positive: false,
            },
            {
              label: "Vidējās ikmēneša izmaksas",
              value: formatCurrency(
                monthlySpend.reduce((s, v) => s + v, 0) / monthlySpend.length
              ),
              change: 3.1,
              positive: false,
            },
            {
              label: "Laicīgi apmaksāti",
              value: "94%",
              change: 2.4,
              positive: true,
            },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
            >
              <Card className="p-5">
                <p className="text-[11px] uppercase tracking-wider text-graphite-500 font-medium">
                  {m.label}
                </p>
                <p className="mt-3 text-[26px] font-semibold tabular tracking-tight text-graphite-900">
                  {m.value}
                </p>
                <div
                  className={cn(
                    "mt-1 inline-flex items-center gap-0.5 text-[12px] font-medium tabular",
                    m.positive ? "text-emerald-600" : "text-amber-600"
                  )}
                >
                  {m.positive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {m.positive ? "+" : ""}
                  {m.change}%
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Monthly spend chart */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <div className="p-5 border-b border-graphite-100 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                  Izmaksas pa mēnešiem
                </h2>
                <p className="mt-0.5 text-[12.5px] text-graphite-500">
                  Kopējās apmaksātās summas pēdējos 6 mēnešos
                </p>
              </div>
              <Badge variant="success">+8,2% tendences pieaugums</Badge>
            </div>
            <div className="p-6">
              <div className="flex items-end gap-3 h-52">
                {monthlySpend.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-2 group"
                  >
                    <span className="text-[11px] tabular text-graphite-400 group-hover:text-graphite-900 transition-colors">
                      {formatCurrency(v).replace(/,\d+/, "")}
                    </span>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(v / maxSpend) * 100}%` }}
                      transition={{
                        duration: 0.8,
                        delay: 0.2 + i * 0.05,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className={cn(
                        "w-full rounded-t-md transition-colors",
                        i === monthlySpend.length - 1
                          ? "bg-graphite-900"
                          : "bg-graphite-200 group-hover:bg-graphite-400"
                      )}
                    />
                    <span className="text-[11px] text-graphite-500 font-medium">
                      {months[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Category + Unpaid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Category */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <Card>
              <div className="p-5 border-b border-graphite-100">
                <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                  Izmaksas pa kategorijām
                </h2>
                <p className="mt-0.5 text-[12.5px] text-graphite-500">
                  Ikmēneša izmaksu sadalījums
                </p>
              </div>
              <div className="p-5 space-y-3">
                {categories.map(([cat, val], i) => {
                  const pct = (val / totalCategorySpend) * 100;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium text-graphite-800">
                          {cat}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11.5px] text-graphite-500 tabular">
                            {pct.toFixed(1)}%
                          </span>
                          <span className="text-[13px] tabular text-graphite-900 font-semibold w-20 text-right">
                            {formatCurrency(val)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-graphite-100 overflow-hidden">
                        <motion.div
                          className="h-full bg-graphite-900 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.8,
                            delay: 0.3 + i * 0.04,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>

          {/* Unpaid dynamics */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card>
              <div className="p-5 border-b border-graphite-100">
                <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                  Neapmaksātie rēķini
                </h2>
                <p className="mt-0.5 text-[12.5px] text-graphite-500">
                  Dinamika pa mēnešiem
                </p>
              </div>
              <div className="p-6">
                {/* Simple line chart SVG */}
                <svg
                  viewBox="0 0 400 180"
                  className="w-full h-52"
                  preserveAspectRatio="none"
                >
                  {/* grid */}
                  {[0, 1, 2, 3].map((i) => (
                    <line
                      key={i}
                      x1="0"
                      x2="400"
                      y1={40 + i * 40}
                      y2={40 + i * 40}
                      stroke="hsl(220 13% 92%)"
                      strokeDasharray="2 4"
                    />
                  ))}
                  {/* area */}
                  <motion.path
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    d={`M ${monthlyUnpaid
                      .map(
                        (v, i) =>
                          `${(i / (monthlyUnpaid.length - 1)) * 400} ${
                            180 - (v / maxUnpaid) * 140 - 20
                          }`
                      )
                      .join(" L ")}`}
                    fill="none"
                    stroke="hsl(220 13% 14%)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* points */}
                  {monthlyUnpaid.map((v, i) => (
                    <motion.circle
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.8 + i * 0.05 }}
                      cx={(i / (monthlyUnpaid.length - 1)) * 400}
                      cy={180 - (v / maxUnpaid) * 140 - 20}
                      r="3"
                      fill="white"
                      stroke="hsl(220 13% 14%)"
                      strokeWidth="2"
                    />
                  ))}
                </svg>
                <div className="flex justify-between mt-3">
                  {months.map((m) => (
                    <span
                      key={m}
                      className="text-[11px] text-graphite-500 font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Company comparison */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <Card>
            <div className="p-5 border-b border-graphite-100">
              <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                Uzņēmumu salīdzinājums
              </h2>
              <p className="mt-0.5 text-[12.5px] text-graphite-500">
                Ikmēneša izmaksas no aktīviem abonementiem
              </p>
            </div>
            <div className="p-5 space-y-4">
              {companyStats.map((c, i) => (
                <div key={c.id} className="flex items-center gap-4">
                  <div className="flex items-center gap-2.5 w-[220px] shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-graphite-900 text-white text-[11px] font-semibold">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-[13px] font-medium text-graphite-900 truncate">
                      {c.name}
                    </span>
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-graphite-100 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(c.monthly / maxCompanyMonthly) * 100}%`,
                      }}
                      transition={{
                        duration: 0.8,
                        delay: 0.4 + i * 0.05,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="h-full bg-graphite-900 rounded-full"
                    />
                  </div>
                  <span className="text-[14px] font-semibold tabular text-graphite-900 w-28 text-right">
                    {formatCurrency(c.monthly)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </AppShell>
  );
}
