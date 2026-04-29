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
import { useEmployees } from "@/lib/employees-store";
import {
  generatePain001XML,
  parseBankStatementCSV,
  matchTransactionsToInvoices,
  type ParsedTransaction,
  type InvoiceMatch,
} from "@/lib/bank-exchange";
import {
  parseBankStatementXML,
  isBankStatementXML,
} from "@/lib/bank-statement-xml";
import {
  classifyAll,
  groupBySection,
  type PaymentSection,
} from "@/lib/payment-classifier";
import { usePayments } from "@/lib/payments-store";
import { pushToastGlobally } from "@/lib/toast-context";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export type BankExchangeMode = "received" | "salaries" | "taxes";

const modeCopy: Record<
  BankExchangeMode,
  { heading: string; exportLabel: string; itemNoun: string }
> = {
  received: {
    heading: "Sagatavot maksājumu uzdevumu",
    exportLabel: "neapmaksāti rēķini",
    itemNoun: "rēķini",
  },
  salaries: {
    heading: "Sagatavot algu maksājumus",
    exportLabel: "sagatavotās algas",
    itemNoun: "algas",
  },
  taxes: {
    heading: "Sagatavot nodokļu maksājumus",
    exportLabel: "sagatavotie nodokļi",
    itemNoun: "nodokļi",
  },
};

