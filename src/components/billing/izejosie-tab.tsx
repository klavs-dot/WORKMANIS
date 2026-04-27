"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  FileEdit,
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
  Trash2,
  RefreshCw,
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
import type { Company } from "@/lib/types";
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
/**
 * Strip legal-form prefixes/suffixes and normalize whitespace
 * so two variants of the same company name compare equal.
 *
 * Handles short forms (SIA, AS, Ltd, GmbH) AND long forms
 * ('Sabiedrība ar ierobežotu atbildību', 'Akciju sabiedrība').
 * The long forms appear in formal documents while short forms
 * appear in everyday usage — same entity, different writing.
 */
function normalizeCompanyName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    // Long Latvian legal forms first (more specific → match before short)
    .replace(/\bsabiedrība\s+ar\s+ierobežotu\s+atbildību\b/g, "")
    .replace(/\bakciju\s+sabiedrība\b/g, "")
    .replace(/\bindividuālais\s+komersants\b/g, "")
    // Short forms (Latvian + common foreign)
    .replace(/\b(sia|as|a\/s|ik|ltd|llc|inc|gmbh|oy|oü|ou|ab)\b/g, "")
    // Punctuation that varies between sources
    .replace(/[.,'"`()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two company names refer to the same entity.
 *
 * Match logic, in priority order:
 *   1. If both reg numbers present AND match → definitely same.
 *   2. If both reg numbers present but DIFFER → still check name.
 *      One side may have a wrong reg number stored (common when
 *      a user typed it manually). If names normalize to the same
 *      thing, treat as match — the typo'd reg number shouldn't
 *      block legitimate matches.
 *   3. If one side missing reg number → fall back to name match.
 *
 * False positives (different companies, same name) are extremely
 * rare in practice — Latvia's company registry doesn't allow
 * exact duplicates. False negatives (real match treated as
 * mismatch) are much more common and more disruptive, so we
 * lean toward matching.
 */
function companiesMatch(
  aName: string,
  aRegNumber: string | undefined,
  bName: string,
  bRegNumber: string | undefined
): boolean {
  // Fast path: reg numbers both present and equal → definitely match
  if (aRegNumber && bRegNumber && aRegNumber.trim() === bRegNumber.trim()) {
    return true;
  }
  // Either reg numbers don't match, or one/both are missing.
  // Fall back to name-based matching.
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

// One queued file with status: parsing → ready (parsed ok) or error.
// User edits (category, explanation, depreciation period) are stored
// PER ITEM so they survive a page reload — not just in transient
// component state. This is what makes the queue act like a draft
// folder rather than an ephemeral review screen.
interface QueueItem {
  id: string;
  fileName: string;
  status: "parsing" | "ready" | "error";
  parsed?: ParsedFields;
  error?: string;
  /** User-editable fields, persisted across reloads. Initialized
   *  from AI suggestions when the parsed data first arrives. */
  edits?: {
    category: AccountingCategory;
    depreciationPeriod?: DepreciationPeriod;
    explanation: string;
  };
  /** When the file was added to the queue. Used to sort drafts
   *  oldest-first in the UI so the user works through them in
   *  the order they uploaded. */
  addedAt: string;
}

// ============================================================
// Draft persistence — queue saved to localStorage per company,
// so navigating away or closing the tab doesn't lose work.
// ============================================================

const DRAFTS_KEY_PREFIX = "workmanis:received-drafts:";

function loadDrafts(companyId: string): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY_PREFIX + companyId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    if (!Array.isArray(parsed)) return [];
    // Drop any items still in 'parsing' state from a previous
    // session — those would be orphans (the parse promise died
    // when the page unloaded). User can re-upload if needed.
    return parsed.filter((q) => q.status !== "parsing");
  } catch {
    return [];
  }
}

function saveDrafts(companyId: string, drafts: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    if (drafts.length === 0) {
      localStorage.removeItem(DRAFTS_KEY_PREFIX + companyId);
    } else {
      localStorage.setItem(
        DRAFTS_KEY_PREFIX + companyId,
        JSON.stringify(drafts)
      );
    }
  } catch {
    // localStorage quota — ignore. Worst case: drafts lost on
    // reload. Better than crashing the page.
  }
}

