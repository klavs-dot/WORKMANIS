"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Check,
  Plus,
  Save,
  X,
  CalendarDays,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SalaryStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import type { SalaryType } from "@/lib/billing-store";
import { useEmployees, fullName } from "@/lib/employees-store";
import { formatCurrency, formatDate } from "@/lib/utils";

const salaryTypeLabels: Record<SalaryType, string> = {
  darba_alga: "Darba alga",
  atvalinajums: "Atvaļinājums",
  avansa_norekini: "Avansa norēķini",
  piemaksa: "Piemaksa",
};

export function AlgasTab() {
  const { salaries, updateSalary, addSalary } = useBilling();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const prepared = salaries.filter((s) => s.status === "sagatavots");
  const totalPrepared = prepared.reduce((s, x) => s + x.amount, 0);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const sendToBank = () => {
    if (selected.size > 0) {
      selected.forEach((id) => updateSalary(id, { status: "izmaksats" }));
    } else {
      prepared.forEach((s) => updateSalary(s.id, { status: "izmaksats" }));
    }
    setSelected(new Set());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Algu maksājumi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {prepared.length > 0
              ? `${prepared.length} sagatavoti · ${formatCurrency(totalPrepared)} kopā`
              : salaries.length > 0
                ? "Visi sagatavotie algu maksājumi ir izmaksāti"
                : "Vēl nav sagatavotu algu maksājumu"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Jauns algas maksājums
          </Button>
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
              <AnimatePresence initial={false}>
                {salaries.map((s) => (
                  <motion.tr
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-b border-graphite-100"
                  >
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
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <span className="font-medium text-graphite-900">
                          {s.employee}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-graphite-900 tabular">
                      {formatCurrency(s.amount)}
                    </TableCell>
                    <TableCell className="text-graphite-600">
                      {s.period}
                    </TableCell>
                    <TableCell>
                      {s.status === "izmaksats" ? (
                        <span className="text-[12px] text-graphite-700">
                          {salaryTypeLabels[s.type]}
                        </span>
                      ) : (
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
                      )}
                    </TableCell>
                    <TableCell>
                      {s.status === "izmaksats" ? (
                        <div className="flex flex-col gap-0.5">
                          <SalaryStatusBadge status={s.status} />
                          {s.paidAt && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-graphite-500 tabular">
                              <CalendarDays className="h-2.5 w-2.5" />
                              {formatPaidDate(s.paidAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <SalaryStatusBadge status={s.status} />
                      )}
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {salaries.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-graphite-400 text-[13px]"
                  >
                    Vēl nav neviena algas maksājuma. Spied{" "}
                    <span className="text-graphite-700 font-medium">
                      Jauns algas maksājums
                    </span>{" "}
                    lai sāktu.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </motion.div>

      <NewSalaryModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => {
          addSalary(data);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

// ============================================================
// Helper: format paidAt as DD.MM.YYYY
// ============================================================
function formatPaidDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// ============================================================
// New salary payment modal
// ============================================================

function NewSalaryModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (data: {
    employee: string;
    employeeId?: string;
    amount: number;
    period: string;
    type: SalaryType;
    status: "sagatavots";
  }) => void;
}) {
  const { employees } = useEmployees();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [type, setType] = useState<SalaryType>("darba_alga");
  const [amount, setAmount] = useState<string>("");
  const [period, setPeriod] = useState<string>(currentMonthLV());

  useEffect(() => {
    if (!open) return;
    setEmployeeId("");
    setType("darba_alga");
    setAmount("");
    setPeriod(currentMonthLV());
  }, [open]);

  // Pre-fill amount with the employee's contract base salary when picked
  useEffect(() => {
    if (!employeeId) return;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const baseSalary = emp.contracts[0]?.baseSalary;
    if (baseSalary && amount === "") {
      setAmount(String(baseSalary));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const submit = () => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const num = Number(amount);
    if (!num || num <= 0) return;
    onSubmit({
      employee: fullName(emp),
      employeeId: emp.id,
      amount: num,
      period: period.trim(),
      type,
      status: "sagatavots",
    });
  };

  const valid = !!employeeId && Number(amount) > 0 && period.trim().length > 0;
  const selectedEmp = employees.find((e) => e.id === employeeId);
  const primaryBank = selectedEmp?.bankAccounts.find((b) => b.isPrimary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Jauns algas maksājums</DialogTitle>
          <DialogDescription>
            Izvēlies darbinieku, maksājuma tipu un sagatavo to apstiprināšanai
            bankā
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label>
              Darbinieks <span className="text-red-500">*</span>
            </Label>
            {employees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-graphite-200 px-3 py-3 text-[12px] text-graphite-500">
                Vēl nav pievienots neviens darbinieks. Pievieno tos sadaļā{" "}
                <span className="font-medium text-graphite-700">
                  Darbinieki
                </span>
                .
              </div>
            ) : (
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Izvēlies darbinieku…" />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((e) => e.status !== "atlaists")
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {fullName(e)}
                        {e.position && (
                          <span className="text-graphite-400 text-[11px]">
                            {" · "}
                            {e.position}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Bank account preview when employee picked */}
          {selectedEmp && (
            <div className="rounded-lg bg-graphite-50/60 border border-graphite-100 px-3 py-2.5 space-y-0.5">
              {primaryBank ? (
                <>
                  <div className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-semibold">
                    Maksājums uz kontu
                  </div>
                  <div className="text-[12px] text-graphite-800">
                    {primaryBank.bankName}
                  </div>
                  <div className="text-[11px] text-graphite-600 font-mono">
                    {primaryBank.iban}
                  </div>
                </>
              ) : (
                <div className="text-[11.5px] text-amber-700">
                  Šim darbiniekam nav pievienots galvenais bankas konts.
                  Pievieno to{" "}
                  <span className="font-medium">Darbinieki</span> sadaļā.
                </div>
              )}
            </div>
          )}

          {/* Type + amount + period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Maksājuma tips <span className="text-red-500">*</span>
              </Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as SalaryType)}
              >
                <SelectTrigger>
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
            </div>
            <div className="space-y-1.5">
              <Label>
                Summa, EUR <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="tabular"
                step="0.01"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Periods <span className="text-red-500">*</span>
            </Label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="piem. 2026. gada aprīlis"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-graphite-100 mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            <Save className="h-3.5 w-3.5" />
            Sagatavot maksājumu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function currentMonthLV(): string {
  const months = [
    "janvāris",
    "februāris",
    "marts",
    "aprīlis",
    "maijs",
    "jūnijs",
    "jūlijs",
    "augusts",
    "septembris",
    "oktobris",
    "novembris",
    "decembris",
  ];
  const d = new Date();
  return `${d.getFullYear()}. gada ${months[d.getMonth()]}`;
}

// formatDate is imported but kept available for potential future use
void formatDate;
