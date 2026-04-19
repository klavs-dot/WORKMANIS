"use client";

import { motion } from "framer-motion";
import { Info, Globe, Repeat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { onlinePayments } from "@/lib/billing-store";
import { formatCurrency, formatDate } from "@/lib/utils";

export function AutomatiskieTab() {
  const total = onlinePayments.reduce((s, p) => s + p.amount, 0);
  const subsCount = onlinePayments.filter((p) => p.type === "subscription").length;
  const purchaseCount = onlinePayments.filter(
    (p) => p.type === "online_purchase"
  ).length;

  return (
    <div className="space-y-6">
      {/* Integration notice */}
      <div className="rounded-xl border border-sky-200/70 bg-sky-50/40 p-4 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 mt-0.5">
          <Info className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[13px] font-medium text-graphite-900">
            Bankas integrācija tiks pievienota vēlāk
          </p>
          <p className="text-[12px] text-graphite-600 mt-0.5 leading-relaxed">
            Pašlaik redzami demonstrācijas dati. Pēc integrācijas ar SEB vai
            Swedbank Open Banking automātiski tiks sinhronizēti visi tiešsaistes
            maksājumi un abonementi.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
            Kopā aprīlī
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tabular tracking-tight text-graphite-900">
            {formatCurrency(total)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
            Abonementi
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tabular tracking-tight text-graphite-900">
            {subsCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
            Interneta pirkumi
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tabular tracking-tight text-graphite-900">
            {purchaseCount}
          </p>
        </Card>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Pakalpojums</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Datums</TableHead>
                <TableHead>Tips</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {onlinePayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                        {p.type === "subscription" ? (
                          <Repeat className="h-3 w-3" />
                        ) : (
                          <Globe className="h-3 w-3" />
                        )}
                      </div>
                      <span className="font-medium text-graphite-900">
                        {p.service}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-graphite-900 tabular">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className="text-graphite-600 tabular">
                    {formatDate(p.date)}
                  </TableCell>
                  <TableCell>
                    {p.type === "subscription" ? (
                      <Badge variant="info">Subscription</Badge>
                    ) : (
                      <Badge variant="muted">Interneta pirkums</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </motion.div>
    </div>
  );
}
