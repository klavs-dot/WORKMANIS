"use client";

import { motion } from "framer-motion";
import { ShoppingBag, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { storePayments } from "@/lib/billing-store";
import { formatCurrency, formatDate } from "@/lib/utils";

export function VeikalaTab() {
  const total = storePayments.reduce((s, p) => s + p.amount, 0);
  const txCount = storePayments.length;

  // Group by card
  const byCard = storePayments.reduce((acc, p) => {
    acc[p.card] = (acc[p.card] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            Darījumi
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tabular tracking-tight text-graphite-900">
            {txCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
            Kartes
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tabular tracking-tight text-graphite-900">
            {Object.keys(byCard).length}
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
                <TableHead>Veikals</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Datums</TableHead>
                <TableHead>Karte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storePayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                        <ShoppingBag className="h-3 w-3" />
                      </div>
                      <span className="font-medium text-graphite-900">
                        {p.store}
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
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-graphite-200 bg-white px-2 py-0.5 text-[11px]">
                      <CreditCard className="h-2.5 w-2.5 text-graphite-500" />
                      <span className="font-mono text-graphite-700">
                        •••• {p.card}
                      </span>
                    </div>
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
