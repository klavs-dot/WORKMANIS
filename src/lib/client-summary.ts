import type {
  IssuedInvoice,
  ReceivedInvoice,
} from "./billing-store";
import type { Client, ClientInvoiceSummary } from "./billing-types";
import { daysUntil } from "./utils";

/** Filter invoices that match this client by name */
export function invoicesForClient(
  client: Client,
  all: IssuedInvoice[]
): IssuedInvoice[] {
  const q = client.name.toLowerCase();
  return all.filter((i) => i.client.toLowerCase().includes(q));
}

/** Simple match on supplier name for received payments */
export function receivedForClient(
  client: Client,
  all: ReceivedInvoice[]
): ReceivedInvoice[] {
  const q = client.name.toLowerCase();
  return all.filter((p) => p.supplier.toLowerCase().includes(q));
}

// ============================================================
// Bidirectional "last invoice" helpers
// ============================================================

export type InvoiceDirection = "issued" | "received";

export interface RecentInvoice {
  direction: InvoiceDirection;
  date: string;
  amount: number;
  number: string;
}

/** Most recent invoice across both directions for this client */
export function mostRecentInvoice(
  client: Client,
  issued: IssuedInvoice[],
  received: ReceivedInvoice[]
): RecentInvoice | null {
  const latestIn = invoicesForClient(client, issued)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestOut = receivedForClient(client, received)
    .slice()
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];

  if (!latestIn && !latestOut) return null;

  if (latestIn && !latestOut) {
    return {
      direction: "issued",
      date: latestIn.date,
      amount: latestIn.amount + latestIn.vat,
      number: latestIn.number,
    };
  }
  if (latestOut && !latestIn) {
    return {
      direction: "received",
      date: latestOut.dueDate,
      amount: latestOut.amount,
      number: latestOut.invoiceNumber,
    };
  }
  // Both exist — compare dates
  const inDate = latestIn!.date;
  const outDate = latestOut!.dueDate;
  if (inDate.localeCompare(outDate) >= 0) {
    return {
      direction: "issued",
      date: latestIn!.date,
      amount: latestIn!.amount + latestIn!.vat,
      number: latestIn!.number,
    };
  }
  return {
    direction: "received",
    date: latestOut!.dueDate,
    amount: latestOut!.amount,
    number: latestOut!.invoiceNumber,
  };
}

/** Unified row representing one invoice (in or out) for the detail timeline */
export interface BidirectionalInvoiceRow {
  id: string;
  direction: InvoiceDirection;
  number: string;
  date: string;
  amount: number;
  status: string;
}

export function bidirectionalInvoices(
  client: Client,
  issued: IssuedInvoice[],
  received: ReceivedInvoice[]
): BidirectionalInvoiceRow[] {
  const ins = invoicesForClient(client, issued).map<BidirectionalInvoiceRow>(
    (i) => ({
      id: `in-${i.id}`,
      direction: "issued",
      number: i.number,
      date: i.date,
      amount: i.amount + i.vat,
      status: i.status,
    })
  );
  const outs = receivedForClient(client, received).map<BidirectionalInvoiceRow>(
    (o) => ({
      id: `out-${o.id}`,
      direction: "received",
      number: o.invoiceNumber,
      date: o.dueDate,
      amount: o.amount,
      status: o.status,
    })
  );
  return [...ins, ...outs].sort((a, b) => b.date.localeCompare(a.date));
}

// ============================================================
// Summary metrics
// ============================================================

/** Compute summary metrics for a client */
export function summaryForClient(
  client: Client,
  invoices: IssuedInvoice[]
): ClientInvoiceSummary {
  const clientInvoices = invoicesForClient(client, invoices);

  const unpaid = clientInvoices.filter(
    (i) => i.status === "gaidam_apmaksu" || i.status === "kave_maksajumu"
  );
  const paid = clientInvoices.filter((i) => i.status === "apmaksats");

  const totalRevenue = paid.reduce((s, i) => s + i.amount + i.vat, 0);
  const unpaidTotal = unpaid.reduce((s, i) => s + i.amount + i.vat, 0);

  const sorted = [...clientInvoices].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastInvoiceDate = sorted[0]?.date;

  // Mock: average payment days = 12 if paid invoices exist, else 0
  const averagePaymentDays = paid.length > 0 ? 12 : 0;

  return {
    totalInvoices: clientInvoices.length,
    unpaidCount: unpaid.length,
    unpaidTotal,
    totalRevenue,
    lastInvoiceDate,
    averagePaymentDays,
  };
}
