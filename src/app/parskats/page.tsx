"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Clock,
  Users,
  IdCard,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Card } from "@/components/ui/card";
import { useCompany } from "@/lib/company-context";
import { useBilling } from "@/lib/billing-store";
import { useClients } from "@/lib/clients-store";
import { useEmployees } from "@/lib/employees-store";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { activeCompany, hydrated } = useCompany();
  const { incoming, outgoing } = useBilling();
  const { clients } = useClients();
  const { employees } = useEmployees();

  useEffect(() => {
    if (hydrated && !activeCompany) {
      router.replace("/");
    }
  }, [hydrated, activeCompany, router]);

  // ─── Derived data ───
  const data = useMemo(() => {
    // Saņemtie maksājumi: ienākošie rēķini, ko klients samaksāja mums
    const receivedPayments = [...incoming]
      .filter((i) => i.status === "apmaksats")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 10);

    // Samaksātie maksājumi: izejošie rēķini, ko mēs samaksājām piegādātājiem
    const paidPayments = [...outgoing]
      .filter((p) => p.status === "apmaksats")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 10);

    // Jāapstiprina bankā: outgoing kas vēl nav apmaksāti
    const pendingBankConfirm = outgoing.filter(
      (p) => p.status === "apstiprinat_banka"
    );
    const pendingBankConfirmTotal = pendingBankConfirm.reduce(
      (s, p) => s + p.amount,
      0
    );

    // Gaidāmie maksājumi: incoming kas vēl nav samaksāti
    const expectedPayments = incoming.filter(
      (i) => i.status === "gaidam_apmaksu" || i.status === "kave_maksajumu"
    );
    const expectedPaymentsTotal = expectedPayments.reduce(
      (s, i) => s + i.amount,
      0
    );

    // Aktīvi darbinieki (nav atlaisti)
    const activeEmployees = employees.filter((e) => e.status !== "atlaists");

    // Aktīvi klienti
    const activeClients = clients.filter((c) => c.status === "aktivs");

    return {
      receivedPayments,
      paidPayments,
      pendingBankConfirmCount: pendingBankConfirm.length,
      pendingBankConfirmTotal,
      expectedPaymentsCount: expectedPayments.length,
      expectedPaymentsTotal,
      activeEmployeesCount: activeEmployees.length,
      activeClientsCount: activeClients.length,
    };
  }, [incoming, outgoing, employees, clients]);

  if (!hydrated || !activeCompany) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Pārskats"
          description={`Aktuālā situācija uzņēmumā ${activeCompany.name}`}
        />

        {/* ─── Status summary tiles ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryTile
            icon={Landmark}
            tone="amber"
            label="Jāapstiprina bankā"
            count={data.pendingBankConfirmCount}
            total={data.pendingBankConfirmTotal}
            delay={0}
          />
          <SummaryTile
            icon={Clock}
            tone="sky"
            label="Gaidāmi maksājumi"
            count={data.expectedPaymentsCount}
            total={data.expectedPaymentsTotal}
            delay={0.05}
          />
        </div>

        {/* ─── Recent payment lists ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <PaymentList
            title="Pēdējie saņemtie maksājumi"
            description="Klientu samaksāti rēķini"
            icon={ArrowDownToLine}
            iconTone="emerald"
            items={data.receivedPayments.map((i) => ({
              id: i.id,
              counterparty: i.client,
              reference: i.number,
              date: i.createdAt,
              amount: i.amount,
            }))}
            emptyText="Vēl nav saņemtu maksājumu"
            delay={0.1}
          />
          <PaymentList
            title="Pēdējie samaksātie maksājumi"
            description="Mūsu samaksātie rēķini piegādātājiem"
            icon={ArrowUpFromLine}
            iconTone="graphite"
            items={data.paidPayments.map((p) => ({
              id: p.id,
              counterparty: p.supplier,
              reference: p.invoiceNumber,
              date: p.createdAt,
              amount: p.amount,
            }))}
            emptyText="Vēl nav samaksātu maksājumu"
            delay={0.15}
          />
        </div>

        {/* ─── Company stats ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatLine
            icon={IdCard}
            label="Uzņēmumā strādā"
            value={data.activeEmployeesCount}
            unit={pluralize(
              data.activeEmployeesCount,
              "darbinieks",
              "darbinieki",
              "darbinieku"
            )}
            delay={0.2}
          />
          <StatLine
            icon={Users}
            label="Uzņēmumam ir"
            value={data.activeClientsCount}
            unit={pluralize(
              data.activeClientsCount,
              "klients",
              "klienti",
              "klientu"
            )}
            delay={0.25}
          />
        </div>
      </div>
    </AppShell>
  );
}

// ============================================================
// SummaryTile — count + total
// ============================================================

function SummaryTile({
  icon: Icon,
  tone,
  label,
  count,
  total,
  delay,
}: {
  icon: typeof Landmark;
  tone: "amber" | "sky";
  label: string;
  count: number;
  total: number;
  delay: number;
}) {
  const tones = {
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-100",
    },
    sky: {
      bg: "bg-sky-50",
      text: "text-sky-700",
      border: "border-sky-100",
    },
  } as const;
  const t = tones[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
              t.bg,
              t.text,
              t.border
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] uppercase tracking-wider font-medium text-graphite-500">
              {label}
            </p>
            <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
              <span className="text-[28px] font-semibold tracking-tight text-graphite-900 tabular leading-none">
                {count}
              </span>
              <span className="text-[12.5px] text-graphite-500">
                par kopējo summu
              </span>
              <span className="text-[15px] font-semibold tabular text-graphite-900">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ============================================================
// PaymentList
// ============================================================

interface PaymentListItem {
  id: string;
  counterparty: string;
  reference: string;
  date: string;
  amount: number;
}

function PaymentList({
  title,
  description,
  icon: Icon,
  iconTone,
  items,
  emptyText,
  delay,
}: {
  title: string;
  description: string;
  icon: typeof ArrowDownToLine;
  iconTone: "emerald" | "graphite";
  items: PaymentListItem[];
  emptyText: string;
  delay: number;
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    graphite: "bg-graphite-100 text-graphite-700 border-graphite-200",
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden h-full flex flex-col">
        <div className="p-5 border-b border-graphite-100 flex items-start gap-3">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
              tones[iconTone]
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-graphite-900">
              {title}
            </h2>
            <p className="mt-0.5 text-[12px] text-graphite-500">
              {description}
            </p>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="p-12 text-center text-[12.5px] text-graphite-500">
            {emptyText}
          </div>
        ) : (
          <div className="divide-y divide-graphite-100">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-graphite-50/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-graphite-900 truncate">
                    {item.counterparty}
                  </p>
                  <p className="text-[11px] text-graphite-500 mt-0.5 truncate">
                    {item.reference} · {formatDate(item.date)}
                  </p>
                </div>
                <span className="text-[13.5px] font-semibold tabular text-graphite-900 shrink-0">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ============================================================
// StatLine
// ============================================================

function StatLine({
  icon: Icon,
  label,
  value,
  unit,
  delay,
}: {
  icon: typeof IdCard;
  label: string;
  value: number;
  unit: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="p-5 flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-graphite-50 border border-graphite-200 text-graphite-700">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        <p className="text-[14px] text-graphite-700 leading-snug">
          {label}{" "}
          <span className="text-[20px] font-semibold tracking-tight text-graphite-900 tabular align-baseline">
            {value}
          </span>{" "}
          {unit}
        </p>
      </Card>
    </motion.div>
  );
}

// ============================================================
// Latvian pluralization
// ============================================================

/**
 * Latvian noun pluralization based on count:
 * - 1 → singular nominative ("klients")
 * - 2-9, ending in 2-9 → plural nominative ("klienti")
 * - 0, 10-19, ending in 0 → plural genitive ("klientu")
 *
 * Examples:
 *   1 klients, 2 klienti, 5 klienti, 10 klientu, 21 klients,
 *   25 klienti, 30 klientu
 */
function pluralize(
  n: number,
  one: string,
  fewMany: string,
  zeroOrMany: string
): string {
  const abs = Math.abs(n);
  const lastDigit = abs % 10;
  const lastTwoDigits = abs % 100;

  // Teens (11-19) and zero use the genitive
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return zeroOrMany;
  if (abs === 0) return zeroOrMany;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 9) return fewMany;
  return zeroOrMany;
}