export function BankExchangePanel({
  open,
  onOpenChange,
  mode = "received",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode?: BankExchangeMode;
}) {
  const { received, salaries, taxes, markReceivedPaid, updateSalary, updateTax } =
    useBilling();
  const { activeCompany } = useCompany();
  const { employees } = useEmployees();
  const { bulkCreate: bulkCreatePayments } = usePayments();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copy = modeCopy[mode];

  // ─── Build unified "items" list based on mode ───
  type BatchListItem = {
    id: string;
    name: string; // display name (supplier / employee / tax name)
    subtitle: string; // invoice number / period / due date
    amount: number;
    iban?: string;
    reference: string;
    dueDate?: string;
  };

  const items = useMemo<BatchListItem[]>(() => {
    if (mode === "received") {
      return received
        .filter((p) => p.status !== "apmaksats")
        .map((p) => ({
          id: p.id,
          name: p.supplier,
          subtitle: p.invoiceNumber,
          amount: p.amount,
          iban: p.iban,
          reference: p.invoiceNumber,
          dueDate: p.dueDate,
        }));
    }
    if (mode === "salaries") {
      return salaries
        .filter((s) => s.status === "sagatavots")
        .map((s) => {
          const emp = employees.find((e) => e.id === s.employeeId);
          const primaryBank = emp?.bankAccounts.find((b) => b.isPrimary);
          return {
            id: s.id,
            name: s.employee,
            subtitle: `${s.period} · ${salaryTypeLabel(s.type)}`,
            amount: s.amount,
            iban: primaryBank?.iban,
            reference: `Alga ${s.period}`,
          };
        });
    }
    // taxes
    return taxes
      .filter((t) => t.status === "sagatavots")
      .map((t) => ({
        id: t.id,
        name: t.name,
        subtitle: `Termiņš ${formatDate(t.dueDate)}`,
        amount: t.amount,
        iban: undefined, // taxes IBAN must be configured by manager; warn in UI
        reference: t.name,
        dueDate: t.dueDate,
      }));
  }, [mode, received, salaries, taxes, employees]);

  const markAsPaidInStore = (id: string) => {
    if (mode === "received") markReceivedPaid(id);
    else if (mode === "salaries") updateSalary(id, { status: "izmaksats" });
    else if (mode === "taxes") updateTax(id, { status: "apmaksats" });
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportState, setExportState] = useState<"idle" | "downloading" | "done">(
    "idle"
  );

  const selectedItems = items.filter((i) => selectedIds.has(i.id));
  const selectedTotal = selectedItems.reduce((s, i) => s + i.amount, 0);
  const selectedMissingIban = selectedItems.some((i) => !i.iban);

  const toggleAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const downloadXML = () => {
    if (selectedItems.length === 0 || selectedMissingIban) return;
    setExportState("downloading");

    const xml = generatePain001XML(
      {
        debtorName: activeCompany?.legalName || activeCompany?.name || "Uzņēmums",
        debtorIban: activeCompany?.iban || "LV00NOTPROVIDED",
        requestedExecutionDate: new Date().toISOString().slice(0, 10),
      },
      selectedItems.map((i) => ({
        name: i.name,
        iban: i.iban || "",
        amount: i.amount,
        reference: i.reference,
        remittance: `${i.reference} ${i.name}`.trim(),
      }))
    );

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    const prefix =
      mode === "received"
        ? "payment-batch"
        : mode === "salaries"
          ? "salary-batch"
          : "tax-batch";
    a.href = url;
    a.download = `${prefix}-${stamp}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportState("done");
    setTimeout(() => setExportState("idle"), 2400);
  };

  // ─── Import: parse uploaded XML or CSV, classify, auto-apply ───
  //
  // The flow used to be 'parse CSV → show review screen → user clicks
  // apply → mark matched invoices paid'. Per user request, we now:
  //   1. Auto-detect FIDAVISTA / camt.053 / CSV from file content
  //   2. Match all transactions against existing received invoices
  //   3. Auto-mark exact matches as paid
  //   4. Classify the rest into ienakosie/izejosie/automatiskie/
  //      fiziskie buckets (the 4 tabs)
  //   5. Close the panel immediately and show a toast summary
  //
  // No more manual review step — the file IS the source of truth.
  // Wrong matches can still be undone in the underlying tab.

  const onFilePicked = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      pushToastGlobally("error", "Neizdevās nolasīt failu.", 7000);
      return;
    }

    // Detect format. XML (FIDAVISTA / camt.053) is the preferred
    // path because it's standardized across Latvian banks. CSV is
    // a fallback that works but needs per-bank parser tweaks.
    let txs: ParsedTransaction[];
    try {
      if (isBankStatementXML(text)) {
        txs = parseBankStatementXML(text);
      } else {
        txs = parseBankStatementCSV(text);
      }
    } catch (err) {
      pushToastGlobally(
        "error",
        err instanceof Error
          ? err.message
          : "Neatpazīts faila formāts.",
        7000
      );
      return;
    }

    if (txs.length === 0) {
      pushToastGlobally(
        "error",
        "Failā nav atrasta neviena transakcija.",
        7000
      );
      return;
    }

    // Match against unpaid received invoices and auto-mark exact hits
    const m = matchTransactionsToInvoices(
      txs,
      received.filter((p) => p.status !== "apmaksats")
    );
    let appliedCount = 0;
    for (const match of m) {
      if (match.invoiceId && match.confidence === "exact") {
        markReceivedPaid(match.invoiceId);
        appliedCount++;
      }
    }

    // Classify all transactions for the summary toast. Section
    // counts let the user know what landed where without needing
    // to navigate every tab to verify.
    const knownSupplierIbans = received
      .map((r) => r.iban)
      .filter((s): s is string => Boolean(s));
    const classified = classifyAll(txs, knownSupplierIbans);
    const grouped = groupBySection(classified);

    // Build a lookup: counterparty IBAN → received invoice ID for
    // attaching matched_invoice_id during persistence. Falls back
    // to amount+date matching when IBAN doesn't help.
    const ibanToInvoiceId = new Map<string, string>();
    for (const r of received) {
      if (r.iban) {
        ibanToInvoiceId.set(
          r.iban.replace(/\s+/g, "").toUpperCase(),
          r.id
        );
      }
    }

    // Persist each transaction to the 35_payments tab. The store
    // handles the API roundtrips; this gives us a permanent record
    // for the per-tab red 'missing receipt' warning UI.
    if (mode === "received") {
      const toCreate = classified.map(({ tx, section }) => {
        const matchedIban = tx.counterpartyIban
          ? ibanToInvoiceId.get(
              tx.counterpartyIban.replace(/\s+/g, "").toUpperCase()
            )
          : undefined;
        return {
          direction: tx.amount >= 0 ? "out" : "in",
          category: section,
          counterparty: tx.counterparty || "Nezināms saņēmējs",
          counterpartyIban: tx.counterpartyIban,
          amount: Math.abs(tx.amount),
          paymentDate: tx.date ?? "",
          bankAccountIban: undefined,
          bankReference: tx.reference || undefined,
          source: "fidavista_import",
          importedFromFilename: file.name,
          classifiedSection: section,
          matchedInvoiceId: matchedIban,
          rawReference: tx.reference || "",
        };
      });

      // Fire-and-forget the bulk insert. We don't await it before
      // closing the panel — the user gets immediate feedback via
      // toast, and the table refreshes when payments-store finishes
      // its writes. Failures are surfaced via the store's own
      // error handling.
      void bulkCreatePayments(toCreate).then((saved) => {
        if (saved < toCreate.length) {
          pushToastGlobally(
            "error",
            `Saglabāti ${saved} no ${toCreate.length} maksājumiem. Pārējie neizdevās — pārbaudi shēmu /iestatijumi.`,
            10000
          );
        }
      });
    }

    // Build human-readable toast summary
    const sectionLabels: Record<PaymentSection, string> = {
      ienakosie: "Ienākošie",
      izejosie: "Izejošie",
      automatiskie: "Automātiskie",
      fiziskie: "Fiziskie",
    };
    const parts: string[] = [];
    for (const [section, list] of Object.entries(grouped)) {
      if (list.length > 0) {
        parts.push(
          `${sectionLabels[section as PaymentSection]}: ${list.length}`
        );
      }
    }

    const summary =
      `Importēti ${txs.length} maksājumi. ` +
      (appliedCount > 0
        ? `Automātiski apstiprināti: ${appliedCount}. `
        : "") +
      parts.join(" · ");

    pushToastGlobally("success", summary, 9000);

    // Auto-close immediately. Reset internal state so a future open
    // starts fresh.
    setParsedTxs([]);
    setMatches([]);
    setImportStage("idle");
    onOpenChange(false);
  };

  // Legacy review-stage state, retained for the CSV path that some
  // users may still use (when XML isn't available from their bank).
  // Kept declared but no longer set by onFilePicked above — review
  // mode is unreachable in the new flow.
  const [parsedTxs, setParsedTxs] = useState<ParsedTransaction[]>([]);
  const [matches, setMatches] = useState<InvoiceMatch[]>([]);
  const [importStage, setImportStage] = useState<"idle" | "review">("idle");

  const applyMatches = () => {
    let applied = 0;
    matches.forEach((m) => {
      if (m.invoiceId && m.confidence === "exact") {
        markReceivedPaid(m.invoiceId);
        applied++;
      }
    });
    pushToastGlobally(
      "success",
      `Atzīmēti kā apmaksāti: ${applied} rēķini`,
      6000
    );
    setParsedTxs([]);
    setMatches([]);
    setImportStage("idle");
    onOpenChange(false);
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
                    {copy.heading}
                  </h3>
                </div>
                <p className="text-[11.5px] text-graphite-500 mb-3 leading-relaxed">
                  Izvēlies {copy.itemNoun} → lejupielādē XML failu → augšupielādē
                  savā internetbankā kā batch maksājumu paketi. Darbojas ar SEB,
                  Swedbank, Citadele un Luminor.
                </p>

                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-graphite-200 bg-graphite-50/30 p-5 text-center text-[12px] text-graphite-500">
                    Nav {copy.exportLabel}
                  </div>
                ) : (
                  <div className="rounded-lg border border-graphite-200 overflow-hidden">
                    {/* Select all header */}
                    <div className="flex items-center gap-2 bg-graphite-50/60 border-b border-graphite-100 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === items.length}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                      />
                      <span className="text-[11px] text-graphite-600 font-medium">
                        {selectedIds.size === 0
                          ? `Izvēlies no ${items.length}`
                          : `${selectedIds.size} no ${items.length} · ${formatCurrency(selectedTotal)}`}
                      </span>
                    </div>
                    {/* Rows */}
                    <div className="max-h-[240px] overflow-y-auto">
                      {items.map((i) => (
                        <label
                          key={i.id}
                          className="flex items-center gap-2.5 px-3 py-2 border-b border-graphite-100 last:border-b-0 hover:bg-graphite-50/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(i.id)}
                            onChange={() => toggleOne(i.id)}
                            className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 justify-between">
                              <span className="text-[12.5px] font-medium text-graphite-900 truncate">
                                {i.name}
                              </span>
                              <span className="text-[12.5px] font-semibold text-graphite-900 tabular shrink-0">
                                {formatCurrency(i.amount)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10.5px] text-graphite-500 mt-0.5">
                              <span className="truncate">{i.subtitle}</span>
                              {!i.iban && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-100 text-amber-700 px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider shrink-0">
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  IBAN trūkst
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {selectedMissingIban && (
                  <p className="mt-2 text-[11px] text-amber-700 flex items-start gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    Dažiem izvēlētiem ierakstiem nav IBAN. Pievieno IBAN vispirms
                    vai izslēdz šos ierakstus no izvēles.
                  </p>
                )}

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    onClick={downloadXML}
                    disabled={
                      selectedItems.length === 0 ||
                      exportState !== "idle" ||
                      selectedMissingIban
                    }
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

              {/* ─── Section 2: Import (received mode only — matching happens against unpaid supplier invoices) ─── */}
              {mode === "received" && (
              <section className="px-6 py-5">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-sky-600" />
                  <h3 className="text-[13px] font-semibold tracking-tight text-graphite-900">
                    Importēt bankas izrakstu
                  </h3>
                </div>
                <p className="text-[11.5px] text-graphite-500 mb-3 leading-relaxed">
                  Lejupielādē <strong>FIDAVISTA XML</strong> izrakstu no savas
                  internetbankas un augšupielādē to šeit. Sistēma automātiski
                  apstiprinās apmaksātos rēķinus un sadalīs maksājumus pa
                  sadaļām (Ienākošie, Izejošie, Automātiskie, Fiziskie).
                </p>

                {importStage === "idle" && (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border-2 border-dashed border-graphite-200 bg-graphite-50/40 p-6 text-center cursor-pointer hover:border-graphite-300 hover:bg-graphite-50 transition-colors"
                    >
                      <Upload className="h-5 w-5 text-graphite-400 mx-auto mb-2" />
                      <p className="text-[12.5px] font-medium text-graphite-900">
                        Ievelc XML failu vai spied izvēlēties
                      </p>
                      <p className="text-[10.5px] text-graphite-500 mt-0.5">
                        FIDAVISTA · camt.053 · CSV · SEB · Swedbank · Citadele · Luminor
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xml,.csv,application/xml,text/xml,text/csv"
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
              )}
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

function salaryTypeLabel(t: string): string {
  switch (t) {
    case "darba_alga":
      return "Darba alga";
    case "atvalinajums":
      return "Atvaļinājums";
    case "avansa_norekini":
      return "Avansa norēķini";
    case "piemaksa":
      return "Piemaksa";
    default:
      return t;
  }
}
