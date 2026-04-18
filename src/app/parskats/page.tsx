"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Receipt,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  Plus,
  Download,
  Repeat,
  AlertTriangle,
  Info,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { KPICard } from "@/components/business/kpi-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  InvoiceStatusBadge,
  PaymentStatusBadge,
} from "@/components/business/status-badge";
import {
  invoices,
  payments,
  subscriptions,
  alerts,
} from "@/lib/mock";
import { formatCurrency, formatDate, daysUntil, cn } from "@/lib/utils";
import { useCompany } from "@/lib/company-context";

export default function DashboardPage() {
  const router = useRouter();
  const { activeCompany, hydrated } = useCompany();

  useEffect(() => {
    if (hydrated && !activeCompany) {
      router.replace("/");
    }
  }, [hydrated, activeCompany, router]);

  if (!hydrated || !activeCompany) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin" />
      </div>
    );
  }

  const companyInvoices = invoices.filter(
    (i) => i.companyId === activeCompany.id
  );
  const companySubs = subscriptions.filter(
    (s) => s.companyId === activeCompany.id
  );
  const companyPayments = payments.filter(
    (p) => p.companyId === activeCompany.id
  );

  const activeSubscriptions = companySubs.filter((s) => s.status === "aktīvs").length;
  const unpaidInvoices = companyInvoices.filter(
    (i) => i.status === "gaida" || i.status === "termiņš_beidzies"
  );
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);

  const thisWeekPayments = companyPayments.filter((p) => {
    const d = daysUntil(p.dueDate);
    return d >= 0 && d <= 7;
  });
  const thisWeekTotal = thisWeekPayments.reduce((s, p) => s + p.amount, 0);

  const monthlySpend = companySubs
    .filter((s) => s.status === "aktīvs" && s.periodicity === "mēnesis")
    .reduce((sum, s) => sum + s.price, 0);

  const upcomingPayments = [...companyPayments]
    .filter((p) => p.status !== "apmaksāts")
    .sort(
      (a, b) =>
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
    .slice(0, 5);

  const recentInvoices = [...companyInvoices]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const categoryBreakdown = companySubs
    .filter((s) => s.status === "aktīvs" && s.periodicity === "mēnesis")
    .reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + s.price;
      return acc;
    }, {} as Record<string, number>);
  const categoryEntries = Object.entries(categoryBreakdown).sort(
    (a, b) => b[1] - a[1]
  );
  const maxCategoryValue = Math.max(...categoryEntries.map(([, v]) => v), 1);

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          title="Pārskats"
          description={`Labrīt, Klāv. Šeit ir svarīgākais uzņēmumam ${activeCompany.name} šodien.`}
          actions={
            <>
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Eksportēt
              </Button>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Pievienot rēķinu
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KPICard
            label="Aktīvie abonementi"
            value={activeSubscriptions.toString()}
            change={8.1}
            changeLabel="pret pagājušo mēn."
            icon={Repeat}
            delay={0}
          />
          <KPICard
            label="Neapmaksātie rēķini"
            value={formatCurrency(unpaidTotal)}
            change={-3.2}
            changeLabel={`${unpaidInvoices.length} rēķini`}
            icon={Receipt}
            accent={unpaidInvoices.length > 0 ? "warning" : "default"}
            delay={0.05}
          />
          <KPICard
            label="Maksājumi šonedēļ"
            value={formatCurrency(thisWeekTotal)}
            changeLabel={`${thisWeekPayments.length} maksājumi`}
            icon={Calendar}
            delay={0.1}
          />
          <KPICard
            label="Mēneša izmaksas"
            value={formatCurrency(monthlySpend)}
            change={2.4}
            changeLabel="pret pagājušo mēn."
            icon={TrendingUp}
            delay={0.15}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-2"
          >
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-graphite-100">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                    Tuvākie maksājumi
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-graphite-500">
                    Gaida apstiprinājumu vai nosūtīšanu
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/maksajumi" className="gap-1">
                    Skatīt visus
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </Button>
              </div>
              {upcomingPayments.length === 0 ? (
                <div className="p-12 text-center text-[13px] text-graphite-500">
                  Nav gaidošu maksājumu
                </div>
              ) : (
                <div className="divide-y divide-graphite-100">
                  {upcomingPayments.map((p) => {
                    const days = daysUntil(p.dueDate);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-graphite-50/50 transition-colors"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-graphite-50 text-graphite-700 text-[11px] font-semibold">
                          {p.recipient.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-medium text-graphite-900 truncate">
                            {p.recipient}
                          </p>
                          <p className="text-[11.5px] text-graphite-500 truncate">
                            Ref. {p.reference}
                          </p>
                        </div>
                        <div className="hidden md:flex flex-col items-end text-right mr-2">
                          <span
                            className={cn(
                              "text-[11.5px] tabular",
                              days < 0
                                ? "text-red-600 font-medium"
                                : days <= 3
                                ? "text-amber-600 font-medium"
                                : "text-graphite-500"
                            )}
                          >
                            {days < 0
                              ? `Kavēti ${Math.abs(days)} d.`
                              : days === 0
                              ? "Šodien"
                              : `pēc ${days} d.`}
                          </span>
                          <span className="text-[10.5px] text-graphite-400">
                            {formatDate(p.dueDate)}
                          </span>
                        </div>
                        <span className="text-[14px] font-semibold text-graphite-900 tabular shrink-0 w-20 text-right">
                          {formatCurrency(p.amount)}
                        </span>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card>
              <div className="p-5 border-b border-graphite-100 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                  Brīdinājumi
                </h2>
                <span className="text-[10.5px] font-medium text-graphite-400 uppercase tracking-wider">
                  {alerts.length}
                </span>
              </div>
              <div className="divide-y divide-graphite-100">
                {alerts.map((alert) => {
                  const Icon =
                    alert.type === "danger"
                      ? XCircle
                      : alert.type === "warning"
                      ? AlertTriangle
                      : Info;
                  return (
                    <div key={alert.id} className="p-4 flex gap-3">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5",
                          alert.type === "danger" && "bg-red-50 text-red-600",
                          alert.type === "warning" && "bg-amber-50 text-amber-600",
                          alert.type === "info" && "bg-sky-50 text-sky-600"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-graphite-900 leading-snug">
                          {alert.title}
                        </p>
                        <p className="text-[11.5px] text-graphite-500 mt-0.5 leading-snug">
                          {alert.description}
                        </p>
                        <p className="text-[10.5px] text-graphite-400 mt-1">
                          {alert.timestamp}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card>
              <div className="p-5 border-b border-graphite-100">
                <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                  Izmaksu sadalījums
                </h2>
                <p className="mt-0.5 text-[12.5px] text-graphite-500">
                  Aktīvie abonementi pēc kategorijas
                </p>
              </div>
              <div className="p-5 space-y-4">
                {categoryEntries.length === 0 ? (
                  <p className="text-[13px] text-graphite-500 text-center py-6">
                    Nav aktīvu abonementu
                  </p>
                ) : (
                  categoryEntries.map(([cat, val]) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium text-graphite-800">
                          {cat}
                        </span>
                        <span className="text-[13px] tabular text-graphite-900 font-medium">
                          {formatCurrency(val)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-graphite-100 overflow-hidden">
                        <motion.div
                          className="h-full bg-graphite-900 rounded-full"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(val / maxCategoryValue) * 100}%`,
                          }}
                          transition={{
                            duration: 0.8,
                            delay: 0.4,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-2"
          >
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-graphite-100">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
                    Jaunākie rēķini
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-graphite-500">
                    Pēdējie saņemtie rēķini
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/rekini" className="gap-1">
                    Skatīt visus
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                </Button>
              </div>
              {recentInvoices.length === 0 ? (
                <div className="p-12 text-center text-[13px] text-graphite-500">
                  Nav saņemtu rēķinu
                </div>
              ) : (
                <div className="divide-y divide-graphite-100">
                  {recentInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-graphite-50/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium text-graphite-900 truncate">
                          {inv.supplierName}
                        </p>
                        <p className="text-[11.5px] text-graphite-500 mt-0.5 truncate">
                          {inv.number} · {formatDate(inv.date)}
                        </p>
                      </div>
                      <span className="text-[14px] font-semibold text-graphite-900 tabular shrink-0">
                        {formatCurrency(inv.total)}
                      </span>
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </AppShell>
  );
}
