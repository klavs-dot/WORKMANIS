"use client";

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  Download,
  Landmark,
  ArrowUpFromLine,
  ArrowDownToLine,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/lib/billing-store";
import { useCompany } from "@/lib/company-context";
import {
  generatePain001XML,
  parseBankStatementCSV,
  matchTransactionsToInvoices,
  type ParsedTransaction,
  type InvoiceMatch,
} from "@/lib/bank-exchange";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export function BankExchangePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { outgoing, markOutgoingPaid } = useBilling();
  const { activeCompany } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Export: selected payments to send to bank ───
  const unpaid = useMemo(
    () => outgoing.filter((p) => p.status !== "apmaksats"),
    [outgoing]
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportState, setExportState] = useState<"idle" | "downloading" | "done">(
    "idle"
  );

  const selectedItems = unpaid.filter((p) => selectedIds.has(p.id));
  const selectedTotal = selectedItems.reduce((s, p) => s + p.amount, 0);

  const toggleAll = () => {
    if (selectedIds.size === unpaid.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(unpaid.map((p) => p.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const downloadXML = () => {
    if (selectedItems.length === 0) return;
    setExportState("downloading");

    const xml = generatePain001XML(
      {
        debtorName: activeCompany?.legalName || activeCompany?.name || "Uzņēmums",
        debtorIban: activeCompany?.iban || "LV00NOTPROVIDED",
        requestedExecutionDate: new Date().toISOString().slice(0, 10),
      },
      selectedItems.map((p) => ({
        name: p.supplier,
        iban: p.iban,
        amount: p.amount,
        reference: p.invoiceNumber,
        remittance: `${p.invoiceNumber} ${p.supplier}`.trim(),
      }))
    );

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `payment-batch-${stamp}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportState("done");
    setTimeout(() => setExportState("idle"), 2400);
  };

  // ─── Import: parse uploaded CSV and match ───
  const [parsedTxs, setParsedTxs] = useState<ParsedTransaction[]>([]);
  const [matches, setMatches] = useState<InvoiceMatch[]>([]);
  const [importStage, setImportStage] = useState<"idle" | "review">("idle");

  const onFilePicked = async (file: File) => {
    const text = await file.text();
    const txs = parseBankStatementCSV(text);
    const m = matchTransactionsToInvoices(txs, unpaid);
    setParsedTxs(txs);
    setMatches(m);
    setImportStage("review");
  };

  const applyMatches = () => {
    let applied = 0;
    matches.forEach((m) => {
      if (m.invoiceId && m.confidence === "exact") {
        markOutgoingPaid(m.invoiceId);
        applied++;
      }
    });
    // Simple feedback — could be toast
    alert(`Atzīmēti kā apmaksāti: ${applied} rēķini`);
    setParsedTxs([]);
    setMatches([]);
    setImportStage("idle");
  };

  const exactCount = matches.filter((m) => m.confidence === "exact").length;
  const likelyCount = matches.filter((m) => m.confidence === "likely").length;
  const noneCount = matches.filter((m) => m.confidence === "none").length;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-graphite-900/30 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            className="fixed top-0 right-0 z-[70] h-full w-full max-w-xl bg-white border-l border-graphite-200 shadow-soft-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-graphite-100">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-graphite-900 text-white">
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold tracking-tight text-graphite-900">
                    Uz banku
                  </h2>
                  <p className="text-[12px] text-graphite-500 mt-0.5">
                    Sagatavo maksājumus un importē bankas izrakstu
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* ─── Section 1: Export ─── */}
              <section className="px-6 py-5 border-b border-graphite-100">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-600" />
                  <h3 className="text-[13px] font-semibold tracking-tight text-graphite-900">
                    Sagatavot maksājumu uzdevumu
                  </h3>
                </div>
                <p className="text-[11.5px] text-graphite-500 mb-3 leading-relaxed">
                  Izvēlies rēķinus → lejupielādē XML failu → augšupielādē savā
                  internetbankā kā batch maksājumu paketi. Darbojas ar SEB,
                  Swedbank, Citadele un Luminor.
                </p>

                {unpaid.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-graphite-200 bg-graphite-50/30 p-5 text-center text-[12px] text-graphite-500">
                    Nav neviena neapmaksāta rēķina
                  </div>
                ) : (
                  <div className="rounded-lg border border-graphite-200 overflow-hidden">
                    {/* Select all header */}
                    <div className="flex items-center gap-2 bg-graphite-50/60 border-b border-graphite-100 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === unpaid.length}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                      />
                      <span className="text-[11px] text-graphite-600 font-medium">
                        {selectedIds.size === 0
                          ? `Izvēlies no ${unpaid.length} neapmaksātiem`
                          : `${selectedIds.size} no ${unpaid.length} · ${formatCurrency(selectedTotal)}`}
                      </span>
                    </div>
                    {/* Rows */}
                    <div className="max-h-[240px] overflow-y-auto">
                      {unpaid.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2.5 px-3 py-2 border-b border-graphite-100 last:border-b-0 hover:bg-graphite-50/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleOne(p.id)}
                            className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 justify-between">
                              <span className="text-[12.5px] font-medium text-graphite-900 truncate">
                                {p.supplier}
                              </span>
                              <span className="text-[12.5px] font-semibold text-graphite-900 tabular shrink-0">
                                {formatCurrency(p.amount)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10.5px] text-graphite-500 mt-0.5">
                              <span className="font-mono truncate">
                                {p.invoiceNumber}
                              </span>
                              <span>·</span>
                              <span className="tabular">{formatDate(p.dueDate)}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    onClick={downloadXML}
                    disabled={selectedItems.length === 0 || exportState !== "idle"}
                  >
                    {exportState === "done" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Lejupielādēts
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Lejupielādēt XML bankai
                      </>
                    )}
                  </Button>
                </div>
              </section>

              {/* ─── Section 2: Import ─── */}
              <section className="px-6 py-5">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-sky-600" />
                  <h3 className="text-[13px] font-semibold tracking-tight text-graphite-900">
                    Importēt bankas izrakstu
                  </h3>
                </div>
                <p className="text-[11.5px] text-graphite-500 mb-3 leading-relaxed">
                  Lejupielādē CSV izrakstu no savas internetbankas un augšupielādē
                  to šeit. Sistēma automātiski atrod, kuri rēķini tika apmaksāti.
                </p>

                {importStage === "idle" && (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border-2 border-dashed border-graphite-200 bg-graphite-50/40 p-6 text-center cursor-pointer hover:border-graphite-300 hover:bg-graphite-50 transition-colors"
                    >
                      <Upload className="h-5 w-5 text-graphite-400 mx-auto mb-2" />
                      <p className="text-[12.5px] font-medium text-graphite-900">
                        Ievelc CSV failu vai spied izvēlēties
                      </p>
                      <p className="text-[10.5px] text-graphite-500 mt-0.5">
                        SEB · Swedbank · Citadele · Luminor
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onFilePicked(f);
                        }}
                      />
                    </div>
                  </>
                )}

                {importStage === "review" && (
                  <div className="space-y-3">
                    {/* Summary pills */}
                    <div className="grid grid-cols-3 gap-2">
                      <SummaryPill
                        icon={CheckCircle2}
                        tone="emerald"
                        count={exactCount}
                        label="Automātiski"
                      />
                      <SummaryPill
                        icon={AlertCircle}
                        tone="amber"
                        count={likelyCount}
                        label="Jāapstiprina"
                      />
                      <SummaryPill
                        icon={HelpCircle}
                        tone="graphite"
                        count={noneCount}
                        label="Nezināmi"
                      />
                    </div>

                    {/* Match list */}
                    <div className="rounded-lg border border-graphite-200 overflow-hidden">
                      <div className="max-h-[300px] overflow-y-auto">
                        {parsedTxs.map((tx, i) => {
                          const m = matches[i];
                          return (
                            <div
                              key={i}
                              className="px-3 py-2 border-b border-graphite-100 last:border-b-0"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-medium text-graphite-900 truncate">
                                  {tx.counterparty || "Nezināms saņēmējs"}
                                </span>
                                <span
                                  className={cn(
                                    "text-[12px] font-semibold tabular shrink-0",
                                    tx.amount < 0
                                      ? "text-red-600"
                                      : "text-emerald-600"
                                  )}
                                >
                                  {tx.amount < 0 ? "" : "+"}
                                  {formatCurrency(tx.amount)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px]">
                                <ConfidenceBadge confidence={m.confidence} />
                                <span className="text-graphite-500 truncate">
                                  {m.reason}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setParsedTxs([]);
                          setMatches([]);
                          setImportStage("idle");
                        }}
                      >
                        Atcelt
                      </Button>
                      <Button
                        size="sm"
                        onClick={applyMatches}
                        disabled={exactCount === 0}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Atzīmēt {exactCount} kā apmaksātus
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Footnote */}
            <div className="px-6 py-3 border-t border-graphite-100 bg-graphite-50/40">
              <div className="flex items-start gap-2 text-[10.5px] text-graphite-500">
                <FileSpreadsheet className="h-3 w-3 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Nākotnē XML faili tiks automātiski saglabāti Google Drive
                  mapē <span className="font-mono">exports/payments/</span> un
                  CSV izraksti uz{" "}
                  <span className="font-mono">exports/bank-statements/</span>.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Small helpers
// ============================================================

function SummaryPill({
  icon: Icon,
  tone,
  count,
  label,
}: {
  icon: typeof CheckCircle2;
  tone: "emerald" | "amber" | "graphite";
  count: number;
  label: string;
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    graphite: "bg-graphite-50 border-graphite-200 text-graphite-600",
  };
  return (
    <div
      className={cn(
        "rounded-lg border p-2 flex items-center gap-2",
        tones[tone]
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[15px] font-semibold tabular">{count}</span>
        <span className="text-[9.5px] uppercase tracking-wider font-semibold opacity-80 truncate">
          {label}
        </span>
      </div>
    </div>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: InvoiceMatch["confidence"];
}) {
  if (confidence === "exact") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-700 px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider shrink-0">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Atbilst
      </span>
    );
  }
  if (confidence === "likely") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-100 text-amber-700 px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider shrink-0">
        <AlertCircle className="h-2.5 w-2.5" />
        Iespējams
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-graphite-50 border border-graphite-200 text-graphite-600 px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider shrink-0">
      <HelpCircle className="h-2.5 w-2.5" />
      Nezināms
    </span>
  );
}
