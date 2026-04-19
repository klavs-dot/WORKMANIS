import type {
  IncomingInvoice,
  OutgoingPayment,
} from "./billing-store";
import type { Client, ClientInvoiceSummary } from "./billing-types";
import { daysUntil } from "./utils";

/** Filter invoices that match this client by name */
export function invoicesForClient(
  client: Client,
  all: IncomingInvoice[]
): IncomingInvoice[] {
  const q = client.name.toLowerCase();
  return all.filter((i) => i.client.toLowerCase().includes(q));
}

/** Compute summary metrics for a client */
export function summaryForClient(
  client: Client,
  invoices: IncomingInvoice[]
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

/** Simple match on supplier name for outgoing payments */
export function outgoingForClient(
  client: Client,
  all: OutgoingPayment[]
): OutgoingPayment[] {
  const q = client.name.toLowerCase();
  return all.filter((p) => p.supplier.toLowerCase().includes(q));
}
