"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  FileSpreadsheet,
  FileText,
  FileCode2,
  Calendar,
  Sparkles,
  CheckCircle2,
  Loader2,
  Route,
  Plane,
  ClipboardList,
  MessageSquareText,
  FileSignature,
  FolderKanban,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBilling } from "@/lib/billing-store";
import { formatCurrency, cn } from "@/lib/utils";

type TabKey =
  | "eksporti"
  | "celazīmes"
  | "komandejumi"
  | "rikojumi"
  | "zinojumi"
  | "ligumi"
  | "citi";

const tabs: {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "eksporti", label: "Eksporti", icon: Download },
  { key: "celazīmes", label: "Ceļa zīmes", icon: Route },
  { key: "komandejumi", label: "Komandējumi", icon: Plane },
  { key: "rikojumi", label: "Rīkojumi", icon: ClipboardList },
  { key: "zinojumi", label: "Ziņojumi", icon: MessageSquareText },
  { key: "ligumi", label: "Līgumi", icon: FileSignature },
  { key: "citi", label: "Citi", icon: FolderKanban },
];

export default function GramatvedibaiPage() {
  const [tab, setTab] = useState<TabKey>("eksporti");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Grāmatvedībai & Lietvedībai"
          description="Dokumentu un eksportu centrālā pārvaldība grāmatvedības un lietvedības vajadzībām"
        />

        {/* Segmented tabs */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div
            role="tablist"
            className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors focus:outline-none whitespace-nowrap",
                    isActive
                      ? "text-graphite-900"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="gramatvedibai-tabs-pill"
                      className="absolute inset-0 rounded-lg bg-white shadow-soft-xs border border-graphite-200/40"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "eksporti" && <EksportiTab />}
            {tab === "celazīmes" && (
              <PlaceholderTab
                title="Ceļa zīmes"
                description="Ceļa zīmju reģistrs un eksports grāmatvedībai"
                icon={Route}
              />
            )}
            {tab === "komandejumi" && (
              <PlaceholderTab
                title="Komandējumi"
                description="Komandējumu rīkojumi, atskaites un avansa norēķini"
                icon={Plane}
              />
            )}
            {tab === "rikojumi" && (
              <PlaceholderTab
                title="Rīkojumi"
                description="Rīkojumu reģistrs — personāla, finanšu, saimnieciskie"
                icon={ClipboardList}
              />
            )}
            {tab === "zinojumi" && (
              <PlaceholderTab
                title="Ziņojumi"
                description="Paskaidrojumi, iesniegumi, ziņojumi"
                icon={MessageSquareText}
              />
            )}
            {tab === "ligumi" && (
              <PlaceholderTab
                title="Līgumi"
                description="Aktīvie un arhīva līgumi — klientu, piegādātāju, darbinieku"
                icon={FileSignature}
              />
            )}
            {tab === "citi" && (
              <PlaceholderTab
                title="Citi dokumenti"
                description="Citi grāmatvedības dokumenti, kas neietilpst iepriekšējās kategorijās"
                icon={FolderKanban}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

// ============================================================
// EKSPORTI TAB — period selector + export action cards
// ============================================================

type Period =
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";

const periodLabels: Record<Period, string> = {
  today: "Šodien",
  week: "Šī nedēļa",
  month: "Šis mēnesis",
  quarter: "Šis ceturksnis",
  year: "Šis gads",
  custom: "Pielāgots diapazons",
};

function EksportiTab() {
  const { outgoing, incoming } = useBilling();

  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => computeRange(period, customFrom, customTo), [
    period,
    customFrom,
    customTo,
  ]);

  // Filter invoices by the selected range
  const filtered = useMemo(() => {
    const inRange = (dateStr: string) => {
      if (!range) return true;
      const d = dateStr.slice(0, 10);
      return d >= range.from && d <= range.to;
    };
    const out = outgoing.filter((p) => inRange(p.dueDate));
    const inc = incoming.filter((i) => inRange(i.date));
    return { out, inc };
  }, [outgoing, incoming, range]);

  const totalIncoming = filtered.inc.reduce(
    (s, i) => s + i.amount + i.vat,
    0
  );
  const totalOutgoing = filtered.out.reduce((s, p) => s + p.amount, 0);
  const totalCount = filtered.out.length + filtered.inc.length;

  return (
    <div className="space-y-6">
      {/* Period summary card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[200px] flex-1">
            <Label className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-graphite-400" />
              Periods
            </Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(periodLabels) as Period[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {periodLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label>No</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Līdz</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </>
          )}

          {range && (
            <div className="text-[11.5px] text-graphite-500 tabular">
              <div className="uppercase tracking-wider text-[10px] font-semibold mb-1">
                Diapazons
              </div>
              <div>
                {range.from} &nbsp;→&nbsp; {range.to}
              </div>
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-graphite-100">
          <StatPill
            label="Rēķini kopā"
            value={`${totalCount}`}
            tone="graphite"
          />
          <StatPill
            label="Ienākošie (mums)"
            value={formatCurrency(totalIncoming)}
            tone="emerald"
          />
          <StatPill
            label="Izejošie (mēs maksājam)"
            value={formatCurrency(totalOutgoing)}
            tone="red"
          />
        </div>
      </Card>

      {/* Primary action — download all invoices for period */}
      <PrimaryExportCard
        count={totalCount}
        periodLabel={periodLabels[period]}
      />

      {/* Export action grid */}
      <div>
        <h3 className="text-[13px] font-semibold text-graphite-900 mb-3 tracking-tight flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          Papildu eksporti
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ExportCard
            title="Rēķinu saraksts (Excel)"
            description="Strukturēta tabula ar visiem rēķiniem periodā — izejošie un ienākošie."
            icon={FileSpreadsheet}
            tone="violet"
          />
          <ExportCard
            title="Kases operāciju atskaite"
            description="Visi kases un bankas ieņēmumi un izdevumi, apvienoti pa dienām."
            icon={FileText}
            tone="graphite"
          />
          <ExportCard
            title="PVN pārskats"
            description="PVN aprēķins par periodu — ienākošais, izejošais, maksājamais."
            icon={FileSpreadsheet}
            tone="emerald"
          />
          <ExportCard
            title="Grāmatvedības žurnāls (XML)"
            description="Eksports uz grāmatvedības sistēmām — Tildes Jumis, Zalktis, Horizon."
            icon={FileCode2}
            tone="sky"
          />
          <ExportCard
            title="Bankas izraksta atspoguļojums"
            description="Salīdzinājums ar bankas izrakstu — atrodi neatbilstības."
            icon={FileSpreadsheet}
            tone="amber"
          />
        </div>

        <p className="mt-5 text-[11.5px] text-graphite-400 leading-relaxed">
          Piezīme: nākotnē eksporti tiks automātiski sinhronizēti ar
          pieslēgtu Google Sheets darbgrāmatu; grāmatvedis redzēs datus
          reālā laikā bez manuāla lejupielādes soļa.
        </p>
      </div>
    </div>
  );
}

// ---------- Primary export CTA ----------

function PrimaryExportCard({
  count,
  periodLabel,
}: {
  count: number;
  periodLabel: string;
}) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  const run = () => {
    if (state !== "idle") return;
    setState("running");
    setTimeout(() => {
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    }, 1400);
  };

  return (
    <Card className="p-5 bg-gradient-to-br from-graphite-900 to-graphite-800 border-graphite-800 text-white">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/10 backdrop-blur">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">
            Lejupielādēt visus rēķinus
          </h3>
          <p className="mt-0.5 text-[12.5px] text-white/70">
            {count > 0 ? (
              <>
                {count} rēķin{count === 1 ? "s" : "i"} periodā ·{" "}
                {periodLabel.toLowerCase()}. ZIP arhīvs ar PDF failiem, Excel
                kopsavilkumu un attīstības komentāriem.
              </>
            ) : (
              <>
                Nav rēķinu atlasītajā periodā ({periodLabel.toLowerCase()}).
                Izvēlies citu laika diapazonu.
              </>
            )}
          </p>
        </div>
        <Button
          variant="default"
          size="default"
          onClick={run}
          disabled={count === 0 || state !== "idle"}
          className="bg-white text-graphite-900 hover:bg-graphite-100 shrink-0"
        >
          {state === "running" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sagatavo…
            </>
          ) : state === "done" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Gatavs
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              Lejupielādēt ZIP
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

// ---------- Stat pill ----------

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "graphite" | "emerald" | "red";
}) {
  const toneClasses: Record<typeof tone, string> = {
    graphite: "text-graphite-900",
    emerald: "text-emerald-600",
    red: "text-red-600",
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-graphite-500 mb-1">
        {label}
      </div>
      <div
        className={cn("text-[20px] font-semibold tabular tracking-tight", toneClasses[tone])}
      >
        {value}
      </div>
    </div>
  );
}

// ---------- Export card ----------

function ExportCard({
  title,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: "violet" | "graphite" | "emerald" | "sky" | "amber";
}) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  const run = () => {
    if (state !== "idle") return;
    setState("running");
    setTimeout(() => {
      setState("done");
      setTimeout(() => setState("idle"), 1800);
    }, 1100);
  };

  const toneBg: Record<typeof tone, string> = {
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    graphite: "bg-graphite-50 text-graphite-700 border-graphite-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    sky: "bg-sky-50 text-sky-600 border-sky-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  };

  return (
    <Card
      className="p-4 cursor-pointer transition-all hover:shadow-soft-sm hover:border-graphite-300"
      onClick={run}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            toneBg[tone]
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold text-graphite-900 tracking-tight">
            {title}
          </h4>
          <p className="mt-0.5 text-[11.5px] text-graphite-500 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="shrink-0">
          {state === "running" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-graphite-400" />
          )}
          {state === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {state === "idle" && (
            <Download className="h-3.5 w-3.5 text-graphite-400" />
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------- Placeholder tab for not-yet-implemented sections ----------

function PlaceholderTab({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <EmptyState
        icon={icon}
        title={title}
        description={`${description}. Šī sadaļa ir plānošanas stadijā — drīzumā varēsi reģistrēt, uzglabāt un eksportēt šos dokumentus.`}
        action={
          <Button variant="secondary" size="sm" disabled>
            <Sparkles className="h-3.5 w-3.5" />
            Drīzumā
          </Button>
        }
      />
    </Card>
  );
}

// ============================================================
// Period range computation
// ============================================================

function computeRange(
  period: Period,
  customFrom: string,
  customTo: string
): { from: string; to: string } | null {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === "custom") {
    if (customFrom && customTo) return { from: customFrom, to: customTo };
    return null;
  }

  if (period === "today") {
    const t = iso(today);
    return { from: t, to: t };
  }

  if (period === "week") {
    const day = today.getDay();
    // Monday-based week
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: iso(monday), to: iso(sunday) };
  }

  if (period === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: iso(first), to: iso(last) };
  }

  if (period === "quarter") {
    const q = Math.floor(today.getMonth() / 3);
    const first = new Date(today.getFullYear(), q * 3, 1);
    const last = new Date(today.getFullYear(), q * 3 + 3, 0);
    return { from: iso(first), to: iso(last) };
  }

  if (period === "year") {
    const first = new Date(today.getFullYear(), 0, 1);
    const last = new Date(today.getFullYear(), 11, 31);
    return { from: iso(first), to: iso(last) };
  }

  return null;
}