export function IzejosieTab() {
  const { received, addReceived, updateReceived, markReceivedPaid, setReceivedMeta, attachReceivedPN, detachReceivedPN } =
    useBilling();
  const { activeCompany } = useCompany();
  const network = useNetwork();
  const [isDragging, setIsDragging] = useState(false);
  // Queue of all files dropped (and not yet approved). Persists
  // to localStorage per company — see useEffect below.
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [openedInvoice, setOpenedInvoice] = useState<ReceivedInvoice | null>(
    null
  );
  const [metaEditing, setMetaEditing] = useState<ReceivedInvoice | null>(null);
  const [editing, setEditing] = useState<ReceivedInvoice | null>(null);
  const [bankPanelOpen, setBankPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // For "add new supplier" mini-modal when supplier isn't in
  // partner list yet. Pre-filled from AI extraction.
  const [addPartnerOpen, setAddPartnerOpen] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerCategory, setNewPartnerCategory] =
    useState<BusinessContactCategory>("piegadataji");
  /** Which queue item triggered the add-partner dialog. We need
   *  this so the partner name and reg-number prefill come from
   *  the right invoice (queue can have multiple suppliers). */
  const [addPartnerForItem, setAddPartnerForItem] = useState<string | null>(
    null
  );

  // ---------- Draft persistence ----------
  // Load saved drafts on first render (per company). The hasLoaded
  // ref ensures we don't overwrite the loaded data with the
  // initial empty array on the very first save effect run.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!activeCompany?.id) return;
    setQueue(loadDrafts(activeCompany.id));
    hasLoadedRef.current = true;
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!activeCompany?.id) return;
    if (!hasLoadedRef.current) return;
    saveDrafts(activeCompany.id, queue);
  }, [queue, activeCompany?.id]);

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
          q.id === item.id
            ? {
                ...q,
                status: "ready",
                parsed,
                edits: q.edits ?? {
                  // Initialize from AI suggestions on first parse.
                  // If user already had edits (e.g. they re-tried
                  // a parse on the same item), preserve them.
                  category:
                    parsed.suggestedCategory ?? "sanemts_pakalpojums",
                  depreciationPeriod:
                    parsed.suggestedDepreciationYears ?? 5,
                  explanation: parsed.description ?? "",
                },
              }
            : q
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
    const fileArray = Array.from(files);
    const newItems: QueueItem[] = fileArray.map((f) => ({
      id: `q-${Math.random().toString(36).slice(2, 10)}`,
      fileName: f.name,
      status: "parsing" as const,
      addedAt: new Date().toISOString(),
    }));
    setQueue((prev) => [...prev, ...newItems]);
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

  // Apply user edits (category, depreciation, explanation) for
  // a specific queue item. Stores get persisted automatically.
  const updateItemEdits = (
    id: string,
    patch: Partial<NonNullable<QueueItem["edits"]>>
  ) => {
    setQueue((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const current = q.edits ?? {
          category: "sanemts_pakalpojums",
          depreciationPeriod: 5,
          explanation: "",
        };
        return { ...q, edits: { ...current, ...patch } };
      })
    );
  };

  // Save a parsed-and-reviewed item: write to billing-store +
  // attach accounting metadata, then drop from queue.
  const approveItem = (item: QueueItem) => {
    if (!item.parsed) return;
    const p = item.parsed;
    const e = item.edits ?? {
      category: "sanemts_pakalpojums" as AccountingCategory,
      depreciationPeriod: 5 as DepreciationPeriod,
      explanation: p.description ?? "",
    };
    addReceived({
      supplier: p.supplier,
      invoiceNumber: p.invoiceNumber,
      amount: p.amount,
      iban: p.iban,
      dueDate: p.dueDate,
      fileName: item.fileName,
    });
    // Defer one tick for the optimistic invoice to land in
    // received[], then attach accounting meta. Match by fileName
    // (same approach as before; race-safe enough for V1).
    if (e.explanation.trim() || e.category) {
      setTimeout(() => {
        const justAdded = [...received]
          .reverse()
          .find((inv) => inv.fileName === item.fileName);
        if (justAdded) {
          setReceivedMeta(justAdded.id, {
            category: e.category,
            depreciationPeriod:
              e.category === "amortizacija" ? e.depreciationPeriod : undefined,
            explanation: e.explanation,
            updatedAt: new Date().toISOString(),
          });
        }
      }, 0);
    }
    removeFromQueue(item.id);
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  // Approve all items that are ready AND pass validation gates
  // (supplier known, recipient match). Items that fail gates
  // stay in the queue.
  const approveAllValid = () => {
    queue.forEach((item) => {
      if (item.status !== "ready" || !item.parsed) return;
      if (!checkSupplierKnown(item.parsed)) return;
      if (checkRecipient(item.parsed) === "mismatch") return;
      // Skip already-paid and credit notes — those are not
      // routine "send to bank" items, the user should review
      // each one explicitly.
      if (item.parsed.isPaid || item.parsed.isCreditNote) return;
      approveItem(item);
    });
  };

  const clearAll = () => {
    setQueue([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Open the add-partner dialog for a specific queue item.
  // Pre-fills name from that item's AI-extracted supplier.
  const openAddPartnerFor = (item: QueueItem) => {
    if (!item.parsed) return;
    setNewPartnerName(item.parsed.supplier);
    setNewPartnerCategory("piegadataji");
    setAddPartnerForItem(item.id);
    setAddPartnerOpen(true);
  };

  const submitAddPartner = () => {
    if (!newPartnerName.trim()) return;
    const sourceItem = queue.find((q) => q.id === addPartnerForItem);
    network.addContact({
      category: newPartnerCategory,
      name: newPartnerName.trim(),
      countryCode: "LV",
      address: "",
      contactPerson: "",
      email: "",
      phone: "",
      comment: sourceItem?.parsed?.supplier_reg_number
        ? `Reģ. Nr. ${sourceItem.parsed.supplier_reg_number} · Pievienots automātiski no rēķina.`
        : "Pievienots automātiski no rēķina.",
    });
    setAddPartnerOpen(false);
    setAddPartnerForItem(null);
  };

  // Queue stats — drives the summary header and bulk action button.
  const parsingItems = queue.filter((q) => q.status === "parsing");
  const readyItems = queue.filter((q) => q.status === "ready");
  const errorItems = queue.filter((q) => q.status === "error");

  // ---------- Validation helpers (per item) ----------
  // Used both for inline rendering of warning banners and for
  // gating "approve all" / individual approve buttons.

  const checkRecipient = (
    parsed: ParsedFields
  ): "match" | "mismatch" | "unknown" => {
    if (!parsed.recipient && !parsed.recipient_reg_number) return "unknown";
    if (!activeCompany) return "unknown";
    return companiesMatch(
      parsed.recipient ?? "",
      parsed.recipient_reg_number,
      activeCompany.legalName ?? activeCompany.name,
      activeCompany.regNumber
    )
      ? "match"
      : "mismatch";
  };

  const findSupplierMatch = (parsed: ParsedFields) => {
    const distHit = network.distributors.find((d) =>
      companiesMatch(d.name, undefined, parsed.supplier, parsed.supplier_reg_number)
    );
    if (distHit) return { kind: "distributor" as const, entity: distHit };
    const contactHit = network.contacts.find((c) =>
      companiesMatch(c.name, undefined, parsed.supplier, parsed.supplier_reg_number)
    );
    if (contactHit) return { kind: "contact" as const, entity: contactHit };
    return null;
  };

  const checkSupplierKnown = (parsed: ParsedFields): boolean =>
    findSupplierMatch(parsed) !== null;

  return (
    <div className="space-y-6">
      {/* Drop zone — full size when queue is empty, compact strip
          when there are drafts so the queue stays the focus */}
      <DropZone
        compact={queue.length > 0}
        isDragging={isDragging}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Drafts area — visible whenever queue has any items.
          Each invoice renders as its own card, stacked top-to-bottom
          in upload order. Drafts persist to localStorage so they
          survive navigation and reload. */}
      {queue.length > 0 && (
        <div className="space-y-4">
          {/* Header with summary + bulk actions */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900 flex items-center gap-2">
                <FileEdit className="h-4 w-4 text-graphite-500" />
                Melnraksti
                <span className="inline-flex items-center rounded-md bg-graphite-100 px-2 py-0.5 text-[11px] font-mono font-medium text-graphite-700">
                  {queue.length}
                </span>
              </h3>
              <p className="mt-0.5 text-[12px] text-graphite-500">
                {readyItems.length > 0 && (
                  <>
                    <span className="text-emerald-600 font-medium">
                      {readyItems.length} gatavi
                    </span>
                    {(parsingItems.length > 0 || errorItems.length > 0) && " · "}
                  </>
                )}
                {parsingItems.length > 0 && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-graphite-400 animate-pulse" />
                      Apstrādājas {parsingItems.length}
                    </span>
                    {errorItems.length > 0 && " · "}
                  </>
                )}
                {errorItems.length > 0 && (
                  <span className="text-red-600 font-medium">
                    {errorItems.length} ar kļūdu
                  </span>
                )}
                {parsingItems.length === 0 &&
                  errorItems.length === 0 &&
                  readyItems.length === 0 && (
                    <span>Saglabājas automātiski</span>
                  )}
                {parsingItems.length === 0 && (
                  <span className="text-graphite-400 ml-2">
                    · Saglabājas automātiski
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {readyItems.length > 1 && (
                <Button size="sm" onClick={approveAllValid}>
                  <Check className="h-3.5 w-3.5" />
                  Apstiprināt visus derīgos
                </Button>
              )}
              {queue.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <X className="h-3.5 w-3.5" />
                  Notīrīt visu
                </Button>
              )}
            </div>
          </div>

          {/* Robot + funny rotating messages — visible only while
              at least one item is still being parsed. Sits between
              the section header and the cards so the user sees the
              robot reacting to the work in real time, instead of
              just stale spinners on each card. */}
          <AnimatePresence>
            {parsingItems.length > 0 && (
              <FunnyParsingState count={parsingItems.length} />
            )}
          </AnimatePresence>

          {/* Stacked invoice cards, oldest first (upload order) */}
          <div className="space-y-4">
            {[...queue]
              .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
              .map((item) => (
                <InvoiceDraftCard
                  key={item.id}
                  item={item}
                  recipientStatus={
                    item.parsed ? checkRecipient(item.parsed) : "unknown"
                  }
                  supplierMatch={
                    item.parsed ? findSupplierMatch(item.parsed) : null
                  }
                  activeCompany={activeCompany}
                  onUpdateEdits={(patch) => updateItemEdits(item.id, patch)}
                  onApprove={() => approveItem(item)}
                  onRemove={() => removeFromQueue(item.id)}
                  onAddPartner={() => openAddPartnerFor(item)}
                />
              ))}
          </div>
        </div>
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

            {(() => {
              const sourceItem = queue.find((q) => q.id === addPartnerForItem);
              if (!sourceItem?.parsed?.supplier_reg_number) return null;
              return (
                <div>
                  <Label className="text-[12px] font-medium text-graphite-700">
                    Reģ. Nr.
                  </Label>
                  <p className="mt-1.5 text-[13px] font-mono text-graphite-600">
                    {sourceItem.parsed.supplier_reg_number}
                  </p>
                </div>
              );
            })()}

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

// ============================================================
// Funny parsing state — keeps the user entertained while AI
// crunches through PDFs. Rotates messages every ~2.8s, shows
// an animated robot doing... robot things, plus a progress
// bar that estimates based on file count.
// ============================================================

const FUNNY_MESSAGES = [
  "Ouu, iegūstu datus!",
  "Šis nu gan rēķins...",
  "Atkal skaitām projām",
  "Šim SIA dīvains nosaukums, bet par gaumi nestrīdās",
  "Šim SIA man patīk nosaukums",
  "Un tā katru reizi man viss jādara pašam...",
  "Man liekas, ka par šo arī jāsāk prasīt nauda. Tā kā robotu, man var nemaksāt?",
  "Hmm, kas šeit ir... ahā!",
  "Burtu pēc burta, kā veciem labiem laikiem",
  "Cik gan grūti pieliek tikai pareizo rēķina numuru?",
  "Vai tiešām šis ir 21% PVN? Kā vienmēr...",
  "IBAN... IBAN... atrasts!",
  "Ā, šī ir tā gudrā SIA, ko visi pazīst",
  "Pirmā kafija šodien, otrais rēķins",
  "Kāpēc PDF-i nav vienkārši Excel?",
  "Skaitļi labi, bet kur palika datums?",
  "Lasu sīko druku ar sīko aci",
  "Tas pats fonts kā citur. Atkārtošanās!",
  "Pareizi, summa Eiro, nevis dolāros",
  "Šis kungs grib tikt apmaksāts ātri",
  "Skanē, skanē, līdz skanē...",
  "Ahā, šeit ir slēptais rēķina numurs!",
  "Vai tas ir LV vai LT IBAN? Pārbaudu...",
  "Reģ. nr. — vienpadsmit cipari, kā nopirkti",
  "Pacietība, tūlīt būs gatavs",
  "Šis rēķins man liekas pazīstams",
  "Kā labi, ka esmu robots un nav dzīves",
  "Vēl pāris sekundes... vai tomēr minūtes?",
  "Klusi, lasu...",
  "Tā tā, papīrs ir labāk par cilvēkiem",
];

function FunnyParsingState({ count }: { count: number }) {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * FUNNY_MESSAGES.length)
  );
  const [progress, setProgress] = useState(0);

  // Rotate the funny message every 2.8s
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(
        (prev) => (prev + 1 + Math.floor(Math.random() * 3)) % FUNNY_MESSAGES.length
      );
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Fake progress bar — eases toward 95% based on file count.
  // Real completion (jump to 100% + UI swap) happens externally
  // when parseOneFile returns. The bar is just for vibes.
  useEffect(() => {
    setProgress(0);
    // Estimated time per invoice ~6s for Sonnet 4.6 vision; cap at 95%
    const estimatedTotalMs = count * 6000;
    const tickMs = 100;
    const ticks = estimatedTotalMs / tickMs;
    let currentTick = 0;
    const interval = setInterval(() => {
      currentTick += 1;
      // Asymptotic approach to 95%, slows down as it goes
      const linear = Math.min(currentTick / ticks, 1);
      const eased = 1 - Math.pow(1 - linear, 2.5);
      setProgress(Math.min(eased * 95, 95));
    }, tickMs);
    return () => clearInterval(interval);
  }, [count]);

  return (
    <motion.div
      key="parsing"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-graphite-200 bg-gradient-to-r from-white to-graphite-50 px-4 py-3.5 overflow-hidden"
    >
      <div className="flex items-center gap-4">
        {/* Robot — pinned left, smaller scale than full version */}
        <div className="shrink-0 -my-1">
          <RobotAnimation />
        </div>

        {/* Text + progress, fills remaining space */}
        <div className="flex-1 min-w-0">
          {/* Top line: count header */}
          <div className="text-[12.5px] text-graphite-700 font-semibold">
            {count === 1
              ? "Apstrādāju 1 rēķinu…"
              : `Apstrādāju ${count} rēķinus paralēli…`}
          </div>

          {/* Rotating funny message, fixed height to prevent jitter */}
          <div className="h-5 mt-0.5 flex items-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35 }}
                className="text-[12px] text-graphite-500 italic truncate"
              >
                {FUNNY_MESSAGES[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Slim progress bar */}
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1 h-1 rounded-full bg-graphite-100 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-violet-500 to-graphite-900 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <span className="text-[10px] text-graphite-400 font-mono shrink-0 w-8 text-right">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Animated robot. Pure SVG + framer-motion — no external assets.
// The robot bobs up and down, antenna pulses, eyes blink, arms
// wave. Designed to feel friendly and a bit silly.
function RobotAnimation() {
  return (
    <motion.div
      animate={{
        y: [0, -6, 0],
      }}
      transition={{
        duration: 1.6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className="relative"
    >
      <svg width="80" height="90" viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Antenna line */}
        <line x1="40" y1="14" x2="40" y2="22" stroke="#475569" strokeWidth="2" strokeLinecap="round" />

        {/* Antenna ball — pulses */}
        <motion.circle
          cx="40"
          cy="11"
          r="3.5"
          fill="#8b5cf6"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Head */}
        <rect
          x="22"
          y="22"
          width="36"
          height="30"
          rx="6"
          fill="#1e293b"
        />

        {/* Eyes — blink occasionally */}
        <motion.g
          animate={{
            scaleY: [1, 1, 0.1, 1, 1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            times: [0, 0.85, 0.9, 0.95, 1],
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "40px 35px" }}
        >
          <circle cx="32" cy="35" r="3.5" fill="#34d399" />
          <circle cx="48" cy="35" r="3.5" fill="#34d399" />
        </motion.g>

        {/* Mouth — small smile */}
        <path
          d="M 32 44 Q 40 48 48 44"
          stroke="#475569"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />

        {/* Body */}
        <rect
          x="26"
          y="55"
          width="28"
          height="22"
          rx="3"
          fill="#334155"
        />

        {/* Body decoration — chest light */}
        <motion.circle
          cx="40"
          cy="64"
          r="2.5"
          fill="#f59e0b"
          animate={{
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
          }}
        />

        {/* Left arm — waves */}
        <motion.g
          style={{ transformOrigin: "26px 60px" }}
          animate={{
            rotate: [-15, 15, -15],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <line x1="26" y1="60" x2="14" y2="68" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          <circle cx="13" cy="69" r="3" fill="#1e293b" />
        </motion.g>

        {/* Right arm — waves opposite */}
        <motion.g
          style={{ transformOrigin: "54px 60px" }}
          animate={{
            rotate: [15, -15, 15],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <line x1="54" y1="60" x2="66" y2="68" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          <circle cx="67" cy="69" r="3" fill="#1e293b" />
        </motion.g>

        {/* Legs */}
        <rect x="30" y="77" width="6" height="10" rx="1.5" fill="#1e293b" />
        <rect x="44" y="77" width="6" height="10" rx="1.5" fill="#1e293b" />
      </svg>
    </motion.div>
  );
}

// ============================================================
// DropZone — full size when queue is empty (initial state),
// compact strip when there are drafts (so the queue stays the
// visual focus, but user can still drop more files).
// ============================================================

function DropZone({
  compact,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  compact: boolean;
  isDragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  if (compact) {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        className={cn(
          "rounded-xl border-2 border-dashed transition-all cursor-pointer",
          "flex items-center gap-3 px-4 py-3",
          isDragging
            ? "border-graphite-900 bg-graphite-50"
            : "border-graphite-200 bg-white hover:border-graphite-300 hover:bg-graphite-50/40"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors",
            isDragging
              ? "bg-graphite-900 text-white"
              : "bg-graphite-100 text-graphite-700"
          )}
        >
          <Upload className="h-3.5 w-3.5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium text-graphite-700">
            Pievienot vēl rēķinus
          </div>
          <p className="text-[11px] text-graphite-500">
            Ievelc šeit vai klikšķini, lai izvēlētos
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={cn(
        "rounded-2xl border-2 border-dashed transition-all cursor-pointer",
        "flex flex-col items-center justify-center py-14 px-6 text-center",
        isDragging
          ? "border-graphite-900 bg-graphite-50 scale-[1.005]"
          : "border-graphite-200 bg-white hover:border-graphite-300 hover:bg-graphite-50/40"
      )}
    >
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
        PDF faili · Automātiski izgūsim piegādātāju, summu, IBAN un apmaksas
        termiņu · Vairāki uzreiz arī iet
      </p>
      <Button variant="secondary" size="sm" className="mt-4">
        <Upload className="h-3.5 w-3.5" />
        Izvēlēties failu
      </Button>
    </motion.div>
  );
}

// ============================================================
// InvoiceDraftCard — renders one queue item in any of its three
// states (parsing / ready / error). Kept as a single component
// so user can compare cards visually side-by-side and bulk
// approve. Errors render in-place rather than in a separate
// banner above the queue.
// ============================================================

function InvoiceDraftCard({
  item,
  recipientStatus,
  supplierMatch,
  activeCompany,
  onUpdateEdits,
  onApprove,
  onRemove,
  onAddPartner,
}: {
  item: QueueItem;
  recipientStatus: "match" | "mismatch" | "unknown";
  supplierMatch:
    | { kind: "distributor"; entity: { name: string } }
    | { kind: "contact"; entity: { name: string; category: string } }
    | null;
  activeCompany: Company | null;
  onUpdateEdits: (patch: Partial<NonNullable<QueueItem["edits"]>>) => void;
  onApprove: () => void;
  onRemove: () => void;
  onAddPartner: () => void;
}) {
  // ---------- Parsing state ----------
  if (item.status === "parsing") {
    return (
      <Card className="overflow-hidden">
        <div className="p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-graphite-50 flex items-center justify-center shrink-0">
            <div className="h-4 w-4 rounded-full border-2 border-graphite-200 border-t-graphite-900 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-graphite-700 truncate">
              {item.fileName}
            </p>
            <p className="text-[11.5px] text-graphite-500 italic mt-0.5">
              Dikti cītīgi iegūstu datus…
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            title="Noņemt no melnrakstiem"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    );
  }

  // ---------- Error state ----------
  if (item.status === "error") {
    return (
      <Card className="overflow-hidden border-red-200">
        <div className="p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-graphite-900 truncate">
              {item.fileName}
            </p>
            <p className="text-[12px] text-red-700 mt-1 leading-relaxed">
              {item.error ?? "Nezināma kļūda apstrādājot rēķinu"}
            </p>
            <p className="mt-2 text-[11.5px] text-graphite-500 leading-relaxed">
              Mēģini vēlreiz augšupielādēt failu vai noņem to no melnrakstiem.
              Bieži tas ir saistīts ar nesaskenētu PDF vai sliktu attēla
              kvalitāti.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            title="Noņemt no melnrakstiem"
            className="shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    );
  }

  // ---------- Ready state — full review form ----------
  if (!item.parsed || !item.edits) return null;
  const p = item.parsed;
  const e = item.edits;

  const isPaid = p.isPaid;
  const isCreditNote = p.isCreditNote;
  const supplierIsKnown = supplierMatch !== null;
  const submitDisabled =
    !supplierIsKnown || recipientStatus === "mismatch";

  let buttonLabel: string;
  if (isCreditNote) buttonLabel = "Pievienot vēsturei (kredīts)";
  else if (isPaid) buttonLabel = "Pievienot vēsturei";
  else buttonLabel = "Sagatavot maksājumu bankā";

  let disabledReason: string | null = null;
  if (!supplierIsKnown && recipientStatus === "mismatch") {
    disabledReason =
      "Lai turpinātu: pievieno piegādātāju partneru sarakstā un pārbaudi adresātu.";
  } else if (!supplierIsKnown) {
    disabledReason = "Lai turpinātu: pievieno piegādātāju partneru sarakstā.";
  } else if (recipientStatus === "mismatch") {
    disabledReason =
      "Šis rēķins nav adresēts aktīvajam uzņēmumam — pārbaudi vai izvēlies citu uzņēmumu.";
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-graphite-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight text-graphite-900 truncate">
              {p.supplier || "Nezināms piegādātājs"}
            </h3>
            <p className="text-[11.5px] text-graphite-500 mt-0.5 font-mono truncate">
              {item.fileName}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          title="Noņemt no melnrakstiem"
          className="shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="p-5 space-y-4">
        {/* Banners — paid, credit note, recipient mismatch, supplier */}
        {isPaid && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-red-900">
                Šis rēķins jau ir apmaksāts
              </p>
              {p.paidEvidence && (
                <p className="text-[11.5px] text-red-700 mt-0.5 italic">
                  AI atrada: &ldquo;{p.paidEvidence}&rdquo;
                </p>
              )}
              <p className="text-[11.5px] text-red-700 mt-1">
                Pievienojot to, tas ieies vēsturē kā jau apmaksāts, ne kā
                gaidāms maksājums.
              </p>
            </div>
          </div>
        )}

        {isCreditNote && (
          <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-violet-900">
                Šis ir kredītrēķins, nevis maksājuma rēķins
              </p>
              {p.creditNoteEvidence && (
                <p className="text-[11.5px] text-violet-700 mt-0.5 italic">
                  AI atrada: &ldquo;{p.creditNoteEvidence}&rdquo;
                </p>
              )}
              <p className="text-[11.5px] text-violet-700 mt-1">
                Kredītrēķins atgriež naudu — to nav jāmaksā. Pievienojot, tas
                būs vēsturē kā informācija.
              </p>
            </div>
          </div>
        )}

        {recipientStatus === "mismatch" && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12.5px] font-semibold text-red-900">
                Šis rēķins nav adresēts tev
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-[11.5px]">
                <div>
                  <p className="text-red-700 font-medium">Rēķinā:</p>
                  <p className="text-red-900 truncate">{p.recipient ?? "—"}</p>
                  {p.recipient_reg_number && (
                    <p className="font-mono text-red-700 mt-0.5">
                      {p.recipient_reg_number}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-red-700 font-medium">Aktīvais uzņēmums:</p>
                  <p className="text-red-900 truncate">
                    {activeCompany?.legalName ?? activeCompany?.name ?? "—"}
                  </p>
                  {activeCompany?.regNumber && (
                    <p className="font-mono text-red-700 mt-0.5">
                      {activeCompany.regNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!supplierIsKnown && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Building2 className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-amber-900">
                  Piegādātājs nav atrasts partneru sarakstā
                </p>
                <p className="text-[11.5px] text-amber-700 mt-0.5 truncate">
                  {p.supplier}
                  {p.supplier_reg_number && ` · ${p.supplier_reg_number}`}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={onAddPartner}
              className="shrink-0"
            >
              <Building2 className="h-3.5 w-3.5" />
              Pievienot partneri
            </Button>
          </div>
        )}

        {supplierIsKnown && supplierMatch && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2 text-[11.5px] text-emerald-800">
            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>
              Piegādātājs atrasts:{" "}
              <span className="font-semibold">{supplierMatch.entity.name}</span>{" "}
              <span className="text-emerald-600">
                (
                {supplierMatch.kind === "distributor"
                  ? "Distributors"
                  : "Partneris"}
                )
              </span>
            </span>
          </div>
        )}

        {/* Parsed fields — 2 columns */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
          <ParsedField
            label="Piegādātājs"
            value={p.supplier}
            confidence={p.confidence.supplier_name}
            source={p.sources.supplier_name}
          />
          <ParsedField
            label="Rēķina nr."
            value={p.invoiceNumber}
            mono
            confidence={p.confidence.invoice_number}
            source={p.sources.invoice_number}
          />
          <ParsedField
            label="Summa kopā"
            value={`${p.amount.toFixed(2)} ${p.currency}`}
            mono
            confidence={p.confidence.amount_total}
            source={p.sources.amount_total}
          />
          <ParsedField
            label="IBAN"
            value={p.iban || "—"}
            mono
            confidence={p.confidence.iban}
            source={p.sources.iban}
          />
          <ParsedField
            label="Izrakstīts"
            value={p.issueDate ? formatDate(p.issueDate) : "—"}
          />
          <ParsedField
            label="Apmaksas termiņš"
            value={p.dueDate ? formatDate(p.dueDate) : "—"}
            confidence={p.confidence.due_date}
            source={p.sources.due_date}
          />
        </div>

        {/* Category + explanation editor */}
        <div className="pt-3 border-t border-graphite-100 space-y-3">
          <div>
            <Label className="text-[11.5px] font-medium text-graphite-700 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-500" />
              Grāmatvedības kategorija
              {p.suggestedCategory && (
                <span className="text-[10.5px] text-graphite-400 font-normal italic">
                  · AI ierosināja
                </span>
              )}
            </Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(
                [
                  ["izejvielas", "Izejvielas"],
                  ["sarazota_produkcija", "Saražotā produkcija"],
                  ["sanemts_pakalpojums", "Saņemtais pakalpojums"],
                  ["amortizacija", "Amortizācija"],
                ] as [AccountingCategory, string][]
              ).map(([cat, label]) => {
                const selected = e.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onUpdateEdits({ category: cat })}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium text-left transition-colors",
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

          {e.category === "amortizacija" && (
            <div>
              <Label className="text-[11.5px] font-medium text-graphite-700">
                Amortizācijas periods
              </Label>
              <div className="mt-1.5 flex gap-1.5">
                {([3, 5, 7, 10] as DepreciationPeriod[]).map((years) => {
                  const selected = e.depreciationPeriod === years;
                  return (
                    <button
                      key={years}
                      type="button"
                      onClick={() =>
                        onUpdateEdits({ depreciationPeriod: years })
                      }
                      className={cn(
                        "rounded-md border px-3 py-1 text-[11.5px] font-medium transition-colors",
                        selected
                          ? "border-graphite-900 bg-graphite-900 text-white"
                          : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
                      )}
                    >
                      {years} gadi
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <Label className="text-[11.5px] font-medium text-graphite-700">
              Skaidrojums grāmatvedei
            </Label>
            <Textarea
              value={e.explanation}
              onChange={(ev) => onUpdateEdits({ explanation: ev.target.value })}
              placeholder="Par ko šis rēķins, kāds bija mērķis…"
              rows={2}
              className="mt-1.5 text-[12.5px]"
            />
          </div>
        </div>

        {/* Action footer */}
        <div className="pt-3 border-t border-graphite-100 flex items-center justify-between gap-3">
          {disabledReason ? (
            <p className="text-[11px] text-graphite-500 italic max-w-md leading-relaxed">
              {disabledReason}
            </p>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            variant={isPaid || isCreditNote ? "secondary" : "default"}
            onClick={onApprove}
            disabled={submitDisabled}
            className="shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
