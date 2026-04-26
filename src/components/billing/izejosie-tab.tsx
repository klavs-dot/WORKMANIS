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
  Download,
  Pencil,
  AlertTriangle,
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
import { ReceivedStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import type {
  ReceivedInvoiceAccountingMeta,
  ReceivedInvoice,
} from "@/lib/billing-store";
import { useCompany } from "@/lib/company-context";
import { useNetwork } from "@/lib/network-store";
import type { BusinessContactCategory } from "@/lib/network-types";
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
import { EditReceivedModal } from "@/components/billing/edit-received-modal";

// ============================================================
// Helpers for matching parsed-invoice data against known parties
// ============================================================

/**
 * Normalize a company name for fuzzy comparison: lowercase, trim,
 * collapse whitespace, strip legal-form prefixes/suffixes (SIA,
 * AS, OÜ, Ltd, GmbH, A/S etc), strip punctuation. Used as a
 * fallback when reg-number match isn't possible.
 */
function normalizeCompanyName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    // strip common legal forms (anywhere in the string)
    .replace(/\b(sia|as|a\/s|ltd|llc|inc|gmbh|oy|oü|ou|ab)\b/g, "")
    .replace(/[.,'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two company names refer to the same entity.
 * Reg numbers (when both available) are authoritative; otherwise
 * fall back to normalized-name match.
 */
function companiesMatch(
  aName: string,
  aRegNumber: string | undefined,
  bName: string,
  bRegNumber: string | undefined
): boolean {
  if (aRegNumber && bRegNumber) {
    return aRegNumber.trim() === bRegNumber.trim();
  }
  if (!aName || !bName) return false;
  return normalizeCompanyName(aName) === normalizeCompanyName(bName);
}

// Parsed invoice shape returned by /api/invoices-in/parse
interface ParsedFields {
  supplier: string;
  supplier_reg_number?: string;
  /** Who the invoice is BILLED TO. Should match active company. */
  recipient?: string;
  recipient_reg_number?: string;
  invoiceNumber: string;
  amount: number;
  amount_without_vat: number;
  vat_amount: number;
  currency: string;
  iban: string;
  dueDate: string;
  issueDate: string;
  description: string;
  suggestedCategory?: AccountingCategory;
  suggestedDepreciationYears?: DepreciationPeriod;
  isPaid: boolean;
  paidEvidence?: string;
  isCreditNote: boolean;
  creditNoteEvidence?: string;
  sources: {
    supplier_name: string;
    invoice_number: string;
    amount_total: string;
    iban: string;
    due_date: string;
  };
  confidence: {
    supplier_name: number;
    supplier_reg_number: number;
    invoice_number: number;
    amount_total: number;
    iban: number;
    due_date: number;
  };
  notes?: string;
}

// One queued file with status: parsing → ready (parsed ok) or error
interface QueueItem {
  id: string;
  fileName: string;
  status: "parsing" | "ready" | "error";
  parsed?: ParsedFields;
  error?: string;
}

export function IzejosieTab() {
  const { received, addReceived, updateReceived, markReceivedPaid, setReceivedMeta, attachReceivedPN, detachReceivedPN } =
    useBilling();
  const { activeCompany } = useCompany();
  const network = useNetwork();
  const [isDragging, setIsDragging] = useState(false);
  // Queue of all files dropped together. We parse all in parallel,
  // then user reviews/approves each one in turn.
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // Index of the currently-shown queue item in the review form.
  // Only items with status === 'ready' are shown.
  const [reviewIndex, setReviewIndex] = useState(0);
  const [openedInvoice, setOpenedInvoice] = useState<ReceivedInvoice | null>(
    null
  );
  const [metaEditing, setMetaEditing] = useState<ReceivedInvoice | null>(null);
  const [editing, setEditing] = useState<ReceivedInvoice | null>(null);
  const [bankPanelOpen, setBankPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // For category editing in the review form
  const [reviewCategory, setReviewCategory] = useState<AccountingCategory>(
    "sanemts_pakalpojums"
  );
  const [reviewDepreciation, setReviewDepreciation] = useState<DepreciationPeriod>(5);
  const [reviewExplanation, setReviewExplanation] = useState("");

  // For "add new supplier" mini-modal when supplier isn't in
  // partner list yet. Pre-filled from AI extraction.
  const [addPartnerOpen, setAddPartnerOpen] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerCategory, setNewPartnerCategory] =
    useState<BusinessContactCategory>("piegadataji");

  // Parses ONE file and updates the queue item with the result.
  // Called once per dropped file; runs in parallel.
  const parseOneFile = async (item: QueueItem, file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/invoices-in/parse", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Neparedzēta kļūda");
      const d = json.data;
      const parsed: ParsedFields = {
        supplier: d.supplier ?? "",
        supplier_reg_number: d.supplier_reg_number,
        recipient: d.recipient,
        recipient_reg_number: d.recipient_reg_number,
        invoiceNumber: d.invoice_number ?? "",
        amount: d.amount ?? 0,
        amount_without_vat: d.amount_without_vat ?? 0,
        vat_amount: d.vat_amount ?? 0,
        currency: d.currency ?? "EUR",
        iban: d.iban ?? "",
        dueDate: d.due_date ?? "",
        issueDate: d.issue_date ?? "",
        description: d.description ?? "",
        suggestedCategory: d.suggested_category as AccountingCategory | undefined,
        suggestedDepreciationYears: d.suggested_depreciation_years as
          | DepreciationPeriod
          | undefined,
        isPaid: d.is_paid === true,
        paidEvidence: d.paid_evidence,
        isCreditNote: d.is_credit_note === true,
        creditNoteEvidence: d.credit_note_evidence,
        sources: d.sources ?? {
          supplier_name: "",
          invoice_number: "",
          amount_total: "",
          iban: "",
          due_date: "",
        },
        confidence: d.confidence ?? {
          supplier_name: 1,
          supplier_reg_number: 1,
          invoice_number: 1,
          amount_total: 1,
          iban: 1,
          due_date: 1,
        },
        notes: d.notes,
      };
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "ready", parsed } : q
        )
      );
    } catch (err) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: "error",
                error:
                  err instanceof Error
                    ? err.message
                    : "Neizdevās apstrādāt failu",
              }
            : q
        )
      );
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Convert FileList → array (avoids reusing the same File index
    // across async callbacks)
    const fileArray = Array.from(files);
    const newItems: QueueItem[] = fileArray.map((f) => ({
      id: `q-${Math.random().toString(36).slice(2, 10)}`,
      fileName: f.name,
      status: "parsing" as const,
    }));
    setQueue((prev) => [...prev, ...newItems]);
    // Reset review index when starting fresh
    if (queue.length === 0) setReviewIndex(0);
    // Kick off parallel parses (each updates its own queue item
    // when done; user can start reviewing the first one to finish)
    fileArray.forEach((file, i) => {
      void parseOneFile(newItems[i], file);
    });
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
    if (!currentItem?.parsed) return;
    const p = currentItem.parsed;
    addReceived({
      supplier: p.supplier,
      invoiceNumber: p.invoiceNumber,
      amount: p.amount,
      iban: p.iban,
      dueDate: p.dueDate,
      fileName: currentItem.fileName,
    });
    // The accounting metadata (category + explanation) gets
    // attached separately via setReceivedMeta. addReceived
    // generates a temp id; we listen for the real id by hooking
    // into the next render cycle. For V1 simplicity, we use the
    // explanation+category we have right now, applied to the
    // most recent invoice (which will be this one once the queue
    // settles). If race conditions matter later, billing-store
    // could expose addReceivedWithMeta() to do both in one go.
    if (reviewExplanation.trim() || reviewCategory) {
      // Defer one tick so the optimistic invoice is in `received`
      // before we try to set its meta
      setTimeout(() => {
        // Find the just-added invoice — it's the most recently
        // added one matching this fileName
        const justAdded = [...received]
          .reverse()
          .find((inv) => inv.fileName === currentItem.fileName);
        if (justAdded) {
          setReceivedMeta(justAdded.id, {
            category: reviewCategory,
            depreciationPeriod:
              reviewCategory === "amortizacija"
                ? reviewDepreciation
                : undefined,
            explanation: reviewExplanation,
            updatedAt: new Date().toISOString(),
          });
        }
      }, 0);
    }
    // Remove this item from the queue and advance to next ready
    // item, or empty out if it was the last one.
    removeFromQueue(currentItem.id);
  };

  const skipCurrent = () => {
    if (!currentItem) return;
    removeFromQueue(currentItem.id);
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
    // Reset reviewIndex — after removal the index might point
    // past the end, so just go back to 0 and let the next item
    // become "current".
    setReviewIndex(0);
  };

  const clearAll = () => {
    setQueue([]);
    setReviewIndex(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Open the "add partner" dialog, pre-filled with whatever
  // the AI extracted for the supplier on the current invoice.
  const openAddPartner = () => {
    if (!currentItem?.parsed) return;
    setNewPartnerName(currentItem.parsed.supplier);
    setNewPartnerCategory("piegadataji");
    setAddPartnerOpen(true);
  };

  const submitAddPartner = () => {
    if (!newPartnerName.trim()) return;
    network.addContact({
      category: newPartnerCategory,
      name: newPartnerName.trim(),
      countryCode: "LV",
      address: "",
      contactPerson: "",
      email: "",
      phone: "",
      comment: currentItem?.parsed?.supplier_reg_number
        ? `Reģ. Nr. ${currentItem.parsed.supplier_reg_number} · Pievienots automātiski no rēķina.`
        : "Pievienots automātiski no rēķina.",
    });
    setAddPartnerOpen(false);
  };

  // Queue stats — drives the bottom progress bar and the
  // "Rēķins X no Y" badge in the review header.
  const readyItems = queue.filter((q) => q.status === "ready");
  const parsingItems = queue.filter((q) => q.status === "parsing");
  const errorItems = queue.filter((q) => q.status === "error");
  const currentItem = readyItems[reviewIndex] ?? readyItems[0];
  const currentReadyIndex = currentItem
    ? readyItems.findIndex((q) => q.id === currentItem.id) + 1
    : 0;

  // ---------- Validation: recipient + supplier checks ----------
  // These computed values drive the warning banners and gate
  // the "Sagatavot maksājumu" button. All recompute when the
  // current queue item changes.

  /** Was the invoice billed to OUR active company? */
  const recipientCheck: "match" | "mismatch" | "unknown" = (() => {
    if (!currentItem?.parsed) return "unknown";
    const p = currentItem.parsed;
    if (!p.recipient && !p.recipient_reg_number) return "unknown";
    if (!activeCompany) return "unknown";
    return companiesMatch(
      p.recipient ?? "",
      p.recipient_reg_number,
      activeCompany.legalName ?? activeCompany.name,
      activeCompany.regNumber
    )
      ? "match"
      : "mismatch";
  })();

  /** Is the supplier already in our partner/distributor lists? */
  const supplierMatch = (() => {
    if (!currentItem?.parsed) return null;
    const p = currentItem.parsed;
    // Check distributors first
    const distHit = network.distributors.find((d) =>
      companiesMatch(d.name, undefined, p.supplier, p.supplier_reg_number)
    );
    if (distHit) return { kind: "distributor" as const, entity: distHit };
    // Then business contacts (partners, suppliers, services)
    const contactHit = network.contacts.find((c) =>
      companiesMatch(c.name, undefined, p.supplier, p.supplier_reg_number)
    );
    if (contactHit) return { kind: "contact" as const, entity: contactHit };
    return null;
  })();
  const supplierIsKnown = supplierMatch !== null;

  // Whenever the current item changes, pre-fill the editable
  // category/explanation/depreciation form fields with whatever
  // the AI suggested. User can override before approving.
  useEffect(() => {
    if (!currentItem?.parsed) return;
    const p = currentItem.parsed;
    setReviewCategory(p.suggestedCategory ?? "sanemts_pakalpojums");
    setReviewDepreciation(
      (p.suggestedDepreciationYears as DepreciationPeriod) ?? 5
    );
    setReviewExplanation(p.description ?? "");
  }, [currentItem?.id, currentItem?.parsed]);

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <AnimatePresence mode="wait">
          {queue.length === 0 && (
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

          {queue.length > 0 &&
            readyItems.length === 0 &&
            errorItems.length === 0 && (
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
                    {parsingItems.length === 1
                      ? "Apstrādājam rēķinu…"
                      : `Apstrādājam ${parsingItems.length} rēķinus…`}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-graphite-500">
                  Izgūstam datus no PDF
                </p>
              </motion.div>
            )}

          {readyItems.length === 0 && errorItems.length > 0 && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Card className="overflow-hidden border-red-200">
                <div className="p-5 flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 shrink-0">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[14.5px] font-semibold tracking-tight text-graphite-900">
                      {errorItems.length === 1
                        ? "Neizdevās apstrādāt rēķinu"
                        : `${errorItems.length} rēķini netika apstrādāti`}
                    </h3>
                    <ul className="text-[12.5px] text-graphite-600 mt-2 space-y-1">
                      {errorItems.map((e) => (
                        <li key={e.id} className="leading-relaxed">
                          <span className="font-mono text-graphite-500">
                            {e.fileName}:
                          </span>{" "}
                          {e.error ?? "Nezināma kļūda"}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={clearAll}
                      >
                        Notīrīt un mēģināt vēlreiz
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {currentItem?.parsed && (
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
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14.5px] font-semibold tracking-tight text-graphite-900">
                          Rēķina dati izgūti
                        </h3>
                        {readyItems.length > 1 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-graphite-100 px-2 py-0.5 text-[11px] font-medium text-graphite-700">
                            {currentReadyIndex} / {readyItems.length}
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-graphite-500 mt-0.5 font-mono">
                        {currentItem.fileName}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={skipCurrent}
                    title="Izlaist šo rēķinu"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* PAID warning — shown prominently if AI detected paid markings */}
                {currentItem.parsed.isPaid && (
                  <div className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-red-900">
                        Šis rēķins jau ir apmaksāts
                      </div>
                      {currentItem.parsed.paidEvidence && (
                        <div className="text-[12px] text-red-800 mt-1 leading-relaxed">
                          AI atrada: <span className="italic">&ldquo;{currentItem.parsed.paidEvidence}&rdquo;</span>
                        </div>
                      )}
                      <div className="text-[11.5px] text-red-700 mt-2">
                        Pārliecinies, ka neapmaksā vēlreiz. Ja apmaksāts, izveido tikai ierakstu vēsturei.
                      </div>
                    </div>
                  </div>
                )}

                {/* CREDIT NOTE warning — purple, distinct from paid */}
                {currentItem.parsed.isCreditNote && (
                  <div className="mx-5 mt-5 rounded-lg border border-violet-200 bg-violet-50 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-violet-900">
                        Šis ir kredītrēķins, nevis maksājuma rēķins
                      </div>
                      {currentItem.parsed.creditNoteEvidence && (
                        <div className="text-[12px] text-violet-800 mt-1 leading-relaxed">
                          AI atrada: <span className="italic">&ldquo;{currentItem.parsed.creditNoteEvidence}&rdquo;</span>
                        </div>
                      )}
                      <div className="text-[11.5px] text-violet-700 mt-2">
                        Kredītrēķins atgriež naudu vai atceļ daļu no iepriekšēja rēķina — to nemaksā. Iegrāmato vēsturei kā kompensāciju.
                      </div>
                    </div>
                  </div>
                )}

                {/* RECIPIENT MISMATCH warning — red, blocks payment */}
                {recipientCheck === "mismatch" && (
                  <div className="mx-5 mt-5 rounded-lg border border-red-300 bg-red-50 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-red-900">
                        Šis rēķins nav adresēts tev
                      </div>
                      <div className="text-[12px] text-red-800 mt-1 leading-relaxed">
                        Rēķins adresēts:{" "}
                        <span className="font-mono font-medium">
                          {currentItem.parsed.recipient ?? "—"}
                        </span>
                        {currentItem.parsed.recipient_reg_number && (
                          <>
                            {" "}
                            (Reģ. Nr.{" "}
                            <span className="font-mono">
                              {currentItem.parsed.recipient_reg_number}
                            </span>
                            )
                          </>
                        )}
                      </div>
                      <div className="text-[12px] text-red-800 mt-1">
                        Tavs aktīvais uzņēmums:{" "}
                        <span className="font-medium">
                          {activeCompany?.legalName ?? activeCompany?.name ?? "—"}
                        </span>
                        {activeCompany?.regNumber && (
                          <>
                            {" "}
                            (Reģ. Nr.{" "}
                            <span className="font-mono">
                              {activeCompany.regNumber}
                            </span>
                            )
                          </>
                        )}
                      </div>
                      <div className="text-[11.5px] text-red-700 mt-2">
                        Pārliecinies, vai šis rēķins ir paredzēts tavam uzņēmumam. Citādi atceļ.
                      </div>
                    </div>
                  </div>
                )}

                {/* SUPPLIER NOT IN PARTNERS warning — amber, blocks payment */}
                {!supplierIsKnown && (
                  <div className="mx-5 mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-amber-900">
                        Piegādātājs nav atrasts partneru sarakstā
                      </div>
                      <div className="text-[12px] text-amber-800 mt-1 leading-relaxed">
                        <span className="font-medium">
                          {currentItem.parsed.supplier}
                        </span>{" "}
                        nav reģistrēts kā partneris vai distributors. Pirms maksājuma sagatavošanas pievieno viņu sarakstam.
                      </div>
                      <div className="mt-3">
                        <Button size="sm" variant="default" onClick={openAddPartner}>
                          <Building2 className="h-3.5 w-3.5" />
                          Pievienot partneri
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUPPLIER IS KNOWN — quiet green confirmation */}
                {supplierIsKnown && supplierMatch && (
                  <div className="mx-5 mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <div className="text-[12px] text-emerald-800">
                      Piegādātājs atrasts:{" "}
                      <span className="font-medium">
                        {supplierMatch.entity.name}
                      </span>{" "}
                      <span className="text-emerald-600">
                        (
                        {supplierMatch.kind === "distributor"
                          ? "Distributors"
                          : "Partneris"}
                        )
                      </span>
                    </div>
                  </div>
                )}

                {/* AI-flagged notes (when something looks unusual) */}
                {currentItem.parsed.notes && (
                  <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[12px] text-amber-900 leading-relaxed">
                      {currentItem.parsed.notes}
                    </div>
                  </div>
                )}

                {/* All fields, grouped */}
                <div className="p-5 space-y-5">
                  {/* Supplier section */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-graphite-500 font-semibold mb-3">
                      Piegādātājs
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ParsedField
                        label="Nosaukums"
                        value={currentItem.parsed.supplier}
                        confidence={currentItem.parsed.confidence.supplier_name}
                        source={currentItem.parsed.sources.supplier_name}
                      />
                      {currentItem.parsed.supplier_reg_number && (
                        <ParsedField
                          label="Reģ. Nr."
                          value={currentItem.parsed.supplier_reg_number}
                          confidence={currentItem.parsed.confidence.supplier_reg_number}
                          mono
                        />
                      )}
                    </div>
                  </div>

                  {/* Invoice details section */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-graphite-500 font-semibold mb-3">
                      Rēķina informācija
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ParsedField
                        label="Rēķina numurs"
                        value={currentItem.parsed.invoiceNumber}
                        confidence={currentItem.parsed.confidence.invoice_number}
                        source={currentItem.parsed.sources.invoice_number}
                        mono
                      />
                      <ParsedField
                        label="Izsniegts"
                        value={currentItem.parsed.issueDate ? formatDate(currentItem.parsed.issueDate) : "—"}
                      />
                      <ParsedField
                        label="Apmaksāt līdz"
                        value={currentItem.parsed.dueDate ? formatDate(currentItem.parsed.dueDate) : "—"}
                        confidence={currentItem.parsed.confidence.due_date}
                        source={currentItem.parsed.sources.due_date}
                      />
                    </div>
                  </div>

                  {/* Amounts section */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-graphite-500 font-semibold mb-3">
                      Summas
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {currentItem.parsed.amount_without_vat > 0 && (
                        <ParsedField
                          label="Bez PVN"
                          value={`${currentItem.parsed.amount_without_vat.toFixed(2)} ${currentItem.parsed.currency}`}
                        />
                      )}
                      {currentItem.parsed.vat_amount > 0 && (
                        <ParsedField
                          label="PVN"
                          value={`${currentItem.parsed.vat_amount.toFixed(2)} ${currentItem.parsed.currency}`}
                        />
                      )}
                      <ParsedField
                        label={`Kopā (${currentItem.parsed.currency})`}
                        value={`${currentItem.parsed.amount.toFixed(2)} ${currentItem.parsed.currency}`}
                        confidence={currentItem.parsed.confidence.amount_total}
                        source={currentItem.parsed.sources.amount_total}
                        emphasize
                      />
                    </div>
                  </div>

                  {/* Payment section */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-graphite-500 font-semibold mb-3">
                      Maksājuma rekvizīti
                    </div>
                    <ParsedField
                      label="IBAN"
                      value={currentItem.parsed.iban || "—"}
                      confidence={currentItem.parsed.confidence.iban}
                      source={currentItem.parsed.sources.iban}
                      mono
                    />
                  </div>

                  {/* Accounting category + explanation — editable */}
                  <div className="border-t border-graphite-100 pt-5">
                    <div className="text-[11px] uppercase tracking-wider text-graphite-500 font-semibold mb-3">
                      Grāmatvedībai
                      {currentItem.parsed.suggestedCategory && (
                        <span className="ml-2 text-[10px] text-violet-600 font-medium normal-case tracking-normal">
                          AI ierosināja: {accountingCategoryLabels[currentItem.parsed.suggestedCategory]}
                        </span>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Category radio-style buttons */}
                      <div>
                        <Label className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                          Kategorija
                        </Label>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {(Object.keys(accountingCategoryLabels) as AccountingCategory[]).map((cat) => {
                            const selected = reviewCategory === cat;
                            const wasSuggested = currentItem.parsed?.suggestedCategory === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setReviewCategory(cat)}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-[12.5px] font-medium text-left transition-colors",
                                  selected
                                    ? "border-graphite-900 bg-graphite-900 text-white"
                                    : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
                                )}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span>{accountingCategoryLabels[cat]}</span>
                                  {wasSuggested && !selected && (
                                    <Sparkles className="h-3 w-3 text-violet-500" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Depreciation period — only shown for amortizacija */}
                      {reviewCategory === "amortizacija" && (
                        <div>
                          <Label className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                            Amortizācijas periods
                          </Label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {depreciationOptions.map((years) => {
                              const selected = reviewDepreciation === years;
                              return (
                                <button
                                  key={years}
                                  type="button"
                                  onClick={() => setReviewDepreciation(years)}
                                  className={cn(
                                    "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                                    selected
                                      ? "border-graphite-900 bg-graphite-900 text-white"
                                      : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
                                  )}
                                >
                                  {depreciationLabel(years)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Description / explanation — same field for both UI label
                          and accounting meta. AI pre-fills with synthesized
                          description; user edits if needed. */}
                      <div>
                        <Label className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                          Apraksts / Skaidrojums grāmatvedim
                        </Label>
                        <Textarea
                          value={reviewExplanation}
                          onChange={(e) => setReviewExplanation(e.target.value)}
                          className="mt-2 text-[13px] min-h-[60px]"
                          placeholder="Piem.: Telekomunikāciju pakalpojumi 04/2026"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0 border-t border-graphite-100 mt-2">
                  {/* Hint above the buttons explaining why submit might be blocked */}
                  {(!supplierIsKnown || recipientCheck === "mismatch") && (
                    <div className="text-[11.5px] text-graphite-500 mb-3 leading-relaxed">
                      {!supplierIsKnown && recipientCheck === "mismatch"
                        ? "Pirms maksājuma sagatavošanas pievieno piegādātāju partneru sarakstā un pārliecinies par adresātu."
                        : !supplierIsKnown
                        ? "Pirms maksājuma sagatavošanas pievieno piegādātāju partneru sarakstā."
                        : "Pārliecinies, vai šis rēķins ir paredzēts tavam aktīvajam uzņēmumam."}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={skipCurrent}
                    >
                      {readyItems.length > 1 ? "Izlaist" : "Atcelt"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handlePreparePayment}
                      disabled={
                        !supplierIsKnown || recipientCheck === "mismatch"
                      }
                      variant={
                        currentItem.parsed.isPaid ||
                        currentItem.parsed.isCreditNote
                          ? "secondary"
                          : "default"
                      }
                    >
                      <Send className="h-3.5 w-3.5" />
                      {currentItem.parsed.isCreditNote
                        ? "Pievienot vēsturei (kredīts)"
                        : currentItem.parsed.isPaid
                        ? "Pievienot vēsturei"
                        : readyItems.length > 1
                        ? "Apstiprināt un nākamais →"
                        : "Sagatavot maksājumu bankā"}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Queue progress summary — visible while there's anything in queue */}
      {queue.length > 0 && readyItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-graphite-200 bg-graphite-50 px-4 py-2.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-4 text-[12.5px]">
            <span className="text-graphite-700">
              <span className="font-semibold text-graphite-900">
                {readyItems.length}
              </span>{" "}
              gatavi pārskatīšanai
            </span>
            {parsingItems.length > 0 && (
              <span className="text-graphite-600 inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-graphite-300 animate-pulse" />
                Apstrādājas {parsingItems.length}
              </span>
            )}
            {errorItems.length > 0 && (
              <span className="text-red-600">
                {errorItems.length} ar kļūdām
              </span>
            )}
          </div>
          {queue.length > 1 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Notīrīt visu
            </Button>
          )}
        </motion.div>
      )}

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
        {received.length === 0 ? (
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
              {received.map((p) => {
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
                      <ReceivedStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <PnAktsButton
                          current={p.pnAkts}
                          onAttach={({ number, source, fileName }) =>
                            attachReceivedPN(p.id, number, source, fileName)
                          }
                          onRemove={() => detachReceivedPN(p.id)}
                        />
                        <Button
                          variant={hasMeta ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() => setMetaEditing(p)}
                          title="Skaidrojums grāmatvedībai"
                        >
                          <Sparkles className="h-3 w-3" />
                          {hasMeta ? "Labot skaidrojumu" : "Skaidrojums"}
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
                            onClick={() => markReceivedPaid(p.id)}
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

              {/* Action bar */}
              <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-graphite-100">
                <Button variant="ghost" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Lejupielādēt rēķinu
                </Button>
                {openedInvoice.pnAkts && (
                  <Button variant="ghost" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Lejupielādēt PN aktu
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(openedInvoice);
                    setOpenedInvoice(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Labot datus
                </Button>
              </div>
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
            setReceivedMeta(metaEditing.id, meta);
            setMetaEditing(null);
          }
        }}
      />

      {/* Bank exchange side-panel */}
      <BankExchangePanel
        open={bankPanelOpen}
        onOpenChange={setBankPanelOpen}
      />

      {/* Edit received payment modal */}
      <EditReceivedModal
        payment={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (editing) {
            updateReceived(editing.id, patch);
            setEditing(null);
          }
        }}
      />

      {/* Add-partner mini-modal — opens when AI-extracted supplier
          isn't found in the partner list. Pre-filled from AI data. */}
      <Dialog open={addPartnerOpen} onOpenChange={setAddPartnerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pievienot partneri</DialogTitle>
            <DialogDescription>
              Šis piegādātājs tiks pievienots partneru sarakstā. Pēc pievienošanas varēsi sagatavot maksājumu.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-[12px] font-medium text-graphite-700">
                Nosaukums
              </Label>
              <Input
                value={newPartnerName}
                onChange={(e) => setNewPartnerName(e.target.value)}
                placeholder="SIA Piemērs"
                className="mt-1.5"
              />
            </div>

            {currentItem?.parsed?.supplier_reg_number && (
              <div>
                <Label className="text-[12px] font-medium text-graphite-700">
                  Reģ. Nr.
                </Label>
                <p className="mt-1.5 text-[13px] font-mono text-graphite-600">
                  {currentItem.parsed.supplier_reg_number}
                </p>
              </div>
            )}

            <div>
              <Label className="text-[12px] font-medium text-graphite-700">
                Kategorija
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["piegadataji", "Piegādātāji"],
                    ["pakalpojumi", "Pakalpojumi"],
                    ["razotaji", "Ražotāji"],
                    ["logistika", "Loģistika"],
                  ] as [BusinessContactCategory, string][]
                ).map(([cat, label]) => {
                  const selected = newPartnerCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewPartnerCategory(cat)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-[12.5px] font-medium text-left transition-colors",
                        selected
                          ? "border-graphite-900 bg-graphite-900 text-white"
                          : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11.5px] text-graphite-500 leading-relaxed">
              Detalizētāku informāciju (adrese, kontaktpersona, e-pasts) varēsi pievienot vēlāk sadaļā Partneri.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-graphite-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddPartnerOpen(false)}
            >
              Atcelt
            </Button>
            <Button
              size="sm"
              onClick={submitAddPartner}
              disabled={!newPartnerName.trim()}
            >
              <Building2 className="h-3.5 w-3.5" />
              Pievienot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParsedField({
  label,
  value,
  mono,
  confidence,
  source,
  emphasize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** 0.0-1.0 from AI; below 0.7 shows a warning indicator */
  confidence?: number;
  /** Where in the document AI found this value (shown as tooltip) */
  source?: string;
  /** Larger/bolder for emphasized fields like the total */
  emphasize?: boolean;
}) {
  const isLowConfidence = confidence !== undefined && confidence < 0.7;

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Label className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
          {label}
        </Label>
        {isLowConfidence && (
          <span
            title={`AI nav drošs par šo lauku (${Math.round((confidence ?? 0) * 100)}%). Pārbaudi pirms apstiprināšanas.`}
            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-amber-100 text-amber-700 cursor-help"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1.5 text-[14px] font-medium text-graphite-900",
          mono && "font-mono text-[13px]",
          emphasize && "text-[16px] font-semibold",
          isLowConfidence && "text-amber-900"
        )}
      >
        {value}
      </p>
      {source && (
        <p className="mt-1 text-[10.5px] text-graphite-400 italic">
          {source}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Accounting meta tag shown in invoice row
// ============================================================

function AccountingMetaTag({ meta }: { meta: ReceivedInvoiceAccountingMeta }) {
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
  invoice: ReceivedInvoice | null;
  onClose: () => void;
  onSave: (meta: ReceivedInvoiceAccountingMeta) => void;
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
    const meta: ReceivedInvoiceAccountingMeta = {
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
