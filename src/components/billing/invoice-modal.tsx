"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Save,
  X,
  Bookmark,
  Info,
  Sparkles,
  Package,
  Wrench,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClientPicker } from "./client-picker";
import { ClientModal } from "./client-modal";
import { ProductLinesEditor } from "./product-lines-editor";
import { useClients, createEmptyLine } from "@/lib/clients-store";
import { useBilling } from "@/lib/billing-store";
import { resolveVAT } from "@/lib/vat-resolver";
import { calculateTotals } from "@/lib/invoice-calc";
import { generateNumber, previewNumber } from "@/lib/number-generator";
import { formatCurrency, cn } from "@/lib/utils";
import type {
  Client,
  InvoiceContent,
  InvoiceKind,
  InvoiceLanguage,
  ProductLine,
  InvoiceTemplate,
} from "@/lib/billing-types";

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When editing, pass invoice id; number is preserved */
  editingNumber?: string;
  /** Pre-select client when opening (e.g. from client detail page) */
  initialClient?: Client | null;
  /** Pre-apply a template when opening (e.g. from templates tab) */
  initialTemplate?: InvoiceTemplate | null;
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoiceModal({
  open,
  onOpenChange,
  editingNumber,
  initialClient,
  initialTemplate,
}: InvoiceModalProps) {
  const { addIssued } = useBilling();
  const { templatesForClient, addTemplate } = useClients();

  // Client
  const [client, setClient] = useState<Client | null>(null);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientPrefillName, setClientPrefillName] = useState<string | undefined>();

  // Invoice content
  const [language, setLanguage] = useState<InvoiceLanguage>("lv");
  const [kind, setKind] = useState<InvoiceKind>("pakalpojums");

  // Pakalpojums
  const [svcDescription, setSvcDescription] = useState("");
  const [svcAmount, setSvcAmount] = useState<number>(0);
  const [svcVatPercent, setSvcVatPercent] = useState<number>(21);

  // Prece
  const [lines, setLines] = useState<ProductLine[]>([createEmptyLine()]);

  // Meta
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDays(todayISO(), 5));

  // Template save
  const [templateKeyword, setTemplateKeyword] = useState("");
  const [tplSavedToast, setTplSavedToast] = useState(false);

  const isEditing = !!editingNumber;
  const assignedNumber = isEditing ? editingNumber : null;
  const previewNum = !isEditing ? previewNumber("invoice") : null;

  // Reset on open
  useEffect(() => {
    if (!open) return;
    if (!isEditing) {
      setClient(initialClient ?? null);
      setLanguage(initialTemplate?.language ?? "lv");
      if (initialTemplate) {
        setKind(initialTemplate.content.kind);
        if (initialTemplate.content.kind === "pakalpojums") {
          setSvcDescription(initialTemplate.content.description);
          setSvcAmount(initialTemplate.content.amount);
          setSvcVatPercent(initialTemplate.content.vatPercent);
          setLines([createEmptyLine()]);
        } else {
          setLines(
            initialTemplate.content.lines.map((l) => ({
              ...l,
              id: Math.random().toString(36).slice(2, 10),
            }))
          );
          setSvcDescription("");
          setSvcAmount(0);
          setSvcVatPercent(21);
        }
        setReference(initialTemplate.reference ?? "");
      } else {
        setKind("pakalpojums");
        setSvcDescription("");
        setSvcAmount(0);
        setSvcVatPercent(21);
        setLines([createEmptyLine()]);
        setReference("");
      }
      setDate(todayISO());
      setDueDate(addDays(todayISO(), 5));
      setTemplateKeyword("");
    }
    setTplSavedToast(false);
  }, [open, isEditing, initialClient, initialTemplate]);

  // Auto-update dueDate when date changes (+5 days from date)
  useEffect(() => {
    setDueDate((prev) => {
      // Only auto-adjust if dueDate is currently set to +5 from previous date
      // For simplicity: always push +5 when date changes through the date picker
      return addDays(date, 5);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Templates for current client
  const availableTemplates = client ? templatesForClient(client.id) : [];

  // VAT resolution
  const vat = useMemo(() => resolveVAT(client), [client]);

  // Apply VAT to content percentage whenever VAT mode changes
  useEffect(() => {
    if (!vat.appliesVAT) {
      setSvcVatPercent(0);
      setLines((prev) =>
        prev.map((l) => ({ ...l, vatPercent: 0 }))
      );
    } else {
      // Reset to default 21% if currently 0
      setSvcVatPercent((p) => (p === 0 ? 21 : p));
      setLines((prev) =>
        prev.map((l) => (l.vatPercent === 0 ? { ...l, vatPercent: 21 } : l))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vat.mode]);

  // Current content object
  const content: InvoiceContent =
    kind === "pakalpojums"
      ? {
          kind: "pakalpojums",
          description: svcDescription,
          amount: svcAmount,
          vatPercent: svcVatPercent,
        }
      : { kind: "prece", lines };

  const totals = useMemo(
    () => calculateTotals(content, vat.appliesVAT),
    [content, vat.appliesVAT]
  );

  // Apply template
  const applyTemplate = (tpl: InvoiceTemplate) => {
    setLanguage(tpl.language);
    setKind(tpl.content.kind);
    if (tpl.content.kind === "pakalpojums") {
      setSvcDescription(tpl.content.description);
      setSvcAmount(tpl.content.amount);
      setSvcVatPercent(vat.appliesVAT ? tpl.content.vatPercent : 0);
    } else {
      setLines(
        tpl.content.lines.map((l) => ({
          ...l,
          id: Math.random().toString(36).slice(2, 10),
          vatPercent: vat.appliesVAT ? l.vatPercent : 0,
        }))
      );
    }
    if (tpl.reference) setReference(tpl.reference);
  };

  const saveAsTemplate = () => {
    if (!client || !templateKeyword.trim()) return;
    addTemplate({
      keyword: templateKeyword.trim(),
      clientId: client.id,
      language,
      content,
      reference: reference || undefined,
    });
    setTemplateKeyword("");
    setTplSavedToast(true);
    setTimeout(() => setTplSavedToast(false), 2600);
  };

  const issueInvoice = () => {
    if (!client) return;
    const number = isEditing ? editingNumber! : generateNumber("invoice");

    // Convert to legacy IssuedInvoice format for billing-store compatibility
    // Future: replace with PersistedInvoiceV2 when store is migrated
    addIssued({
      number,
      client: client.name,
      description:
        content.kind === "pakalpojums"
          ? content.description
          : content.lines.map((l) => l.name).join(", "),
      amount: totals.subtotal,
      vat: totals.vatAmount,
      date,
      dueDate,
      status: "gaidam_apmaksu",
    });
    onOpenChange(false);
  };

  const saveDraft = () => {
    // Placeholder: save with status = melnraksts
    if (!client) return;
    const number = isEditing ? editingNumber! : generateNumber("invoice");
    addIssued({
      number,
      client: client.name,
      description:
        content.kind === "pakalpojums"
          ? content.description
          : content.lines.map((l) => l.name).join(", "),
      amount: totals.subtotal,
      vat: totals.vatAmount,
      date,
      dueDate,
      status: "gaidam_apmaksu", // store doesn't support draft yet
    });
    onOpenChange(false);
  };

  const canIssue =
    !!client &&
    (kind === "pakalpojums"
      ? !!svcDescription && svcAmount > 0
      : lines.every((l) => l.name && l.quantity > 0 && l.unitPrice >= 0));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Labot rēķinu" : "Izrakstīt jaunu rēķinu"}
            </DialogTitle>
            <DialogDescription>
              {isEditing && assignedNumber ? (
                <>
                  Numurs:{" "}
                  <span className="font-mono text-graphite-700">
                    Rēķins Nr. {assignedNumber}
                  </span>
                </>
              ) : previewNum ? (
                <>
                  Tiks piešķirts:{" "}
                  <span className="font-mono text-graphite-700">
                    Rēķins Nr. {previewNum}
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {/* ========= 1) KLIENTS ========= */}
            <Section
              step={1}
              title="Klients"
              description="Izvēlies esošu klientu vai pievieno jaunu"
            >
              <ClientPicker
                value={client}
                onChange={setClient}
                onCreateNew={(name) => {
                  setClientPrefillName(name);
                  setClientModalOpen(true);
                }}
              />

              {/* Templates for selected client */}
              {client && availableTemplates.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-graphite-500 mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    Pieejamie paraugi
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-graphite-200 bg-white px-2.5 py-1 text-[12px] font-medium text-graphite-700 hover:border-graphite-900 hover:bg-graphite-50 transition-colors"
                      >
                        <Bookmark className="h-3 w-3 text-graphite-400" />
                        {tpl.keyword}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* ========= 2) VALODA ========= */}
            <Section
              step={2}
              title="Rēķina valoda"
              description="Valoda, kādā tiks ģenerēts PDF"
            >
              <SegmentedPill
                value={language}
                onChange={(v) => setLanguage(v as InvoiceLanguage)}
                options={[
                  { value: "lv", label: "Latviešu" },
                  { value: "en", label: "Angļu" },
                ]}
              />
            </Section>

            {/* ========= 3) VEIDS ========= */}
            <Section
              step={3}
              title="Rēķina veids"
              description="Pakalpojums ir vienkāršs rēķins, Prece — ar vairākām rindām"
            >
              <div className="grid grid-cols-2 gap-2">
                <KindCard
                  active={kind === "pakalpojums"}
                  onClick={() => setKind("pakalpojums")}
                  icon={Wrench}
                  title="Pakalpojums"
                  description="Viens apraksts un summa"
                />
                <KindCard
                  active={kind === "prece"}
                  onClick={() => setKind("prece")}
                  icon={Package}
                  title="Prece"
                  description="Vairākas preces ar skaitu"
                />
              </div>
            </Section>

            {/* ========= 4) SATURS ========= */}
            <Section
              step={4}
              title={kind === "pakalpojums" ? "Pakalpojums" : "Preces"}
            >
              <AnimatePresence mode="wait">
                {kind === "pakalpojums" ? (
                  <motion.div
                    key="service"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <div className="space-y-1.5">
                      <Label>Pakalpojuma apraksts</Label>
                      <Textarea
                        value={svcDescription}
                        onChange={(e) => setSvcDescription(e.target.value)}
                        placeholder="Pakalpojuma apraksts…"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <FieldCompact label="Summa bez PVN">
                        <Input
                          type="number"
                          step="0.01"
                          value={svcAmount}
                          onChange={(e) =>
                            setSvcAmount(parseFloat(e.target.value) || 0)
                          }
                          className="text-right tabular"
                        />
                      </FieldCompact>
                      <FieldCompact label="PVN %">
                        <Input
                          type="number"
                          step="1"
                          value={svcVatPercent}
                          onChange={(e) =>
                            setSvcVatPercent(parseFloat(e.target.value) || 0)
                          }
                          disabled={!vat.appliesVAT}
                          className="text-right tabular"
                        />
                      </FieldCompact>
                      <FieldCompact label="PVN summa">
                        <div className="h-9 px-3 flex items-center justify-end rounded-lg bg-graphite-50 border border-graphite-200 text-[13px] font-medium text-graphite-700 tabular">
                          {formatCurrency(totals.vatAmount)}
                        </div>
                      </FieldCompact>
                      <FieldCompact label="Summa ar PVN">
                        <div className="h-9 px-3 flex items-center justify-end rounded-lg bg-graphite-900 text-white text-[13px] font-semibold tabular">
                          {formatCurrency(totals.total)}
                        </div>
                      </FieldCompact>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="product"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <ProductLinesEditor
                      lines={lines}
                      onChange={setLines}
                      applyVAT={vat.appliesVAT}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>

            {/* ========= 5) ATSAUCE ========= */}
            <Section
              step={5}
              title="Atsauce"
              description="Līguma numurs, projekts, iekšējā atsauce (nav obligāti)"
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="piem. Līgums Nr. 2026/04-128 vai Projekts MX-01"
              />
            </Section>

            {/* ========= 6–7) DATUMI ========= */}
            <Section
              step={6}
              title="Datumi"
              description="Apmaksas termiņš sākotnēji tiek iestatīts +5 dienas"
            >
              <div className="grid grid-cols-2 gap-3">
                <FieldCompact label="Rēķina datums">
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </FieldCompact>
                <FieldCompact label="Apmaksas termiņš">
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </FieldCompact>
              </div>
            </Section>

            {/* ========= 8) PVN KOPSAVILKUMS ========= */}
            <Section step={7} title="PVN kopsavilkums">
              <VATSummary
                mode={vat.mode}
                explanation={vat.explanation}
                legalRef={vat.legalReference}
                subtotal={totals.subtotal}
                vatAmount={totals.vatAmount}
                total={totals.total}
                appliesVAT={vat.appliesVAT}
              />
            </Section>

            {/* ========= 9) PARAUGS ========= */}
            {client && (
              <Section
                step={8}
                title="Saglabāt kā paraugu"
                description="Saglabā šī rēķina struktūru atkārtotai lietošanai"
              >
                <div className="flex gap-2">
                  <Input
                    value={templateKeyword}
                    onChange={(e) => setTemplateKeyword(e.target.value)}
                    placeholder="Parauga atslēgvārds (piem. noma, konsultācija)"
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={saveAsTemplate}
                    disabled={!templateKeyword.trim()}
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    Saglabāt paraugu
                  </Button>
                </div>
              </Section>
            )}
          </div>

          {/* Sticky footer actions */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-5 border-t border-graphite-100 mt-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
              Atcelt
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={saveDraft}
              disabled={!client}
            >
              <Save className="h-3.5 w-3.5" />
              Saglabāt melnrakstu
            </Button>
            <Button size="sm" onClick={issueInvoice} disabled={!canIssue}>
              <FileText className="h-3.5 w-3.5" />
              {isEditing ? "Saglabāt izmaiņas" : "Izrakstīt rēķinu"}
            </Button>
          </div>

          {/* Toast */}
          <AnimatePresence>
            {tplSavedToast && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 rounded-full bg-graphite-900 text-white px-4 py-2 text-[12.5px] font-medium shadow-soft-xl"
              >
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Paraugs saglabāts
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Nested client create modal */}
      <ClientModal
        open={clientModalOpen}
        onOpenChange={setClientModalOpen}
        initialName={clientPrefillName}
        onCreated={(c) => {
          setClient(c);
          setClientPrefillName(undefined);
        }}
      />
    </>
  );
}

// ============================================================
// Helpers
// ============================================================

function Section({
  step,
  title,
  description,
  children,
}: {
  step?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-3">
        {step && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-graphite-900 text-white text-[10px] font-semibold shrink-0">
            {step}
          </span>
        )}
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-graphite-900">
            {title}
          </h3>
          {description && (
            <p className="text-[11.5px] text-graphite-500 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function FieldCompact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SegmentedPill<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-lg bg-graphite-100 p-1 border border-graphite-200/50">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors",
            value === o.value
              ? "bg-white text-graphite-900 shadow-soft-xs"
              : "text-graphite-500 hover:text-graphite-700"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function KindCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 transition-all text-left",
        active
          ? "border-graphite-900 bg-graphite-50/60 shadow-soft-xs"
          : "border-graphite-200 bg-white hover:border-graphite-300"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-graphite-900 text-white"
            : "bg-graphite-100 text-graphite-600"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold text-graphite-900">{title}</p>
        <p className="text-[11.5px] text-graphite-500 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function VATSummary({
  mode,
  explanation,
  legalRef,
  subtotal,
  vatAmount,
  total,
  appliesVAT,
}: {
  mode: string;
  explanation: string;
  legalRef: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  appliesVAT: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Info banner for non-standard modes */}
      {mode !== "standard" && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3.5 flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 mt-0.5">
            <Info className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-medium text-graphite-900">
              {mode === "reverse_charge"
                ? "Reverse charge — PVN netiek piemērots"
                : mode === "out_of_scope"
                ? "Ārpus ES — PVN netiek piemērots"
                : "Īpašs PVN režīms"}
            </p>
            <p className="text-[11.5px] text-graphite-600 mt-0.5 leading-relaxed">
              {explanation}
            </p>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="rounded-xl border border-graphite-200 bg-graphite-50/40 p-4">
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-graphite-500">Summa bez PVN</dt>
            <dd className="tabular text-graphite-800 font-medium">
              {formatCurrency(subtotal)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-graphite-500">
              {appliesVAT ? "PVN" : "PVN (netiek piemērots)"}
            </dt>
            <dd className="tabular text-graphite-800 font-medium">
              {formatCurrency(vatAmount)}
            </dd>
          </div>
          <div className="h-px bg-graphite-200 my-2" />
          <div className="flex justify-between items-baseline">
            <dt className="text-[13px] font-semibold text-graphite-900">
              Kopā apmaksai
            </dt>
            <dd className="text-[20px] font-semibold tabular tracking-tight text-graphite-900">
              {formatCurrency(total)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Legal reference */}
      <div className="rounded-lg border border-graphite-200 bg-white p-3">
        <Label className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-medium">
          PVN atsauce rēķinā
        </Label>
        <p className="mt-1.5 text-[12px] text-graphite-700 leading-relaxed">
          {legalRef}
        </p>
        <p className="mt-2 text-[10.5px] text-graphite-400 italic">
          Šī atsauce ir automātiski ģenerēta un pārbaudāma. Gala juridisko
          formulējumu apstipriniet ar grāmatvedi.
        </p>
      </div>
    </div>
  );
}
