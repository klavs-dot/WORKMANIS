"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Check,
  X,
  Eye,
  Send,
  Building2,
  Sparkles,
  Save,
  Info,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OutgoingStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import type {
  OutgoingAccountingMeta,
  OutgoingPayment,
} from "@/lib/billing-store";
import {
  accountingCategoryLabels,
  depreciationLabel,
  depreciationOptions,
} from "@/lib/network-types";
import type {
  AccountingCategory,
  DepreciationPeriod,
} from "@/lib/network-types";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { PnAktsButton } from "@/components/billing/pn-akts-button";
import { BankExchangePanel } from "@/components/billing/bank-exchange-panel";

// Mock parsed invoices — rotates by upload count for demo realism
const mockParsings = [
  {
    supplier: "AS Latvenergo",
    invoiceNumber: "LE-26-04-02291",
    amount: 850.0,
    iban: "LV61HABA0001408042678",
    dueDate: "2026-04-30",
  },
  {
    supplier: "SIA Tet",
    invoiceNumber: "TET-2026-04-8812",
    amount: 143.0,
    iban: "LV77HABA0551000562189",
    dueDate: "2026-04-28",
  },
  {
    supplier: "Adobe Systems Software Ireland",
    invoiceNumber: "ADB-2026-04128",
    amount: 898.0,
    iban: "IE29AIBK93115212345678",
    dueDate: "2026-05-02",
  },
];

interface ParsedFields {
  supplier: string;
  invoiceNumber: string;
  amount: number;
  iban: string;
  dueDate: string;
}

