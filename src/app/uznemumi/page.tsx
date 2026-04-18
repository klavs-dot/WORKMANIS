"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Plus, Receipt, Repeat, TrendingUp, Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { companies, invoices, subscriptions } from "@/lib/mock";
import { formatCurrency, cn } from "@/lib/utils";
import { useCompany } from "@/lib/company-context";

export default function UznemumiPage() {
  const router = useRouter();
  const { activeCompany, setActiveCompany } = useCompany();

  const handleSelect = (id: string) => {
    setActiveCompany(id);
    router.push("/parskats");
  };

  const companyDetails = companies.map((c) => {
    const companyInvoices = invoices.filter((i) => i.companyId === c.id);
    const unpaid = companyInvoices.filter((i) => i.status !== "apmaksāts");
    const subs = subscriptions.filter(
      (s) => s.companyId === c.id && s.status === "aktīvs"
    );
    const monthlyFromSubs = subs.reduce((sum, s) => {
      if (s.periodicity === "mēnesis") return sum + s.price;
      if (s.periodicity === "gads") return sum + s.price / 12;
      return sum + s.price / 3;
    }, 0);
    return {
      ...c,
      invoicesCount: companyInvoices.length,
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((s, i) => s + i.total, 0),
      subscriptionsCount: subs.length,
      monthlyFromSubs,
    };
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Uzņēmumi"
          description="Pārvaldiet visus uzņēmumus vienuviet"
          actions={
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Pievienot uzņēmumu
            </Button>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          {companyDetails.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: i * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Card className={cn(
                "p-6 hover:shadow-soft-md transition-all group",
                activeCompany?.id === c.id && "ring-1 ring-emerald-500/40 shadow-soft-sm"
              )}>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-graphite-900 text-white text-[13px] font-semibold shadow-soft-sm">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-semibold tracking-tight text-graphite-900">
                        {c.name}
                      </h3>
                      <p className="text-[11.5px] text-graphite-500 mt-0.5">
                        {c.legalName}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-graphite-300 group-hover:text-graphite-900 group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="flex gap-1.5 mb-5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-graphite-50 border border-graphite-100 px-2 py-0.5 text-[10.5px] font-mono text-graphite-600">
                    {c.regNumber}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-graphite-50 border border-graphite-100 px-2 py-0.5 text-[10.5px] font-mono text-graphite-600">
                    {c.vatNumber}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-5 border-t border-graphite-100">
                  <div>
                    <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                      <Receipt className="h-2.5 w-2.5" />
                      Aktīvie rēķini
                    </div>
                    <p className="mt-1.5 text-[20px] font-semibold tabular tracking-tight text-graphite-900">
                      {c.unpaidCount}
                    </p>
                    {c.unpaidTotal > 0 && (
                      <p className="text-[11px] text-graphite-500 tabular">
                        {formatCurrency(c.unpaidTotal)}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                      <Repeat className="h-2.5 w-2.5" />
                      Abonementi
                    </div>
                    <p className="mt-1.5 text-[20px] font-semibold tabular tracking-tight text-graphite-900">
                      {c.subscriptionsCount}
                    </p>
                    <p className="text-[11px] text-graphite-500">aktīvi</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                      <TrendingUp className="h-2.5 w-2.5" />
                      Mēneša
                    </div>
                    <p className="mt-1.5 text-[20px] font-semibold tabular tracking-tight text-graphite-900">
                      {formatCurrency(c.monthlyFromSubs).replace(/,\d+/, "")}
                    </p>
                    <p className="text-[11px] text-graphite-500">izmaksas</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  {activeCompany?.id === c.id ? (
                    <Button
                      variant="secondary"
                      size="default"
                      className="flex-1"
                      disabled
                    >
                      <Check className="h-3.5 w-3.5" />
                      Izvēlēts
                    </Button>
                  ) : (
                    <Button
                      variant="success"
                      size="default"
                      className="flex-1"
                      onClick={() => handleSelect(c.id)}
                    >
                      Izvēlēties
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="default">
                    Iestatījumi
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
