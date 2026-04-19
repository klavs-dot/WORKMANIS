"use client";

import { motion } from "framer-motion";
import { Globe, Repeat } from "lucide-react";
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
  return (
    <div className="space-y-6">
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