export function IzejosieTab() {
  const { outgoing, addOutgoing, markOutgoingPaid, setOutgoingMeta, attachOutgoingPN, detachOutgoingPN } =
    useBilling();
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<
    (ParsedFields & { fileName: string }) | null
  >(null);
  const [openedInvoice, setOpenedInvoice] = useState<OutgoingPayment | null>(
    null
  );
  const [metaEditing, setMetaEditing] = useState<OutgoingPayment | null>(null);
  const [bankPanelOpen, setBankPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadCountRef = useRef(0);

  const simulateParse = (fileName: string) => {
    setParsing(true);
    setParsed(null);
    // Simulate ~1.1s parse
    setTimeout(() => {
      const mock = mockParsings[uploadCountRef.current % mockParsings.length];
      uploadCountRef.current += 1;
      setParsed({ ...mock, fileName });
      setParsing(false);
    }, 1100);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    simulateParse(file.name);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handlePreparePayment = () => {
    if (!parsed) return;
    addOutgoing({
      supplier: parsed.supplier,
      invoiceNumber: parsed.invoiceNumber,
      amount: parsed.amount,
      iban: parsed.iban,
      dueDate: parsed.dueDate,
      fileName: parsed.fileName,
    });
    setParsed(null);
  };

  const clearParsed = () => {
    setParsed(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <AnimatePresence mode="wait">
          {!parsed && !parsing && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "rounded-2xl border-2 border-dashed transition-all cursor-pointer",
                "flex flex-col items-center justify-center py-14 px-6 text-center",
                isDragging
                  ? "border-graphite-900 bg-graphite-50 scale-[1.005]"
                  : "border-graphite-200 bg-white hover:border-graphite-300 hover:bg-graphite-50/40"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-xl transition-colors mb-4",
                  isDragging
                    ? "bg-graphite-900 text-white"
                    : "bg-graphite-100 text-graphite-700"
                )}
              >
                <Upload className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight text-graphite-900">
                Ievelc rēķinu šeit vai augšupielādē
              </h3>
              <p className="mt-1.5 text-[12.5px] text-graphite-500 max-w-md">
                PDF faili · Automātiski izgūsim piegādātāju, summu, IBAN un
                apmaksas termiņu
              </p>
              <Button variant="secondary" size="sm" className="mt-4">
                <Upload className="h-3.5 w-3.5" />
                Izvēlēties failu
              </Button>
            </motion.div>
          )}

          {parsing && (
            <motion.div
              key="parsing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-graphite-200 bg-white py-14 px-6 text-center"
            >
              <div className="flex items-center justify-center gap-3">
                <div className="h-5 w-5 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin" />
                <span className="text-[14px] text-graphite-700 font-medium">
                  Apstrādājam rēķinu…
                </span>
              </div>
              <p className="mt-2 text-[12px] text-graphite-500">
                Izgūstam datus no PDF
              </p>
            </motion.div>
          )}

          {parsed && !parsing && (
            <motion.div
              key="parsed"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Card className="overflow-hidden">
                <div className="p-5 border-b border-graphite-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-[14.5px] font-semibold tracking-tight text-graphite-900">
                        Rēķina dati izgūti
                      </h3>
                      <p className="text-[11.5px] text-graphite-500 mt-0.5 font-mono">
                        {parsed.fileName}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearParsed}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ParsedField label="Nosaukums" value={parsed.supplier} />
                  <ParsedField
                    label="Rēķina numurs"
                    value={parsed.invoiceNumber}
                    mono
                  />
                  <ParsedField
                    label="Summa"
                    value={formatCurrency(parsed.amount)}
                  />
                  <ParsedField label="IBAN" value={parsed.iban} mono />
                  <ParsedField
                    label="Termiņš"
                    value={formatDate(parsed.dueDate)}
                  />
                </div>

                <div className="p-5 pt-0 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearParsed}
                  >
                    Atcelt
                  </Button>
                  <Button size="sm" onClick={handlePreparePayment}>
                    <Send className="h-3.5 w-3.5" />
                    Sagatavot maksājumu bankā
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* List of prepared payments */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-graphite-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
              Sagatavotie maksājumi
            </h3>
            <p className="mt-0.5 text-[12.5px] text-graphite-500">
              Gaida apstiprinājumu bankā vai jau apmaksāti
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBankPanelOpen(true)}
            className="shrink-0"
          >
            <Landmark className="h-3.5 w-3.5" />
            Uz banku
          </Button>
        </div>
        {outgoing.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-graphite-500">
            Vēl nav sagatavots neviens maksājums
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nosaukums</TableHead>
                <TableHead>Rēķina numurs</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Termiņš</TableHead>
                <TableHead>Kategorija</TableHead>
                <TableHead>Statuss</TableHead>
                <TableHead className="w-[200px] text-right">Darbības</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outgoing.map((p) => {
                const hasMeta = !!p.accountingMeta;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                          <Building2 className="h-3 w-3" />
                        </div>
                        <span className="font-medium text-graphite-900">
                          {p.supplier}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-graphite-600">
                      {p.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-graphite-900 tabular">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell className="text-graphite-600 tabular">
                      {formatDate(p.dueDate)}
                    </TableCell>
                    <TableCell>
                      {hasMeta ? (
                        <AccountingMetaTag meta={p.accountingMeta!} />
                      ) : (
                        <span className="text-[11px] text-graphite-400 italic">
                          Nav aizpildīts
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <OutgoingStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <PnAktsButton
                          current={p.pnAkts}
                          onAttach={({ number, source, fileName }) =>
                            attachOutgoingPN(p.id, number, source, fileName)
                          }
                          onRemove={() => detachOutgoingPN(p.id)}
                        />
                        <Button
                          variant={hasMeta ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() => setMetaEditing(p)}
                          title="Skaidrojums grāmatvedībai"
                        >
                          <Sparkles className="h-3 w-3" />
                          {hasMeta ? "Labot" : "Skaidrojums"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setOpenedInvoice(p)}
                          title="Apskatīt"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {p.status === "apstiprinat_banka" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => markOutgoingPaid(p.id)}
                            title="Atzīmēt kā apmaksātu"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Invoice preview modal */}
      <Dialog
        open={!!openedInvoice}
        onOpenChange={(o) => !o && setOpenedInvoice(null)}
      >
        <DialogContent className="max-w-2xl">
          {openedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle>{openedInvoice.supplier}</DialogTitle>
                <DialogDescription>
                  Rēķins {openedInvoice.invoiceNumber}
                </DialogDescription>
              </DialogHeader>

              <div className="aspect-[8.5/11] max-h-[400px] rounded-lg border border-graphite-200 bg-surface-subtle flex flex-col items-center justify-center gap-2 bg-grain">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-soft-sm">
                  <FileText className="h-4 w-4 text-graphite-600" />
                </div>
                <span className="text-[12px] text-graphite-500">
                  PDF priekšskatījums
                </span>
                {openedInvoice.fileName && (
                  <span className="text-[11px] text-graphite-400 font-mono">
                    {openedInvoice.fileName}
                  </span>
                )}
              </div>

              <dl className="space-y-2 text-[13px] pt-2">
                <div className="flex justify-between">
                  <dt className="text-graphite-500">Summa</dt>
                  <dd className="font-semibold text-graphite-900 tabular">
                    {formatCurrency(openedInvoice.amount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-graphite-500">IBAN</dt>
                  <dd className="font-mono text-[12px] text-graphite-700">
                    {openedInvoice.iban}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-graphite-500">Apmaksas termiņš</dt>
                  <dd className="tabular text-graphite-800">
                    {formatDate(openedInvoice.dueDate)}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Accounting meta modal */}
      <AccountingMetaModal
        invoice={metaEditing}
        onClose={() => setMetaEditing(null)}
        onSave={(meta) => {
          if (metaEditing) {
            setOutgoingMeta(metaEditing.id, meta);
            setMetaEditing(null);
          }
        }}
      />

      {/* Bank exchange side-panel */}
      <BankExchangePanel
        open={bankPanelOpen}
        onOpenChange={setBankPanelOpen}
      />
    </div>
  );
}

function ParsedField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
        {label}
      </Label>
      <p
        className={cn(
          "mt-1.5 text-[14px] font-medium text-graphite-900",
          mono && "font-mono text-[13px]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ============================================================
// Accounting meta tag shown in invoice row
// ============================================================

function AccountingMetaTag({ meta }: { meta: OutgoingAccountingMeta }) {
  const label =
    meta.category === "amortizacija" && meta.depreciationPeriod
      ? `Amortizācija · ${depreciationLabel(meta.depreciationPeriod)}`
      : accountingCategoryLabels[meta.category];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-medium border bg-violet-50 border-violet-100 text-violet-700 max-w-[220px]"
      title={meta.explanation}
    >
      <Sparkles className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

// ============================================================
// Accounting meta modal
//
// NOTE: These fields will later be synced to a Google Sheets
// spreadsheet (one tab per accounting category), so the
// accountant can download and review each invoice with
// explanation. Sync layer will sit on top of this store
// without changing its shape.
// ============================================================

function AccountingMetaModal({
  invoice,
  onClose,
  onSave,
}: {
  invoice: OutgoingPayment | null;
  onClose: () => void;
  onSave: (meta: OutgoingAccountingMeta) => void;
}) {
  const [category, setCategory] = useState<AccountingCategory>("izejvielas");
  const [period, setPeriod] = useState<DepreciationPeriod>(5);
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    if (!invoice) return;
    if (invoice.accountingMeta) {
      setCategory(invoice.accountingMeta.category);
      setPeriod(invoice.accountingMeta.depreciationPeriod ?? 5);
      setExplanation(invoice.accountingMeta.explanation);
    } else {
      setCategory("izejvielas");
      setPeriod(5);
      setExplanation("");
    }
  }, [invoice]);

  const submit = () => {
    const meta: OutgoingAccountingMeta = {
      category,
      depreciationPeriod:
        category === "amortizacija" ? period : undefined,
      explanation: explanation.trim(),
      updatedAt: new Date().toISOString(),
    };
    onSave(meta);
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {invoice && (
          <>
            <DialogHeader>
              <DialogTitle>Skaidrojums grāmatvedībai</DialogTitle>
              <DialogDescription>
                {invoice.supplier} · rēķins {invoice.invoiceNumber}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label>Kategorija</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as AccountingCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(
                        accountingCategoryLabels
                      ) as AccountingCategory[]
                    ).map((c) => (
                      <SelectItem key={c} value={c}>
                        {accountingCategoryLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AnimatePresence initial={false}>
                {category === "amortizacija" && (
                  <motion.div
                    key="period"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5 overflow-hidden"
                  >
                    <Label>Nolietojuma periods</Label>
                    <Select
                      value={String(period)}
                      onValueChange={(v) =>
                        setPeriod(Number(v) as DepreciationPeriod)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {depreciationOptions.map((p) => (
                          <SelectItem key={p} value={String(p)}>
                            {depreciationLabel(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <Label>Skaidrojums</Label>
                <Textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Īss apraksts grāmatvedim — kam izlietots, kā grāmatojams…"
                  className="min-h-[90px]"
                />
              </div>

              <div className="rounded-lg border border-graphite-100 bg-graphite-50/50 p-3 flex items-start gap-2.5">
                <Info className="h-3.5 w-3.5 text-graphite-400 mt-0.5 shrink-0" />
                <p className="text-[11.5px] text-graphite-500 leading-relaxed">
                  Šī informācija vēlāk tiks sinhronizēta ar Google Sheets
                  reģistriem un būs pieejama grāmatvedim kā lejupielādējams
                  eksports.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
                Atcelt
              </Button>
              <Button size="sm" onClick={submit}>
                <Save className="h-3.5 w-3.5" />
                Saglabāt
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
