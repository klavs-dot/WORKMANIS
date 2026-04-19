"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Landmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TaxStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import { formatCurrency, formatDate, daysUntil, cn } from "@/lib/utils";

export function NodokliTab() {
  const { taxes, addTax, updateTax } = useBilling();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", dueDate: "" });

  const submit = () => {
    if (!form.name || !form.amount || !form.dueDate) return;
    addTax({
      name: form.name,
      amount: parseFloat(form.amount) || 0,
      dueDate: form.dueDate,
      status: "sagatavots",
    });
    setForm({ name: "", amount: "", dueDate: "" });
    setOpen(false);
  };

  const prepared = taxes.filter((t) => t.status === "sagatavots");
  const totalPrepared = prepared.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Nodokļi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {prepared.length > 0
              ? `${prepared.length} sagatavoti · ${formatCurrency(
                  totalPrepared
                )} kopā`
              : "Visi nodokļi šobrīd ir apmaksāti"}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Pievienot nodokli
        </Button>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          {taxes.length === 0 ? (
            <div className="p-12 text-center text-[13px] text-graphite-500">
              Vēl nav pievienots neviens nodoklis
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nodoklis</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Termiņš</TableHead>
                  <TableHead>Statuss</TableHead>
                  <TableHead className="w-[140px] text-right">
                    Darbības
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxes.map((t) => {
                  const days = daysUntil(t.dueDate);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                            <Landmark className="h-3 w-3" />
                          </div>
                          <span className="font-medium text-graphite-900">
                            {t.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-graphite-900 tabular">
                        {formatCurrency(t.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col tabular">
                          <span className="text-graphite-800">
                            {formatDate(t.dueDate)}
                          </span>
                          {t.status === "sagatavots" && (
                            <span
                              className={cn(
                                "text-[11px] mt-0.5",
                                days < 0
                                  ? "text-red-600"
                                  : days <= 3
                                  ? "text-amber-600"
                                  : "text-graphite-400"
                              )}
                            >
                              {days < 0
                                ? `kavēti ${Math.abs(days)} d.`
                                : days === 0
                                ? "šodien"
                                : `pēc ${days} d.`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TaxStatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {t.status === "sagatavots" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              updateTax(t.id, { status: "apmaksats" })
                            }
                          >
                            <Check className="h-3 w-3" />
                            Apmaksāts
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </motion.div>

      {/* Add tax modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pievienot nodokli</DialogTitle>
            <DialogDescription>
              Grāmatvedis aprēķina un ievada nodokļu maksājumus
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nosaukums</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="PVN, VSAOI, IIN…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Summa</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Termiņš</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Atcelt
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!form.name || !form.amount || !form.dueDate}
            >
              <Landmark className="h-3.5 w-3.5" />
              Pievienot
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
