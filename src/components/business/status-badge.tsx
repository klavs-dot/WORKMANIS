import { Badge } from "@/components/ui/badge";
import type {
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
} from "@/lib/types";

const invoiceStatusMap: Record<
  InvoiceStatus,
  { label: string; variant: "success" | "warning" | "danger" | "muted" }
> = {
  apmaksāts: { label: "Apmaksāts", variant: "success" },
  gaida: { label: "Gaida", variant: "warning" },
  termiņš_beidzies: { label: "Termiņš beidzies", variant: "danger" },
  melnraksts: { label: "Melnraksts", variant: "muted" },
};

const paymentStatusMap: Record<
  PaymentStatus,
  { label: string; variant: "success" | "warning" | "info" | "muted" }
> = {
  apmaksāts: { label: "Apmaksāts", variant: "success" },
  nosūtīts: { label: "Nosūtīts", variant: "info" },
  gaida_apstiprinājumu: { label: "Gaida apstiprinājumu", variant: "warning" },
  sagatavots: { label: "Sagatavots", variant: "muted" },
};

const subscriptionStatusMap: Record<
  SubscriptionStatus,
  { label: string; variant: "success" | "warning" | "muted" }
> = {
  aktīvs: { label: "Aktīvs", variant: "success" },
  pauzēts: { label: "Pauzēts", variant: "warning" },
  atcelts: { label: "Atcelts", variant: "muted" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, variant } = invoiceStatusMap[status];
  return (
    <Badge variant={variant} className="gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          variant === "success"
            ? "bg-emerald-500"
            : variant === "warning"
            ? "bg-amber-500"
            : variant === "danger"
            ? "bg-red-500"
            : "bg-graphite-400"
        }`}
      />
      {label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, variant } = paymentStatusMap[status];
  return (
    <Badge variant={variant} className="gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          variant === "success"
            ? "bg-emerald-500"
            : variant === "warning"
            ? "bg-amber-500"
            : variant === "info"
            ? "bg-sky-500"
            : "bg-graphite-400"
        }`}
      />
      {label}
    </Badge>
  );
}

export function SubscriptionStatusBadge({
  status,
}: {
  status: SubscriptionStatus;
}) {
  const { label, variant } = subscriptionStatusMap[status];
  return (
    <Badge variant={variant} className="gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          variant === "success"
            ? "bg-emerald-500"
            : variant === "warning"
            ? "bg-amber-500"
            : "bg-graphite-400"
        }`}
      />
      {label}
    </Badge>
  );
}
