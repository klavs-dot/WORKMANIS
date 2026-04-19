"use client";

import { useEffect, useState, useMemo } from "react";
import {
  X,
  Save,
  FileText,
  Languages,
  Send,
  Inbox,
  Building2,
  Users as UsersIcon,
  User as UserIcon,
  Edit3,
  Eye,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
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
import {
  documentTypeLabel,
  type BusinessDocument,
  type DocumentLanguage,
  type DocumentParty,
  type DocumentType,
  type PartyKind,
} from "@/lib/documents-store";
import { useClients } from "@/lib/clients-store";
import { useEmployees } from "@/lib/employees-store";
import { useCompany } from "@/lib/company-context";
import { formatDate, cn } from "@/lib/utils";

const partyKinds: {
  kind: PartyKind;
  label: string;
  icon: typeof Building2;
}[] = [
  { kind: "company", label: "Šis uzņēmums", icon: Building2 },
  { kind: "client", label: "Klients", icon: UsersIcon },
  { kind: "employee", label: "Darbinieks", icon: UserIcon },
  { kind: "manual", label: "Cits (manuāli)", icon: Edit3 },
];

const labels = {
  lv: {
    title: "Dokumenta nosaukums",
    type: "Dokumenta tips",
    date: "Datums",
    language: "Valoda",
    sender: "Sūtītājs",
    recipient: "Adresēts",
    body: "Dokumenta teksts",
    bodyPlaceholder: "Ievadi dokumenta saturu…",
    physical: "Šim dokumentam ir fizisks paraksts",
    physicalHint:
      "Ja izslēgts, PDF apakšā parādīsies elektroniskā paraksta paziņojums",
    save: "Saglabāt",
    cancel: "Atcelt",
    preview: "Priekšskatījums",
    edit: "Rediģēt",
    download: "Lejupielādēt PDF",
    senderManualName: "Sūtītāja vārds vai nosaukums",
    senderManualAddr: "Adrese vai papildinformācija",
    recipientManualName: "Adresāta vārds vai nosaukums",
    recipientManualAddr: "Adrese vai papildinformācija",
  },
  en: {
    title: "Document title",
    type: "Document type",
    date: "Date",
    language: "Language",
    sender: "Sender",
    recipient: "Recipient",
    body: "Document body",
    bodyPlaceholder: "Enter document content…",
    physical: "This document has a physical signature",
    physicalHint:
      "If unchecked, an electronic signature notice will appear at the PDF footer",
    save: "Save",
    cancel: "Cancel",
    preview: "Preview",
    edit: "Edit",
    download: "Download PDF",
    senderManualName: "Sender name or organization",
    senderManualAddr: "Address or extra info",
    recipientManualName: "Recipient name or organization",
    recipientManualAddr: "Address or extra info",
  },
};

export function DocumentModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: BusinessDocument | null;
  onSubmit: (data: Omit<BusinessDocument, "id" | "createdAt">) => void;
}) {
  const { clients } = useClients();
  const { employees } = useEmployees();
  const { activeCompany } = useCompany();

  const [type, setType] = useState<DocumentType>("zinojums");
  const [language, setLanguage] = useState<DocumentLanguage>("lv");
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [body, setBody] = useState("");
  const [hasPhysicalSignature, setHasPhysicalSignature] = useState(true);

  const [senderKind, setSenderKind] = useState<PartyKind>("company");
  const [senderRef, setSenderRef] = useState<string>("");
  const [senderManualName, setSenderManualName] = useState("");
  const [senderManualAddr, setSenderManualAddr] = useState("");

  const [recipientKind, setRecipientKind] = useState<PartyKind>("client");
  const [recipientRef, setRecipientRef] = useState<string>("");
  const [recipientManualName, setRecipientManualName] = useState("");
  const [recipientManualAddr, setRecipientManualAddr] = useState("");

  const [view, setView] = useState<"edit" | "preview">("edit");

  const t = labels[language];

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setLanguage(editing.language);
      setTitle(editing.title);
      setDocumentDate(editing.documentDate);
      setBody(editing.body);
      setHasPhysicalSignature(editing.hasPhysicalSignature);
      setSenderKind(editing.sender.kind);
      setSenderRef(editing.sender.refId ?? "");
      setSenderManualName(
        editing.sender.kind === "manual" ? editing.sender.displayName : ""
      );
      setSenderManualAddr(
        editing.sender.kind === "manual" ? editing.sender.addressLine ?? "" : ""
      );
      setRecipientKind(editing.recipient.kind);
      setRecipientRef(editing.recipient.refId ?? "");
      setRecipientManualName(
        editing.recipient.kind === "manual" ? editing.recipient.displayName : ""
      );
      setRecipientManualAddr(
        editing.recipient.kind === "manual"
          ? editing.recipient.addressLine ?? ""
          : ""
      );
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setType("zinojums");
      setLanguage("lv");
      setTitle("");
      setDocumentDate(today);
      setBody("");
      setHasPhysicalSignature(true);
      setSenderKind("company");
      setSenderRef("");
      setSenderManualName("");
      setSenderManualAddr("");
      setRecipientKind("client");
      setRecipientRef("");
      setRecipientManualName("");
      setRecipientManualAddr("");
    }
    setView("edit");
  }, [open, editing]);

  // ─── Resolve party objects based on selection ───
  const sender: DocumentParty = useMemo(
    () =>
      buildParty(
        senderKind,
        senderRef,
        senderManualName,
        senderManualAddr,
        activeCompany,
        clients,
        employees
      ),
    [
      senderKind,
      senderRef,
      senderManualName,
      senderManualAddr,
      activeCompany,
      clients,
      employees,
    ]
  );

  const recipient: DocumentParty = useMemo(
    () =>
      buildParty(
        recipientKind,
        recipientRef,
        recipientManualName,
        recipientManualAddr,
        activeCompany,
        clients,
        employees
      ),
    [
      recipientKind,
      recipientRef,
      recipientManualName,
      recipientManualAddr,
      activeCompany,
      clients,
      employees,
    ]
  );

  const valid =
    title.trim().length > 0 &&
    documentDate.length > 0 &&
    sender.displayName.trim().length > 0 &&
    recipient.displayName.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      type,
      title: title.trim(),
      documentDate,
      language,
      sender,
      recipient,
      body: body.trim(),
      hasPhysicalSignature,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-graphite-500" />
            {editing
              ? language === "lv"
                ? "Labot dokumentu"
                : "Edit document"
              : language === "lv"
                ? "Jauns dokuments"
                : "New document"}
          </DialogTitle>
          <DialogDescription>
            {language === "lv"
              ? "Iesniegums, paskaidrojums vai ziņojums ar PDF ģenerēšanu"
              : "Application, statement or notice with PDF generation"}
          </DialogDescription>
        </DialogHeader>

        {/* View toggle */}
        <div className="inline-flex rounded-lg bg-graphite-100 p-1 border border-graphite-200/50 self-start">
          <button
            type="button"
            onClick={() => setView("edit")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
              view === "edit"
                ? "bg-white text-graphite-900 shadow-soft-xs"
                : "text-graphite-500 hover:text-graphite-700"
            )}
          >
            <Edit3 className="h-3 w-3" />
            {t.edit}
          </button>
          <button
            type="button"
            onClick={() => setView("preview")}
            disabled={!valid}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-50",
              view === "preview"
                ? "bg-white text-graphite-900 shadow-soft-xs"
                : "text-graphite-500 hover:text-graphite-700"
            )}
          >
            <Eye className="h-3 w-3" />
            {t.preview}
          </button>
        </div>

        {view === "edit" ? (
          <div className="space-y-4 pt-2">
            {/* Top: type + language + date */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t.type}</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as DocumentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iesniegums">
                      {documentTypeLabel("iesniegums", language)}
                    </SelectItem>
                    <SelectItem value="paskaidrojums">
                      {documentTypeLabel("paskaidrojums", language)}
                    </SelectItem>
                    <SelectItem value="zinojums">
                      {documentTypeLabel("zinojums", language)}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Languages className="h-3 w-3 text-graphite-400" />
                  {t.language}
                </Label>
                <Select
                  value={language}
                  onValueChange={(v) => setLanguage(v as DocumentLanguage)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lv">LAT — Latviski</SelectItem>
                    <SelectItem value="en">ENG — English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t.date}</Label>
                <Input
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t.title} <span className="text-red-500">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  language === "lv"
                    ? "piem. Iesniegums par komandējuma izdevumu kompensāciju"
                    : "e.g. Application for travel expense reimbursement"
                }
                autoFocus
              />
            </div>

            {/* Sender + Recipient grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PartyPicker
                title={t.sender}
                icon={Send}
                accent="emerald"
                kind={senderKind}
                onKindChange={setSenderKind}
                refId={senderRef}
                onRefChange={setSenderRef}
                manualName={senderManualName}
                onManualNameChange={setSenderManualName}
                manualAddr={senderManualAddr}
                onManualAddrChange={setSenderManualAddr}
                manualNameLabel={t.senderManualName}
                manualAddrLabel={t.senderManualAddr}
                clients={clients}
                employees={employees}
                companyName={activeCompany?.name}
              />
              <PartyPicker
                title={t.recipient}
                icon={Inbox}
                accent="sky"
                kind={recipientKind}
                onKindChange={setRecipientKind}
                refId={recipientRef}
                onRefChange={setRecipientRef}
                manualName={recipientManualName}
                onManualNameChange={setRecipientManualName}
                manualAddr={recipientManualAddr}
                onManualAddrChange={setRecipientManualAddr}
                manualNameLabel={t.recipientManualName}
                manualAddrLabel={t.recipientManualAddr}
                clients={clients}
                employees={employees}
                companyName={activeCompany?.name}
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label>{t.body}</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t.bodyPlaceholder}
                rows={10}
                className="font-serif text-[13px] leading-relaxed"
              />
            </div>

            {/* Physical signature toggle */}
            <div className="rounded-lg border border-graphite-200 bg-graphite-50/40 p-3">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasPhysicalSignature}
                  onChange={(e) => setHasPhysicalSignature(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900 mt-0.5"
                />
                <div>
                  <div className="text-[13px] font-medium text-graphite-900">
                    {t.physical}
                  </div>
                  <div className="text-[11.5px] text-graphite-500 mt-0.5">
                    {t.physicalHint}
                  </div>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <DocumentPreview
            type={type}
            language={language}
            title={title}
            documentDate={documentDate}
            sender={sender}
            recipient={recipient}
            body={body}
            hasPhysicalSignature={hasPhysicalSignature}
          />
        )}

        <div className="flex justify-between gap-2 pt-4 border-t border-graphite-100 mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            {t.cancel}
          </Button>
          <div className="flex gap-2">
            {view === "preview" && (
              <Button variant="secondary" size="sm" disabled={!valid}>
                <Download className="h-3.5 w-3.5" />
                {t.download}
              </Button>
            )}
            <Button size="sm" onClick={submit} disabled={!valid}>
              <Save className="h-3.5 w-3.5" />
              {t.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Party picker
// ============================================================

function PartyPicker({
  title,
  icon: Icon,
  accent,
  kind,
  onKindChange,
  refId,
  onRefChange,
  manualName,
  onManualNameChange,
  manualAddr,
  onManualAddrChange,
  manualNameLabel,
  manualAddrLabel,
  clients,
  employees,
  companyName,
}: {
  title: string;
  icon: typeof Send;
  accent: "emerald" | "sky";
  kind: PartyKind;
  onKindChange: (k: PartyKind) => void;
  refId: string;
  onRefChange: (id: string) => void;
  manualName: string;
  onManualNameChange: (v: string) => void;
  manualAddr: string;
  onManualAddrChange: (v: string) => void;
  manualNameLabel: string;
  manualAddrLabel: string;
  clients: ReturnType<typeof useClients>["clients"];
  employees: ReturnType<typeof useEmployees>["employees"];
  companyName?: string;
}) {
  const accentClasses =
    accent === "emerald"
      ? "border-emerald-100 bg-emerald-50/30"
      : "border-sky-100 bg-sky-50/30";
  const accentText =
    accent === "emerald" ? "text-emerald-700" : "text-sky-700";

  return (
    <div className={cn("rounded-lg border p-3 space-y-3", accentClasses)}>
      <div
        className={cn(
          "text-[10.5px] uppercase tracking-wider font-semibold flex items-center gap-1.5",
          accentText
        )}
      >
        <Icon className="h-3 w-3" />
        {title}
      </div>

      {/* Kind picker — segmented */}
      <div className="grid grid-cols-2 gap-1">
        {partyKinds.map((p) => {
          const KIcon = p.icon;
          return (
            <button
              key={p.kind}
              type="button"
              onClick={() => onKindChange(p.kind)}
              className={cn(
                "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors border",
                kind === p.kind
                  ? "bg-white border-graphite-300 text-graphite-900 shadow-soft-xs"
                  : "bg-transparent border-transparent text-graphite-500 hover:text-graphite-700 hover:bg-white/50"
              )}
            >
              <KIcon className="h-3 w-3" />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Detail picker per kind */}
      {kind === "company" && (
        <div className="rounded-md bg-white border border-graphite-200 px-2.5 py-1.5 text-[12px] text-graphite-800">
          {companyName ?? (
            <span className="italic text-graphite-400">
              Nav izvēlēts uzņēmums
            </span>
          )}
        </div>
      )}
      {kind === "client" && (
        <Select value={refId} onValueChange={onRefChange}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Izvēlies klientu…" />
          </SelectTrigger>
          <SelectContent>
            {clients.length === 0 ? (
              <div className="px-2 py-1.5 text-[12px] text-graphite-400 italic">
                Nav klientu
              </div>
            ) : (
              clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
      {kind === "employee" && (
        <Select value={refId} onValueChange={onRefChange}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Izvēlies darbinieku…" />
          </SelectTrigger>
          <SelectContent>
            {employees.length === 0 ? (
              <div className="px-2 py-1.5 text-[12px] text-graphite-400 italic">
                Nav darbinieku
              </div>
            ) : (
              employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
      {kind === "manual" && (
        <div className="space-y-2">
          <Input
            value={manualName}
            onChange={(e) => onManualNameChange(e.target.value)}
            placeholder={manualNameLabel}
            className="bg-white"
          />
          <Input
            value={manualAddr}
            onChange={(e) => onManualAddrChange(e.target.value)}
            placeholder={manualAddrLabel}
            className="bg-white"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// PDF-style preview
// ============================================================

function DocumentPreview({
  type,
  language,
  title,
  documentDate,
  sender,
  recipient,
  body,
  hasPhysicalSignature,
}: {
  type: DocumentType;
  language: DocumentLanguage;
  title: string;
  documentDate: string;
  sender: DocumentParty;
  recipient: DocumentParty;
  body: string;
  hasPhysicalSignature: boolean;
}) {
  const lang = language;
  return (
    <div className="bg-white rounded-lg border border-graphite-200 shadow-soft-sm">
      <div className="aspect-[1/1.414] p-10 flex flex-col font-serif text-[12.5px] leading-relaxed text-graphite-900">
        {/* Type label */}
        <div className="text-center text-[10.5px] uppercase tracking-[0.2em] text-graphite-500 font-semibold mb-1">
          {documentTypeLabel(type, lang)}
        </div>

        {/* Title */}
        <h1 className="text-center text-[18px] font-semibold tracking-tight mb-6">
          {title || (
            <span className="text-graphite-300 italic">
              {lang === "lv" ? "Bez nosaukuma" : "Untitled"}
            </span>
          )}
        </h1>

        {/* Sender / Recipient header block */}
        <div className="grid grid-cols-2 gap-6 mb-6 pb-4 border-b border-graphite-200">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-graphite-400 font-semibold mb-1">
              {lang === "lv" ? "No" : "From"}
            </div>
            <div className="font-medium">{sender.displayName || "—"}</div>
            {sender.addressLine && (
              <div className="text-[11px] text-graphite-600 mt-0.5">
                {sender.addressLine}
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-graphite-400 font-semibold mb-1">
              {lang === "lv" ? "Adresēts" : "To"}
            </div>
            <div className="font-medium">{recipient.displayName || "—"}</div>
            {recipient.addressLine && (
              <div className="text-[11px] text-graphite-600 mt-0.5">
                {recipient.addressLine}
              </div>
            )}
          </div>
        </div>

        {/* Date */}
        <div className="text-right text-[11.5px] text-graphite-600 mb-6 tabular">
          {documentDate ? formatDate(documentDate) : "—"}
        </div>

        {/* Body */}
        <div className="flex-1 whitespace-pre-wrap mb-6 min-h-[150px]">
          {body || (
            <span className="text-graphite-300 italic">
              {lang === "lv" ? "Dokumenta saturs…" : "Document body…"}
            </span>
          )}
        </div>

        {/* Signature block */}
        <div className="mt-auto pt-6 border-t border-graphite-200">
          {hasPhysicalSignature ? (
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="border-b border-graphite-400 h-12" />
                <div className="text-[10px] uppercase tracking-wider text-graphite-500 font-semibold mt-1.5">
                  {lang === "lv" ? "Paraksts" : "Signature"}
                </div>
                <div className="text-[11px] text-graphite-700 mt-0.5">
                  {sender.displayName}
                </div>
              </div>
              <div>
                <div className="border-b border-graphite-400 h-12" />
                <div className="text-[10px] uppercase tracking-wider text-graphite-500 font-semibold mt-1.5">
                  {lang === "lv" ? "Paraksta atšifrējums" : "Print name"}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-graphite-50 border border-graphite-200 p-3 text-center">
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-700 font-semibold">
                {lang === "lv"
                  ? "DOKUMENTAM NAV FIZISKĀ PARAKSTA"
                  : "DOCUMENT WITHOUT PHYSICAL SIGNATURE"}
              </div>
              <div className="text-[11px] text-graphite-600 mt-1">
                {lang === "lv"
                  ? "TAS SATUR ELEKTRONISKO PARAKSTU UN LAIKA ZĪMOGU"
                  : "IT CONTAINS AN ELECTRONIC SIGNATURE AND TIMESTAMP"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function buildParty(
  kind: PartyKind,
  refId: string,
  manualName: string,
  manualAddr: string,
  activeCompany: ReturnType<typeof useCompany>["activeCompany"],
  clients: ReturnType<typeof useClients>["clients"],
  employees: ReturnType<typeof useEmployees>["employees"]
): DocumentParty {
  if (kind === "company") {
    return {
      kind,
      refId: activeCompany?.id,
      displayName: activeCompany?.legalName || activeCompany?.name || "",
      addressLine: activeCompany?.legalAddress || undefined,
    };
  }
  if (kind === "client") {
    const c = clients.find((x) => x.id === refId);
    if (!c) return { kind, displayName: "" };
    return {
      kind,
      refId: c.id,
      displayName: c.name,
      addressLine: c.legalAddress || undefined,
    };
  }
  if (kind === "employee") {
    const e = employees.find((x) => x.id === refId);
    if (!e) return { kind, displayName: "" };
    return {
      kind,
      refId: e.id,
      displayName: `${e.firstName} ${e.lastName}`,
      addressLine: e.position || undefined,
    };
  }
  return {
    kind: "manual",
    displayName: manualName.trim(),
    addressLine: manualAddr.trim() || undefined,
  };
}
