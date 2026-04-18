"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Receipt, Repeat, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { companies, invoices, subscriptions } from "@/lib/mock";
import { formatCurrency } from "@/lib/utils";
import { useCompany } from "@/lib/company-context";

export default function CompanySelectorPage() {
  const router = useRouter();
  const { activeCompany, setActiveCompany, hydrated } = useCompany();

  // If user already has a selection, send them straight to dashboard
  useEffect(() => {
    if (hydrated && activeCompany) {
      router.replace("/parskats");
    }
  }, [hydrated, activeCompany, router]);

  const handleSelect = (id: string) => {
    setActiveCompany(id);
    router.push("/parskats");
  };

  const companyDetails = companies.map((c) => {
    const compInvoices = invoices.filter((i) => i.companyId === c.id);
    const unpaid = compInvoices.filter((i) => i.status !== "apmaksāts");
    const subs = subscriptions.filter(
      (s) => s.companyId === c.id && s.status === "aktīvs"
    );
    const monthly = subs.reduce((sum, s) => {
      if (s.periodicity === "mēnesis") return sum + s.price;
      if (s.periodicity === "gads") return sum + s.price / 12;
      return sum + s.price / 3;
    }, 0);
    return {
      ...c,
      invoicesCount: compInvoices.length,
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((s, i) => s + i.total, 0),
      subscriptionsCount: subs.length,
      monthly,
    };
  });

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-subtle bg-grain">
      {/* Top brand bar */}
      <header className="border-b border-graphite-100 bg-white/60 backdrop-blur-sm">
        <div className="mx-auto max-w-[1280px] px-6 lg:px-10 h-16 flex items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-graphite-900 shadow-soft-xs">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 8L12 3L20 8V16L12 21L4 16V8Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 8L12 13M12 13L20 8M12 13V21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-graphite-900">
                WORKMANIS
              </span>
              <span className="text-[10.5px] text-graphite-400 mt-0.5">
                Uzņēmumu pārvaldība
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-[1280px] px-6 lg:px-10 py-12 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="text-[12.5px] font-medium uppercase tracking-wider text-graphite-500 mb-3">
            Sākums
          </p>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-tight text-graphite-900 text-display-lg leading-[1.1]">
            Izvēlieties uzņēmumu
          </h1>
          <p className="mt-3 text-[15px] text-graphite-500 max-w-lg leading-relaxed">
            Sāciet sesiju ar vienu no uzņēmumiem. Visi rēķini, abonementi un maksājumi tiks rādīti šim uzņēmumam.
          </p>
        </motion.div>

        {/* Company cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          {companyDetails.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.1 + i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Card className="p-6 hover:shadow-soft-md transition-all group h-full flex flex-col">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-900 text-white text-[14px] font-semibold shadow-soft-sm">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-[17px] font-semibold tracking-tight text-graphite-900">
                        {c.name}
                      </h3>
                      <p className="text-[12px] text-graphite-500 mt-0.5">
                        {c.legalName}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 mb-5">
                  <span className="inline-flex items-center rounded-md bg-graphite-50 border border-graphite-100 px-2 py-0.5 text-[10.5px] font-mono text-graphite-600">
                    {c.regNumber}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-graphite-50 border border-graphite-100 px-2 py-0.5 text-[10.5px] font-mono text-graphite-600">
                    {c.vatNumber}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 py-5 border-y border-graphite-100">
                  <div>
                    <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                      <Receipt className="h-2.5 w-2.5" />
                      Rēķini
                    </div>
                    <p className="mt-1.5 text-[20px] font-semibold tabular tracking-tight text-graphite-900">
                      {c.unpaidCount}
                    </p>
                    {c.unpaidTotal > 0 && (
                      <p className="text-[11px] text-graphite-500 tabular">
                        {formatCurrency(c.unpaidTotal).replace(/,\d+/, "")}
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
                      {formatCurrency(c.monthly).replace(/,\d+/, "")}
                    </p>
                    <p className="text-[11px] text-graphite-500">izmaksas</p>
                  </div>
                </div>

                <div className="mt-5">
                  <Button
                    variant="success"
                    size="lg"
                    className="w-full"
                    onClick={() => handleSelect(c.id)}
                  >
                    Izvēlēties
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Add new company */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-8 flex items-center justify-center"
        >
          <button className="inline-flex items-center gap-2 text-[13px] text-graphite-500 hover:text-graphite-900 transition-colors px-3 py-2 rounded-lg hover:bg-graphite-100">
            <Plus className="h-3.5 w-3.5" />
            Pievienot jaunu uzņēmumu
          </button>
        </motion.div>
      </main>
    </div>
  );
}
