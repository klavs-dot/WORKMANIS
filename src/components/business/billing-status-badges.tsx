import { Badge } from "@/components/ui/badge";
import type {
  OutgoingStatus,
  IncomingStatus,
  SalaryStatus,
  TaxStatus,
} from "@/lib/billing-store";

interface DotConfig {
  label: string;
  variant: "success" | "warning" | "danger" | "info" | "muted";
  dot: string;
}

const outgoingMap: Record<OutgoingStatus, DotConfig> = {
  apstiprinat_banka: {
    label: "Apstiprināt bankā",
    variant: "warning",
    dot: "bg-amber-500",
  },
  apmaksats: {
    label: "Apmaksāts",
    variant: "success",
    dot: "bg-emerald-500",
  },
};

const incomingMap: Record<IncomingStatus, DotConfig> = {
  gaidam_apmaksu: {
    label: "Gaidām apmaksu",
    variant: "warning",
    dot: "bg-amber-500",
  },
  apmaksats: {
    label: "Apmaksāts",
    variant: "success",
    dot: "bg-emerald-500",
  },
  kave_maksajumu: {
    label: "Kavē maksājumu",
    variant: "danger",
    dot: "bg-red-500",
  },
};

const salaryMap: Record<SalaryStatus, DotConfig> = {
  sagatavots: {
    label: "Sagatavots",
    variant: "muted",
    dot: "bg-graphite-400",
  },
  izmaksats: {
    label: "Izmaksāts",
    variant: "success",
    dot: "bg-emerald-500",
  },
};

const taxMap: Record<TaxStatus, DotConfig> = {
  sagatavots: {
    label: "Sagatavots",
    variant: "warning",
    dot: "bg-amber-500",
  },
  apmaksats: {
    label: "Apmaksāts",
    variant: "success",
    dot: "bg-emerald-500",
  },
};

function renderBadge({ label, variant, dot }: DotConfig) {
  return (
    <Badge variant={variant} className="gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </Badge>
  );
}

export function OutgoingStatusBadge({ status }: { status: OutgoingStatus }) {
  return renderBadge(outgoingMap[status]);
}

export function IncomingStatusBadge({ status }: { status: IncomingStatus }) {
  return renderBadge(incomingMap[status]);
}

export function SalaryStatusBadge({ status }: { status: SalaryStatus }) {
  return renderBadge(salaryMap[status]);
}

export function TaxStatusBadge({ status }: { status: TaxStatus }) {
  return renderBadge(taxMap[status]);
}
