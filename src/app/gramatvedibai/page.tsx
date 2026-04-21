"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  FileSpreadsheet,
  FileText,
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
  ArrowUpFromLine,
  ArrowDownToLine,
  Plus,
  Sun,
  UserPlus,
  UserMinus,
  AlertCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useBilling } from "@/lib/billing-store";
import {
  useOrders,
  orderTypeLabel,
  shortOrderTypeLabel,
  type Order,
  type OrderType,
} from "@/lib/orders-store";
import { useEmployees } from "@/lib/employees-store";
import {
  useDocuments,
  documentTypeLabel,
  type BusinessDocument,
  type DocumentType,
} from "@/lib/documents-store";
import { DocumentModal } from "@/components/business/document-modal";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

type TabKey =
  | "eksporti"
  | "celazīmes"
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
            {tab === "rikojumi" && <RikojumiTab />}
            {tab === "zinojumi" && <ZinojumiTab />}
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
  const { received, issued } = useBilling();

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
    const out = received.filter((p) => inRange(p.dueDate));
    const inc = issued.filter((i) => inRange(i.date));
    return { out, inc };
  }, [received, issued, range]);

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
          Atsevišķi eksporti
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ExportCard
            title="Izejošie rēķini"
            description="Mūsu izrakstītie rēķini klientiem · PDF faili + Excel kopsavilkums"
            count={filtered.out.length}
            icon={ArrowUpFromLine}
            tone="emerald"
          />
          <ExportCard
            title="Ienākošie rēķini"
            description="Saņemtie rēķini no piegādātājiem · PDF faili + Excel kopsavilkums"
            count={filtered.inc.length}
            icon={ArrowDownToLine}
            tone="red"
          />
          <ExportCard
            title="Rēķinu skaidrojumi"
            description="Grāmatvedības skaidrojumi un kategorijas — ar saitēm uz attiecīgajiem rēķiniem"
            count={filtered.out.filter((p) => !!p.accountingMeta).length}
            icon={FileSpreadsheet}
            tone="violet"
          />
          <ExportCard
            title="Ceļa zīmes"
            description="Ceļa zīmes ar maršrutiem un atskaitēm"
            count={0}
            icon={Route}
            tone="sky"
          />
          <ExportCard
            title="Komandējumi un rīkojumi"
            description="Komandējumu rīkojumi, citi rīkojumi un to pielikumi"
            count={0}
            icon={ClipboardList}
            tone="amber"
          />
          <ExportCard
            title="Līgumi"
            description="Aktuālie un periodā parakstītie līgumi — klientu, piegādātāju, darbinieku"
            count={0}
            icon={FileSignature}
            tone="graphite"
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
            Lejupielādēt visus dokumentus atlasītajā periodā
          </h3>
          <p className="mt-0.5 text-[12.5px] text-white/70">
            {count > 0 ? (
              <>
                {count} dokument{count === 1 ? "s" : "i"} periodā ·{" "}
                {periodLabel.toLowerCase()}. ZIP arhīvs ar visiem PDF
                failiem, Excel kopsavilkumu un grāmatvedības skaidrojumiem.
              </>
            ) : (
              <>
                Nav dokumentu atlasītajā periodā ({periodLabel.toLowerCase()}).
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
  count,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  icon: LucideIcon;
  tone: "violet" | "graphite" | "emerald" | "sky" | "amber" | "red";
}) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  const run = () => {
    if (state !== "idle" || count === 0) return;
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
    red: "bg-red-50 text-red-600 border-red-100",
  };

  const isEmpty = count === 0;

  return (
    <Card
      className={cn(
        "p-4 transition-all",
        isEmpty
          ? "opacity-60 cursor-not-allowed"
          : "cursor-pointer hover:shadow-soft-sm hover:border-graphite-300"
      )}
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
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium tabular">
            <span className="text-graphite-400 uppercase tracking-wider text-[9.5px] font-semibold">
              Failu daudzums:
            </span>
            <span
              className={cn(
                "tabular",
                isEmpty ? "text-graphite-400" : "text-graphite-900"
              )}
            >
              {count}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          {state === "running" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-graphite-400" />
          )}
          {state === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {state === "idle" && (
            <Download
              className={cn(
                "h-3.5 w-3.5",
                isEmpty ? "text-graphite-300" : "text-graphite-400"
              )}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// ZINOJUMI TAB — applications, statements, notices with PDF generation
// ============================================================

function ZinojumiTab() {
  const { documents, addDocument, updateDocument, deleteDocument } =
    useDocuments();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessDocument | null>(null);
  const [toDelete, setToDelete] = useState<BusinessDocument | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (d: BusinessDocument) => {
    setEditing(d);
    setModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Ziņojumi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {documents.length === 0
              ? "Iesniegumi, paskaidrojumi un ziņojumi"
              : `${documents.length} dokument${documents.length === 1 ? "s" : "i"} reģistrā`}
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Jauns ziņojums
        </Button>
      </div>

      {documents.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareText}
            title="Vēl nav neviena dokumenta"
            description="Izveido iesniegumu, paskaidrojumu vai ziņojumu ar automātisku PDF ģenerēšanu un izvēli starp LAT/ENG valodām."
            action={
              <Button size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                Jauns ziņojums
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nosaukums</TableHead>
                <TableHead>Tips</TableHead>
                <TableHead>Datums</TableHead>
                <TableHead>No → Adresēts</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {documents.map((d) => (
                  <motion.tr
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-b border-graphite-100 hover:bg-graphite-50/60 cursor-pointer"
                    onClick={() => openEdit(d)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                          <DocumentTypeIcon type={d.type} />
                        </div>
                        <div className="flex flex-col leading-tight min-w-0">
                          <span className="font-medium text-graphite-900 truncate">
                            {d.title}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider text-graphite-400 font-semibold mt-0.5">
                            {d.language === "lv" ? "LAT" : "ENG"}
                            {!d.hasPhysicalSignature && (
                              <span className="ml-1.5 text-violet-500">
                                · e-paraksts
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DocumentTypeBadge type={d.type} />
                    </TableCell>
                    <TableCell className="text-graphite-600 tabular text-[12.5px]">
                      {d.documentDate ? (
                        formatDate(d.documentDate)
                      ) : (
                        <span className="text-graphite-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-graphite-600 max-w-[320px]">
                      <span className="text-[12px] truncate block">
                        <span className="text-graphite-700">
                          {d.sender.displayName}
                        </span>
                        <span className="text-graphite-400 mx-1">→</span>
                        <span className="text-graphite-700">
                          {d.recipient.displayName}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setToDelete(d)}
                        title="Dzēst dokumentu"
                      >
                        <X className="h-3.5 w-3.5 text-graphite-400" />
                      </Button>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </Card>
      )}

      <DocumentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSubmit={(data) => {
          if (editing) updateDocument(editing.id, data);
          else addDocument(data);
          setModalOpen(false);
        }}
      />

      <Dialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst dokumentu?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies dzēst dokumentu{" "}
              <span className="font-medium text-graphite-900">
                {toDelete?.title}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToDelete(null)}
            >
              Atcelt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (toDelete) deleteDocument(toDelete.id);
                setToDelete(null);
              }}
            >
              Dzēst
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Document type icon + badge ----------

function DocumentTypeIcon({ type }: { type: DocumentType }) {
  const Icon =
    type === "iesniegums"
      ? FileText
      : type === "paskaidrojums"
        ? AlertCircle
        : MessageSquareText;
  return <Icon className="h-3 w-3" />;
}

function DocumentTypeBadge({ type }: { type: DocumentType }) {
  const tones: Record<DocumentType, string> = {
    iesniegums: "bg-emerald-50 text-emerald-700 border-emerald-100",
    paskaidrojums: "bg-amber-50 text-amber-700 border-amber-100",
    zinojums: "bg-sky-50 text-sky-700 border-sky-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
        tones[type]
      )}
    >
      {documentTypeLabel(type, "lv")}
    </span>
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

// ============================================================
// RIKOJUMI TAB — full CRUD with type-specific modal
// ============================================================

function RikojumiTab() {
  const { orders, addOrder, updateOrder, deleteOrder } = useOrders();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [toDelete, setToDelete] = useState<Order | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (o: Order) => {
    setEditing(o);
    setModalOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Rīkojumi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {orders.length === 0
              ? "Vēl nav neviena rīkojuma"
              : `${orders.length} rīkojum${orders.length === 1 ? "s" : "i"} reģistrā`}
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Jauns rīkojums
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Vēl nav neviena rīkojuma"
            description="Pievieno rīkojumu par komandējumu, atvaļinājumu vai jebkuru citu lietvedības rīkojumu."
            action={
              <Button size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                Pievienot rīkojumu
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nosaukums</TableHead>
                <TableHead>Tips</TableHead>
                <TableHead>Datums</TableHead>
                <TableHead>Detaļas</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {orders.map((o) => (
                  <motion.tr
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-b border-graphite-100 hover:bg-graphite-50/60 cursor-pointer"
                    onClick={() => openEdit(o)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                          <OrderTypeIcon type={o.type} />
                        </div>
                        <span className="font-medium text-graphite-900">
                          {o.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <OrderTypeBadge type={o.type} />
                    </TableCell>
                    <TableCell className="text-graphite-600 tabular text-[12.5px]">
                      {o.issueDate ? formatDate(o.issueDate) : (
                        <span className="text-graphite-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-graphite-600 max-w-[320px]">
                      <OrderDetailsSummary order={o} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setToDelete(o)}
                        title="Dzēst rīkojumu"
                      >
                        <X className="h-3.5 w-3.5 text-graphite-400" />
                      </Button>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </Card>
      )}

      <OrderModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSubmit={(data) => {
          if (editing) updateOrder(editing.id, data);
          else addOrder(data);
          setModalOpen(false);
        }}
      />

      <Dialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst rīkojumu?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies dzēst rīkojumu{" "}
              <span className="font-medium text-graphite-900">
                {toDelete?.title}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToDelete(null)}
            >
              Atcelt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (toDelete) deleteOrder(toDelete.id);
                setToDelete(null);
              }}
            >
              Dzēst
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Order type icon + badge ----------

function OrderTypeIcon({ type }: { type: OrderType }) {
  const Icon =
    type === "komandejums"
      ? Plane
      : type === "atvalinajums"
        ? Sun
        : type === "darba_piesakums"
          ? UserPlus
          : type === "atlaisana"
            ? UserMinus
            : ClipboardList;
  return <Icon className="h-3 w-3" />;
}

function OrderTypeBadge({ type }: { type: OrderType }) {
  const tones: Record<OrderType, string> = {
    komandejums: "bg-sky-50 text-sky-700 border-sky-100",
    atvalinajums: "bg-amber-50 text-amber-700 border-amber-100",
    darba_piesakums: "bg-emerald-50 text-emerald-700 border-emerald-100",
    atlaisana: "bg-red-50 text-red-700 border-red-100",
    cits: "bg-graphite-50 text-graphite-700 border-graphite-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold",
        tones[type]
      )}
    >
      {shortOrderTypeLabel(type)}
    </span>
  );
}

function OrderDetailsSummary({ order }: { order: Order }) {
  if (order.type === "komandejums") {
    if (!order.tripStartDate || !order.tripEndDate) {
      return <span className="text-graphite-300 text-[12px]">Nav datu</span>;
    }
    return (
      <span className="text-[12px] tabular">
        {order.employeeName && (
          <span className="text-graphite-700">{order.employeeName} · </span>
        )}
        <span className="text-graphite-600">
          {order.destinationFrom || "—"} → {order.destinationTo || "—"}
        </span>
        <span className="text-graphite-400">
          {" "}
          ({formatDate(order.tripStartDate)} – {formatDate(order.tripEndDate)})
        </span>
      </span>
    );
  }
  if (order.type === "atvalinajums") {
    if (!order.vacationStartDate || !order.vacationEndDate) {
      return <span className="text-graphite-300 text-[12px]">Nav datu</span>;
    }
    return (
      <span className="text-[12px] tabular">
        {order.employeeName && (
          <span className="text-graphite-700">{order.employeeName} · </span>
        )}
        <span className="text-graphite-600">
          {formatDate(order.vacationStartDate)} – {formatDate(order.vacationEndDate)}
        </span>
        {order.vacationPayTiming && (
          <span className="text-graphite-400">
            {" · "}izmaksāt {order.vacationPayTiming === "before" ? "pirms" : "pēc"}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="line-clamp-1 text-[12px] text-graphite-500">
      {order.notes || <span className="text-graphite-300">—</span>}
    </span>
  );
}

// ============================================================
// Order modal — type-specific fields
// ============================================================

function OrderModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Order | null;
  onSubmit: (data: Omit<Order, "id" | "createdAt">) => void;
}) {
  const { employees } = useEmployees();

  const [type, setType] = useState<OrderType>("komandejums");
  const [title, setTitle] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("");

  // Trip
  const [destinationFrom, setDestinationFrom] = useState("");
  const [destinationTo, setDestinationTo] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");

  // Vacation
  const [vacationStartDate, setVacationStartDate] = useState("");
  const [vacationEndDate, setVacationEndDate] = useState("");
  const [vacationPayTiming, setVacationPayTiming] = useState<"before" | "after">(
    "before"
  );

  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setTitle(editing.title);
      setIssueDate(editing.issueDate);
      setEmployeeId(editing.employeeId ?? "");
      setDestinationFrom(editing.destinationFrom ?? "");
      setDestinationTo(editing.destinationTo ?? "");
      setTripStartDate(editing.tripStartDate ?? "");
      setTripEndDate(editing.tripEndDate ?? "");
      setVacationStartDate(editing.vacationStartDate ?? "");
      setVacationEndDate(editing.vacationEndDate ?? "");
      setVacationPayTiming(editing.vacationPayTiming ?? "before");
      setNotes(editing.notes ?? "");
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setType("komandejums");
      setTitle("");
      setIssueDate(today);
      setEmployeeId("");
      setDestinationFrom("");
      setDestinationTo("");
      setTripStartDate("");
      setTripEndDate("");
      setVacationStartDate("");
      setVacationEndDate("");
      setVacationPayTiming("before");
      setNotes("");
    }
  }, [open, editing]);

  const submit = () => {
    if (!title.trim() || !issueDate) return;
    const employee = employees.find((e) => e.id === employeeId);
    const base = {
      type,
      title: title.trim(),
      issueDate,
      employeeId: employee?.id,
      employeeName: employee
        ? `${employee.firstName} ${employee.lastName}`
        : undefined,
      notes: notes.trim() || undefined,
    } as Omit<Order, "id" | "createdAt">;

    if (type === "komandejums") {
      onSubmit({
        ...base,
        destinationFrom: destinationFrom.trim() || undefined,
        destinationTo: destinationTo.trim() || undefined,
        tripStartDate: tripStartDate || undefined,
        tripEndDate: tripEndDate || undefined,
      });
    } else if (type === "atvalinajums") {
      onSubmit({
        ...base,
        vacationStartDate: vacationStartDate || undefined,
        vacationEndDate: vacationEndDate || undefined,
        vacationPayTiming,
      });
    } else {
      onSubmit(base);
    }
  };

  const valid = title.trim().length > 0 && issueDate.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot rīkojumu" : "Jauns rīkojums"}
          </DialogTitle>
          <DialogDescription>
            Izvēlies rīkojuma tipu un aizpildi atbilstošos datus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>
              Rīkojuma tips <span className="text-red-500">*</span>
            </Label>
            <Select value={type} onValueChange={(v) => setType(v as OrderType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="komandejums">
                  {orderTypeLabel("komandejums")}
                </SelectItem>
                <SelectItem value="atvalinajums">
                  {orderTypeLabel("atvalinajums")}
                </SelectItem>
                <SelectItem value="darba_piesakums">
                  {orderTypeLabel("darba_piesakums")}
                </SelectItem>
                <SelectItem value="atlaisana">
                  {orderTypeLabel("atlaisana")}
                </SelectItem>
                <SelectItem value="cits">{orderTypeLabel("cits")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Nosaukums <span className="text-red-500">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="piem. Komandējums uz Berlīni — IDEX 2026"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Rīkojuma datums <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Employee picker for trip / vacation */}
          {(type === "komandejums" || type === "atvalinajums" ||
            type === "darba_piesakums" || type === "atlaisana") && (
            <div className="space-y-1.5">
              <Label>Darbinieks</Label>
              {employees.length === 0 ? (
                <div className="rounded-lg border border-dashed border-graphite-200 px-3 py-2.5 text-[12px] text-graphite-500">
                  Vēl nav pievienots neviens darbinieks. Pievieno tos sadaļā{" "}
                  <span className="font-medium text-graphite-700">
                    Darbinieki
                  </span>
                  .
                </div>
              ) : (
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Izvēlies darbinieku…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                        {e.position && (
                          <span className="text-graphite-400 text-[11px]">
                            {" · "}
                            {e.position}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Type-specific section: KOMANDEJUMS */}
          {type === "komandejums" && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3 space-y-3">
              <div className="text-[10.5px] uppercase tracking-wider text-sky-700 font-semibold flex items-center gap-1.5">
                <Plane className="h-3 w-3" />
                Komandējuma detaļas
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>No vietas</Label>
                  <Input
                    value={destinationFrom}
                    onChange={(e) => setDestinationFrom(e.target.value)}
                    placeholder="piem. Liepāja"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Uz vietu</Label>
                  <Input
                    value={destinationTo}
                    onChange={(e) => setDestinationTo(e.target.value)}
                    placeholder="piem. Berlīne"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sākuma datums (ieskaitot)</Label>
                  <Input
                    type="date"
                    value={tripStartDate}
                    onChange={(e) => setTripStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Beigu datums (ieskaitot)</Label>
                  <Input
                    type="date"
                    value={tripEndDate}
                    onChange={(e) => setTripEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Type-specific section: ATVALINAJUMS */}
          {type === "atvalinajums" && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 space-y-3">
              <div className="text-[10.5px] uppercase tracking-wider text-amber-700 font-semibold flex items-center gap-1.5">
                <Sun className="h-3 w-3" />
                Atvaļinājuma detaļas
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sākuma datums (ieskaitot)</Label>
                  <Input
                    type="date"
                    value={vacationStartDate}
                    onChange={(e) => setVacationStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Beigu datums (ieskaitot)</Label>
                  <Input
                    type="date"
                    value={vacationEndDate}
                    onChange={(e) => setVacationEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Atvaļinājuma maksas izmaksas laiks</Label>
                <div className="inline-flex rounded-lg bg-white border border-amber-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setVacationPayTiming("before")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md transition-colors",
                      vacationPayTiming === "before"
                        ? "bg-amber-600 text-white"
                        : "text-amber-700 hover:bg-amber-50"
                    )}
                  >
                    Pirms atvaļinājuma
                  </button>
                  <button
                    type="button"
                    onClick={() => setVacationPayTiming("after")}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium rounded-md transition-colors",
                      vacationPayTiming === "after"
                        ? "bg-amber-600 text-white"
                        : "text-amber-700 hover:bg-amber-50"
                    )}
                  >
                    Pēc atvaļinājuma
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Piezīmes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Papildinformācija, mērķis, paskaidrojumi…"
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-graphite-100 mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
