"use client";

/**
 * Visi maksājumi — unified payments view.
 *
 * Aggregates rows from across the billing tabs (issued + received +
 * salaries + taxes) into a single chronological list. Read-only —
 * for editing/marking-paid, the user opens the underlying tab.
 *
 * Why a separate tab vs. a dashboard widget: at-a-glance totals are
 * cheap, but the user explicitly asked for this as the FIRST tab so
 * 'Visi maksājumi' carries the implication of being the home view —
 * what you see when you open Rēķini & Maksājumi without choosing.
 *
 * Each row gets a small section badge so the user knows which tab
 * to jump to for actions. Clicking a row navigates there in a
 * future iteration; for now it's display-only.
 */

import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Globe,
  ShoppingBag,
  Users,
  Landmark,
  Inbox,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBilling, type ReceivedInvoice } from "@/lib/billing-store";
import { usePayments } from "@/lib/payments-store";
import { formatCurrency, cn } from "@/lib/utils";
import type { PaymentSection } from "@/lib/payment-classifier";
import { classifyTransaction } from "@/lib/payment-classifier";

interface UnifiedRow {
  id: string;
  date: string;
  counterparty: string;
  amount: number;
  /** What kind of row this is. Drives the badge + the eventual
   *  click-through destination. */
  section: PaymentSection | "izejosie_actual" | "algas" | "nodokli";
  /** Original status string, for display */
  status: string;
  reference: string;
  /** True when this is a bank transaction with no matching invoice
   *  (the user needs to attach a receipt). Renders the row in red. */
  isMissingInvoice?: boolean;
}

const SECTION_META: Record<
  UnifiedRow["section"],
  {
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    cls: string;
  }
