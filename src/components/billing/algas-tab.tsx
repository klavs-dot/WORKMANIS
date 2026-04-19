"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SalaryStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import type { SalaryType, SalaryStatus } from "@/lib/billing-store";
import { formatCurrency } from "@/lib/utils";

export function AlgasTab() {
  const { salaries, updateSalary } = useBilling();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const prepared = salaries.filter((s) => s.status === "sagatavots");
  const totalPrepared = prepared.reduce((s, x) => s + x.amount, 0);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const sendToBank = () => {
    // Mock: mark all prepared as "izmaksats"
    if (selected.size > 0) {
      selected.forEach((id) => updateSalary(id, { status: "izmaksats" }));
    } else {
      prepared.forEach((s) => updateSalary(s.id, { status: "izmaksats" }));
    }
    setSelected(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Algu maksājumi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {prepared.length > 0
              ? `${prepared.length} sagatavoti · ${formatCurrency(
                  totalPrepared
                )} kopā`
              : "Visi sagatavotie algu maksājumi ir izmaksāti"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={sendToBank}
          disabled={prepared.length === 0}
        >
          <Send className="h-3.5 w-3.5" />
          Sagatavot maksājumu bankā
          {selected.size > 0 && ` (${selected.size})`}
        </Button>
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
                <TableHead className="w-10"></TableHead>
                <TableHead>Darbinieks</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Periods</TableHead>
                <TableHead>Tips</TableHead>
                <TableHead>Statuss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaries.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.status === "sagatavots" ? (
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                      />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-graphite-900 text-white text-[10px] font-semibold">
                        {s.employee
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <span className="font-medium text-graphite-900">
                        {s.employee}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-graphite-900 tabular">
                    {formatCurrency(s.amount)}
                  </TableCell>
                  <TableCell className="text-graphite-600">{s.period}</TableCell>
                  <TableCell>
                    <Select
                      value={s.type}
                      onValueChange={(v) =>
                        updateSalary(s.id, { type: v as SalaryType })
                      }
                    >
                      <SelectTrigger className="h-8 w-[160px] text-[12.5px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="darba_alga">Darba alga</SelectItem>
                        <SelectItem value="atvalinajums">Atvaļinājums</SelectItem>
                        <SelectItem value="avansa_norekini">
                          Avansa norēķini
                        </SelectItem>
                        <SelectItem value="piemaksa">Piemaksa</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <SalaryStatusBadge status={s.status} />
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
