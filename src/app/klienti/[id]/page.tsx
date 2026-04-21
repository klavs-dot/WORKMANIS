"use client";

import { useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  User,
  Pencil,
  Plus,
  FileText,
  CreditCard,
  Bookmark,
  StickyNote,
  MapPin,
  Mail,
  Receipt,
  Check,
  Calendar,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  Trash2,
  Package,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { KPICard } from "@/components/business/kpi-card";
import { EmptyState } from "@/components/business/empty-state";
import { IssuedStatusBadge } from "@/components/business/billing-status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClientModal } from "@/components/billing/client-modal";
import { InvoiceModal } from "@/components/billing/invoice-modal";
import { useClients } from "@/lib/clients-store";
import { useBilling } from "@/lib/billing-store";
import {
  invoicesForClient,
  summaryForClient,
  receivedForClient,
  bidirectionalInvoices,
} from "@/lib/client-summary";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { InvoiceTemplate } from "@/lib/billing-types";

type TabKey = "rekini" | "maksajumi" | "paraugi" | "piezimes";

const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: "rekini", label: "Rēķini", icon: FileText },
  { key: "maksajumi", label: "Maksājumi", icon: CreditCard },
  { key: "paraugi", label: "Paraugi", icon: Bookmark },
  { key: "piezimes", label: "Piezīmes", icon: StickyNote },
];

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { getClient, templatesForClient, deleteTemplate } = useClients();
  const { issued, received } = useBilling();

  const client = getClient(id);

  const [tab, setTab] = useState<TabKey>("rekini");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [templateToApply, setTemplateToApply] =
    useState<InvoiceTemplate | null>(null);

  const openInvoiceModal = (tpl?: InvoiceTemplate) => {
    setTemplateToApply(tpl ?? null);
    setInvoiceModalOpen(true);
  };

  const summary = useMemo(
    () => (client ? summaryForClient(client, issued) : null),
    [client, issued]
  );

  if (!client) {
    return (
      <AppShell>
        <EmptyState
          icon={User}
          title="Klients nav atrasts"
          description="Iespējams, tas ir izdzēsts vai izmantots nederīgs links."
          action={
            <Button size="sm" onClick={() => router.push("/klienti")}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Atgriezties uz Klienti
            </Button>
          }
        />
      </AppShell>
    );
  }

  const clientInvoices = invoicesForClient(client, issued);
  const clientReceived = receivedForClient(client, received);
  const clientTemplates = templatesForClient(client.id);
  const allInvoicesBidirectional = bidirectionalInvoices(
    client,
    issued,
    received
  );

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Link
          href="/klienti"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-graphite-500 hover:text-graphite-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Visi klienti
        </Link>

        {/* ========= TOP CLIENT CARD ========= */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-start gap-6">
              {/* Left: identity */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-soft-sm",
                    client.type === "juridiska"
                      ? "bg-graphite-900"
                      : "bg-sky-600"
                  )}
                >
                  {client.type === "juridiska" ? (
                    <Building2 className="h-6 w-6" />
                  ) : (
                    <User className="h-6 w-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[26px] font-semibold tracking-tight text-graphite-900">
                      {client.name}
                    </h1>
                    <Badge variant="muted">
                      {client.type === "juridiska"
                        ? "Juridiska persona"
                        : "Fiziska persona"}
                    </Badge>
                    {client.status === "aktivs" ? (
                      <Badge variant="success" className="gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Aktīvs
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-graphite-400" />
                        Neaktīvs
                      </Badge>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-graphite-500">
                    <span className="font-mono text-[10.5px] bg-graphite-100 rounded px-1.5 py-0.5">
                      {client.countryCode}
                    </span>
                    {client.country}
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
                    <DetailRow label="Reģ. nr." value={client.regNumber} mono />
                    <DetailRow label="PVN nr." value={client.vatNumber} mono />
                    <DetailRow
                      label="Juridiskā adrese"
                      value={client.legalAddress}
                      icon={MapPin}
                    />
                    <DetailRow
                      label="Bankas konts"
                      value={client.bankAccount}
                      mono
                    />
                  </div>
                </div>
              </div>

              {/* Right: keywords + actions */}
              <div className="flex flex-col gap-4 lg:items-end lg:w-[280px] shrink-0">
                <div className="flex gap-2 order-1 lg:order-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditModalOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rediģēt
                  </Button>
                  <Button size="sm" onClick={() => openInvoiceModal()}>
                    <Plus className="h-3.5 w-3.5" />
                    Izrakstīt rēķinu
                  </Button>
                </div>
                {client.keywords.length > 0 && (
                  <div className="order-2 lg:order-1 w-full">
                    <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium mb-1.5 lg:text-right">
                      Atslēgvārdi
                    </p>
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      {client.keywords.map((k) => (
                        <Badge key={k} variant="outline" className="text-[11px]">
                          #{k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ========= KPI STATS ========= */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <KPICard
              label="Rēķini kopā"
              value={summary.totalInvoices.toString()}
              icon={Receipt}
              delay={0}
            />
            <KPICard
              label="Neapmaksātie"
              value={formatCurrency(summary.unpaidTotal)}
              changeLabel={`${summary.unpaidCount} rēķini`}
              icon={FileText}
              accent={summary.unpaidCount > 0 ? "warning" : "default"}
              delay={0.05}
            />
            <KPICard
              label="Kopējais apgrozījums"
              value={formatCurrency(summary.totalRevenue)}
              icon={TrendingUp}
              delay={0.1}
            />
            <KPICard
              label="Vidējais termiņš"
              value={
                summary.averagePaymentDays > 0
                  ? `${summary.averagePaymentDays} d.`
                  : "—"
              }
              changeLabel="no izrakstīšanas"
              icon={Calendar}
              delay={0.15}
            />
          </div>
        )}

        {/* ========= TABS ========= */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div
            role="tablist"
            className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              let count = 0;
              if (t.key === "rekini") count = allInvoicesBidirectional.length;
              if (t.key === "maksajumi")
                count = clientInvoices.filter((i) => i.status === "apmaksats").length + clientReceived.length;
              if (t.key === "paraugi") count = clientTemplates.length;
              if (t.key === "piezimes") count = client.notes.length;

              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors whitespace-nowrap focus:outline-none",
                    isActive
                      ? "text-graphite-900"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="client-tabs-pill"
                      className="absolute inset-0 rounded-lg bg-white shadow-soft-xs border border-graphite-200/40"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {t.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular",
                          isActive
                            ? "bg-graphite-900 text-white"
                            : "bg-graphite-200/70 text-graphite-600"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ========= TAB CONTENT ========= */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "rekini" && (
              <InvoicesTab
                rows={allInvoicesBidirectional}
                onIssueInvoice={() => openInvoiceModal()}
              />
            )}
            {tab === "maksajumi" && (
              <PaymentsTab
                invoices={clientInvoices}
                received={clientReceived}
              />
            )}
            {tab === "paraugi" && (
              <TemplatesTab
                templates={clientTemplates}
                onUse={(tpl) => openInvoiceModal(tpl)}
                onDelete={deleteTemplate}
                onCreate={() => openInvoiceModal()}
              />
            )}
            {tab === "piezimes" && (
              <NotesTab clientId={client.id} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ClientModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        editing={client}
      />
      <InvoiceModal
        open={invoiceModalOpen}
        onOpenChange={setInvoiceModalOpen}
        initialClient={client}
        initialTemplate={templateToApply}
      />
    </AppShell>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function DetailRow({
  label,
  value,
  mono,
  icon: Icon,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  icon?: typeof Mail;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-graphite-500 min-w-[110px] flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-graphite-400" />}
        {label}
      </span>
      <span
        className={cn(
          "text-graphite-800 truncate",
          mono && "font-mono text-[12px]"
        )}
      >
        {value || <span className="text-graphite-300">—</span>}
      </span>
    </div>
  );
}

// ---------- Invoices tab (bidirectional) ----------

function InvoicesTab({
  rows,
  onIssueInvoice,
}: {
  rows: ReturnType<typeof bidirectionalInvoices>;
  onIssueInvoice: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-graphite-100 flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Rēķini
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            Ienākošie (no mums izrakstīti) · zaļi. Izejošie (saņemti no
            šī partnera) · sarkani.
          </p>
        </div>
        <Button size="sm" onClick={onIssueInvoice}>
          <Plus className="h-3.5 w-3.5" />
          Izrakstīt rēķinu šim klientam
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Vēl nav rēķinu"
          description="Izraksti pirmo rēķinu šim klientam vai reģistrē no viņa saņemtu rēķinu sadaļā Rēķini & Maksājumi → Izejošie."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10"></TableHead>
              <TableHead>Rēķina numurs</TableHead>
              <TableHead>Datums</TableHead>
              <TableHead className="text-right">Summa</TableHead>
              <TableHead>Virziens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const isIncoming = r.direction === "issued";
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md",
                        isIncoming
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          : "bg-red-50 text-red-600 border border-red-100"
                      )}
                    >
                      {isIncoming ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-graphite-700">
                    {isIncoming ? `Rēķins Nr. ${r.number}` : r.number}
                  </TableCell>
                  <TableCell className="text-graphite-600 tabular">
                    {formatDate(r.date)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold tabular",
                      isIncoming ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {!isIncoming && "−"}
                    {formatCurrency(r.amount)}
                  </TableCell>
                  <TableCell>
                    {isIncoming ? (
                      <Badge variant="success" className="gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Ienākošais
                      </Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 text-red-700 px-2 py-0.5 text-[10.5px] font-semibold border border-red-100">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Izejošais
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ---------- Payments tab ----------

function PaymentsTab({
  invoices,
  received,
}: {
  invoices: ReturnType<typeof invoicesForClient>;
  received: ReturnType<typeof receivedForClient>;
}) {
  // Combine: paid invoices (ienākošie) + all received (izejošie)
  const rows = useMemo(() => {
    const paidInvoices = invoices
      .filter((i) => i.status === "apmaksats")
      .map((i) => ({
        id: `in-${i.id}`,
        date: i.dueDate,
        amount: i.amount + i.vat,
        type: "ienakosais" as const,
        status: "apmaksats",
        reference: `Rēķins Nr. ${i.number}`,
      }));

    const out = received.map((p) => ({
      id: `out-${p.id}`,
      date: p.dueDate,
      amount: p.amount,
      type: "izejosais" as const,
      status: p.status,
      reference: p.invoiceNumber,
    }));

    return [...paidInvoices, ...out].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [invoices, received]);

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CreditCard}
          title="Nav saistītu maksājumu"
          description="Kad rēķins tiks apmaksāts vai sagatavots maksājums, tas parādīsies šeit."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Datums</TableHead>
            <TableHead>Atsauce</TableHead>
            <TableHead className="text-right">Summa</TableHead>
            <TableHead>Tips</TableHead>
            <TableHead>Statuss</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-graphite-600 tabular">
                {formatDate(r.date)}
              </TableCell>
              <TableCell className="font-mono text-[12px] text-graphite-600">
                {r.reference}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-semibold tabular",
                  r.type === "ienakosais"
                    ? "text-emerald-600"
                    : "text-graphite-900"
                )}
              >
                {r.type === "ienakosais" ? "+" : "−"}
                {formatCurrency(r.amount)}
              </TableCell>
              <TableCell>
                {r.type === "ienakosais" ? (
                  <Badge variant="success">Ienākošais</Badge>
                ) : (
                  <Badge variant="muted">Izejošais</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant={r.status === "apmaksats" ? "success" : "warning"}
                  className="gap-1.5"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      r.status === "apmaksats"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    )}
                  />
                  {r.status === "apmaksats"
                    ? "Apmaksāts"
                    : "Apstiprināt bankā"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ---------- Templates tab ----------

function TemplatesTab({
  templates,
  onUse,
  onDelete,
  onCreate,
}: {
  templates: InvoiceTemplate[];
  onUse: (tpl: InvoiceTemplate) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  if (templates.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Bookmark}
          title="Vēl nav paraugu"
          description="Paraugi ļauj ātri izrakstīt atkārtotus rēķinus ar iepriekš saglabātu saturu."
          action={
            <Button size="sm" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" />
              Izveidot paraugu
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-graphite-500">
          {templates.length} saglabāti paraugi
        </p>
        <Button size="sm" variant="secondary" onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
          Izveidot paraugu
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((tpl) => {
          const isService = tpl.content.kind === "pakalpojums";
          const Icon = isService ? Wrench : Package;
          const preview =
            tpl.content.kind === "pakalpojums"
              ? tpl.content.description
              : tpl.content.lines
                  .map((l) => `${l.name} × ${l.quantity}`)
                  .join(", ");
          return (
            <Card
              key={tpl.id}
              className="p-4 hover:shadow-soft-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-graphite-50 text-graphite-700 border border-graphite-100">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-graphite-900 truncate">
                      {tpl.keyword}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="muted" className="text-[10px]">
                        {isService ? "Pakalpojums" : "Prece"}
                      </Badge>
                      <span className="text-[10.5px] text-graphite-400 uppercase">
                        {tpl.language}
                      </span>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onUse(tpl)}>
                      <Check className="h-3.5 w-3.5" />
                      Lietot
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Pencil className="h-3.5 w-3.5" />
                      Rediģēt
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-700"
                      onSelect={() => onDelete(tpl.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Dzēst
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-[12px] text-graphite-600 line-clamp-2 leading-snug">
                {preview || (
                  <span className="text-graphite-300">Nav satura</span>
                )}
              </p>
              {tpl.reference && (
                <p className="mt-2 text-[11px] text-graphite-400">
                  Atsauce: {tpl.reference}
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-graphite-100">
                <Button
                  variant="success-outline"
                  size="sm"
                  className="w-full"
                  onClick={() => onUse(tpl)}
                >
                  Lietot paraugu
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Notes tab ----------

function NotesTab({ clientId }: { clientId: string }) {
  const { getClient, addNote, updateNote, deleteNote } = useClients();
  const client = getClient(clientId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  if (!client) return null;
  const notes = client.notes;

  const submit = () => {
    if (!draft.trim()) return;
    addNote(clientId, draft.trim());
    setDraft("");
  };

  const saveEdit = (id: string) => {
    if (!editDraft.trim()) return;
    updateNote(clientId, id, editDraft.trim());
    setEditingId(null);
    setEditDraft("");
  };

  return (
    <div className="space-y-4">
      {/* New note input */}
      <Card className="p-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pievienot piezīmi par klientu…"
          className="min-h-[80px]"
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={submit} disabled={!draft.trim()}>
            <Plus className="h-3.5 w-3.5" />
            Pievienot piezīmi
          </Button>
        </div>
      </Card>

      {/* Notes list */}
      {notes.length === 0 ? (
        <Card>
          <EmptyState
            icon={StickyNote}
            title="Vēl nav piezīmju"
            description="Piezīmes palīdz atcerēties svarīgus detaļus par klientu — atlaides, komunikāciju, vēlmes."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {notes.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="p-4">
                  {editingId === n.id ? (
                    <div>
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft("");
                          }}
                        >
                          Atcelt
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(n.id)}>
                          <Check className="h-3.5 w-3.5" />
                          Saglabāt
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-graphite-800 leading-relaxed whitespace-pre-wrap">
                          {n.body}
                        </p>
                        <p className="mt-2 text-[11px] text-graphite-400 tabular">
                          {formatDate(n.createdAt)}
                          {n.updatedAt &&
                            ` · labota ${formatDate(n.updatedAt)}`}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditingId(n.id);
                              setEditDraft(n.body);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rediģēt
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-700"
                            onSelect={() => deleteNote(clientId, n.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Dzēst
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