> = {
  ienakosie: {
    label: "Ienākošie",
    icon: ArrowDownToLine,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  izejosie: {
    label: "Izejošie",
    icon: ArrowUpFromLine,
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  izejosie_actual: {
    label: "Izejošie",
    icon: ArrowUpFromLine,
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  automatiskie: {
    label: "Automātiskie & Internetā",
    icon: Globe,
    cls: "bg-violet-50 text-violet-700 border-violet-200",
  },
  fiziskie: {
    label: "Fiziskie",
    icon: ShoppingBag,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  algas: {
    label: "Algas",
    icon: Users,
    cls: "bg-rose-50 text-rose-700 border-rose-200",
  },
  nodokli: {
    label: "Nodokļi",
    icon: Landmark,
    cls: "bg-graphite-100 text-graphite-700 border-graphite-200",
  },
};

export function VisiMaksajumiTab() {
  const { received, issued, salaries, taxes, loading } = useBilling();
  const { payments: bankPayments, loading: paymentsLoading } = usePayments();

  const rows = useMemo<UnifiedRow[]>(() => {
    const all: UnifiedRow[] = [];

    // Bank-imported transactions FIRST so they appear above the
    // invoice-side rows when dates tie. The 'missing invoice' flag
    // is set when a debit transaction has no matched_invoice_id —
    // those render in red.
    for (const p of bankPayments) {
      const sectionKey = (p.classifiedSection || "izejosie") as
        | PaymentSection
        | "";
      const section: UnifiedRow["section"] =
        sectionKey === "ienakosie" ||
        sectionKey === "izejosie" ||
        sectionKey === "automatiskie" ||
        sectionKey === "fiziskie"
          ? sectionKey
          : "izejosie";

      // For OUTGOING transactions without a matched invoice → red row
      const isOutgoing =
        section === "izejosie" ||
        section === "automatiskie" ||
        section === "fiziskie";
      const isMissingInvoice = isOutgoing && !p.matchedInvoiceId;

      all.push({
        id: `pay:${p.id}`,
        date: p.paymentDate,
        counterparty: p.counterparty,
        amount: section === "ienakosie" ? Math.abs(p.amount) : -p.amount,
        section,
        status: p.matchedInvoiceId ? "matched" : "no_invoice",
        reference: p.bankReference || p.rawReference || "",
        isMissingInvoice,
      });
    }

    // Received invoices (we owe). Only include rows that are NOT
    // already represented by a bank payment with a matched_invoice_id
    // (avoids duplicate display: 'we paid X' shown both as the bank
    // tx AND as the original invoice).
    const matchedInvoiceIds = new Set(
      bankPayments
        .map((p) => p.matchedInvoiceId)
        .filter((s): s is string => Boolean(s))
    );
    for (const r of received) {
      if (matchedInvoiceIds.has(r.id)) continue;

      const section: UnifiedRow["section"] =
        r.sourceChannel === "internet"
          ? "automatiskie"
          : r.sourceChannel === "auto_bank"
            ? classifySupplierByName(r.supplier)
            : "izejosie_actual";

      all.push({
        id: `recv:${r.id}`,
        date: r.dueDate || r.createdAt.slice(0, 10),
        counterparty: r.supplier,
        amount: -Math.abs(r.amount),
        section,
        status: r.status,
        reference: r.invoiceNumber,
      });
    }

    // Issued invoices marked paid (clients paid us)
    for (const i of issued) {
      if (i.status !== "apmaksats") continue;
      all.push({
        id: `iss:${i.id}`,
        date: i.date,
        counterparty: i.client,
        amount: Math.abs(i.amount),
        section: "ienakosie",
        status: i.status,
        reference: i.number,
      });
    }

    // Salaries — outgoing payments to employees
    for (const s of salaries) {
      all.push({
        id: `sal:${s.id}`,
        date: s.period || "",
        counterparty: s.employee,
        amount: -Math.abs(s.amount),
        section: "algas",
        status: s.status,
        reference: s.period || "",
      });
    }

    // Taxes — outgoing payments to the state.
    for (const t of taxes) {
      all.push({
        id: `tax:${t.id}`,
        date: t.dueDate || "",
        counterparty: t.name,
        amount: -Math.abs(t.amount),
        section: "nodokli",
        status: t.status,
        reference: t.dueDate || "",
      });
    }

    // Newest first
    return all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [received, issued, salaries, taxes, bankPayments]);

  const totalIn = useMemo(
    () =>
      rows
        .filter((r) => r.amount > 0)
        .reduce((sum, r) => sum + r.amount, 0),
    [rows]
  );
  const totalOut = useMemo(
    () =>
      rows
        .filter((r) => r.amount < 0)
        .reduce((sum, r) => sum + Math.abs(r.amount), 0),
    [rows]
  );
  const missingReceiptsCount = useMemo(
    () => rows.filter((r) => r.isMissingInvoice).length,
    [rows]
  );

  const isLoading = loading || paymentsLoading;

  return (
    <div className="space-y-4">
      {/* Top-line summary: total in / out / count + missing-receipts warning */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile
          label="Kopā ienākošie"
          value={formatCurrency(totalIn)}
          tone="emerald"
        />
        <SummaryTile
          label="Kopā izejošie"
          value={formatCurrency(totalOut)}
          tone="rose"
        />
        <SummaryTile
          label="Maksājumu skaits"
          value={String(rows.length)}
          tone="graphite"
        />
        <SummaryTile
          label="Nepiesaistīti rēķini"
          value={String(missingReceiptsCount)}
          tone={missingReceiptsCount > 0 ? "alert" : "graphite"}
        />
      </div>

      {/* Unified table */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-graphite-100">
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Visi maksājumi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            Visu rēķinu, algu un nodokļu maksājumi vienkopus —
            jaunākie augšā. Sarkanās rindas ir bankas maksājumi bez
            piesaistīta rēķina.
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-[13px] text-graphite-500">
            Ielādē…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Datums</TableHead>
                <TableHead>Sadaļa</TableHead>
                <TableHead>Pretpartnera</TableHead>
                <TableHead>Atsauce</TableHead>
                <TableHead className="text-right">Summa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const meta = SECTION_META[r.section];
                const Icon = meta.icon;
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      r.isMissingInvoice &&
                        "bg-red-50/60 hover:bg-red-50 border-l-2 border-l-red-400"
                    )}
                  >
                    <TableCell className="text-[12.5px] text-graphite-700 tabular whitespace-nowrap">
                      {formatDate(r.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {r.isMissingInvoice && (
                          <AlertCircle
                            className="h-3.5 w-3.5 text-red-600 shrink-0"
                            strokeWidth={2.25}
                          />
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                            meta.cls
                          )}
                        >
                          <Icon className="h-3 w-3" strokeWidth={2} />
                          {meta.label}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-[13px] font-medium",
                        r.isMissingInvoice
                          ? "text-red-900"
                          : "text-graphite-900"
                      )}
                    >
                      {r.counterparty || "—"}
                      {r.isMissingInvoice && (
                        <div className="text-[10.5px] text-red-700 font-normal mt-0.5">
                          Trūkst rēķina — pievieno tabā &ldquo;
                          {meta.label}&rdquo;
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] text-graphite-500 tabular">
                      {r.reference || "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular text-[13px] font-semibold whitespace-nowrap",
                        r.isMissingInvoice
                          ? "text-red-700"
                          : r.amount > 0
                            ? "text-emerald-700"
                            : "text-graphite-900"
                      )}
                    >
                      {r.amount > 0 ? "+" : ""}
                      {formatCurrency(r.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "graphite" | "alert";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : tone === "alert"
          ? "text-red-700"
          : "text-graphite-900";
  const cardClass =
    tone === "alert" ? "p-4 border-red-300 bg-red-50/50" : "p-4";
  return (
    <Card className={cardClass}>
      <div className="text-[11px] uppercase tracking-wider text-graphite-400 font-medium">
        {label}
      </div>
      <div className={cn("text-[22px] font-semibold tabular mt-1", toneClass)}>
        {value}
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-50 text-graphite-400 mb-3">
        <Inbox className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h3 className="text-[15px] font-medium tracking-tight text-graphite-900">
        Vēl nav neviena maksājuma
      </h3>
      <p className="mt-1 text-[13px] text-graphite-500 max-w-md">
        Importē bankas izrakstu (FIDAVISTA XML) ar pogu &ldquo;No bankas&rdquo;
        augšējā labajā stūrī, lai ielādētu maksājumus visās sadaļās uzreiz
      </p>
    </div>
  );
}

/**
 * Heuristic to put a 'source_channel: auto_bank' invoice (created
 * from an unmatched bank tx) into the right unified-view bucket.
 * Re-uses the classifier with a synthetic transaction — slightly
 * wasteful but keeps the classification logic in one place.
 */
function classifySupplierByName(supplier: string): UnifiedRow["section"] {
  const synthetic = {
    rawDate: "",
    counterparty: supplier,
    amount: 1, // outgoing
    reference: "",
    currency: "EUR",
    raw: {},
  };
  const result = classifyTransaction(
    synthetic as Parameters<typeof classifyTransaction>[0]
  );
  // classifier returns one of the 4 sections; map to UnifiedRow shape
  return result;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  // Display as DD.MM.YYYY (Latvian convention)
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// Re-export the type used internally. Avoids confusion if a future
// importer wants the section shape.
export type { ReceivedInvoice };
