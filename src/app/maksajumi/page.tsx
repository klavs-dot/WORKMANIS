"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Download,
  FileCode,
  Copy,
  MoreHorizontal,
  CheckCheck,
  Send,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaymentStatusBadge } from "@/components/business/status-badge";
import { payments, companies } from "@/lib/mock";
import { formatCurrency, formatDate, daysUntil, cn } from "@/lib/utils";

export default function MaksajumiPage() {
  const [status, setStatus] = useState("all");
  const [company, setCompany] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (company !== "all" && p.companyId !== company) return false;
      return true;
    });
  }, [status, company]);

  const totalAmount = filtered.reduce((s, p) => s + p.amount, 0);
  const todayDue = filtered.filter((p) => daysUntil(p.dueDate) === 0).length;
  const pendingCount = filtered.filter((p) => p.status !== "apmaksāts").length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };

  const selectedTotal = filtered
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + p.amount, 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Maksājumi"
          description="Sagatavojiet un apstipriniet maksājumus uz bankām un piegādātājiem"
          actions={
            <>
              <Button variant="secondary" size="sm">
                <FileCode className="h-3.5 w-3.5" />
                Sagatavot XML
              </Button>
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Eksportēt SEPA
              </Button>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Pievienot maksājumu
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-6">
          <div className="space-y-4">
            {/* Filters */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex gap-2.5 items-center"
            >
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Statuss" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Visi statusi</SelectItem>
                  <SelectItem value="sagatavots">Sagatavots</SelectItem>
                  <SelectItem value="gaida_apstiprinājumu">
                    Gaida apstiprinājumu
                  </SelectItem>
                  <SelectItem value="nosūtīts">Nosūtīts</SelectItem>
                  <SelectItem value="apmaksāts">Apmaksāts</SelectItem>
                </SelectContent>
              </Select>
              <Select value={company} onValueChange={setCompany}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Uzņēmums" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Visi uzņēmumi</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected.size > 0 && (
                <div className="ml-auto flex items-center gap-2 rounded-lg border border-graphite-200 bg-white px-2.5 py-1 shadow-soft-xs">
                  <span className="text-[12px] text-graphite-600">
                    Izvēlēti <span className="font-semibold tabular">{selected.size}</span> · {formatCurrency(selectedTotal)}
                  </span>
                  <Button size="sm" variant="default">
                    <Send className="h-3 w-3" />
                    Apstiprināt
                  </Button>
                </div>
              )}
            </motion.div>

            {/* Table */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
            >
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            selected.size === filtered.length &&
                            filtered.length > 0
                          }
                          onChange={toggleAll}
                          className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                        />
                      </TableHead>
                      <TableHead>Saņēmējs</TableHead>
                      <TableHead>IBAN</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                      <TableHead>Termiņš</TableHead>
                      <TableHead>Statuss</TableHead>
                      <TableHead>Uzņēmums</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const days = daysUntil(p.dueDate);
                      const isSelected = selected.has(p.id);
                      return (
                        <TableRow
                          key={p.id}
                          data-state={isSelected ? "selected" : undefined}
                          className="cursor-pointer"
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(p.id)}
                              className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-graphite-900">
                                {p.recipient.replace(/,.*/, "")}
                              </p>
                              {p.reference && (
                                <p className="text-[11px] text-graphite-400 mt-0.5 font-mono">
                                  {p.reference}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11.5px] text-graphite-600">
                            {p.iban.replace(/(.{4})/g, "$1 ").trim().slice(0, 24)}…
                          </TableCell>
                          <TableCell className="text-right font-semibold text-graphite-900 tabular">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col tabular">
                              <span className="text-graphite-800">
                                {formatDate(p.dueDate)}
                              </span>
                              {p.status !== "apmaksāts" && (
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
                            <PaymentStatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-graphite-600">
                            {p.companyName}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <CheckCheck className="h-3.5 w-3.5" />
                                  Apstiprināt
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Copy className="h-3.5 w-3.5" />
                                  Kopēt IBAN
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 focus:text-red-700">
                                  Atcelt
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </motion.div>
          </div>

          {/* Summary sidebar */}
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-4"
          >
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-graphite-900 text-white">
                  <Wallet className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-[14px] font-semibold tracking-tight text-graphite-900">
                  Kopsavilkums
                </h3>
              </div>

              <dl className="space-y-3.5">
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-graphite-400 font-medium">
                    Kopējā summa
                  </dt>
                  <dd className="mt-1 text-[24px] font-semibold tabular tracking-tight text-graphite-900">
                    {formatCurrency(totalAmount)}
                  </dd>
                </div>
                <div className="h-px bg-graphite-100" />
                <div className="flex justify-between items-baseline">
                  <dt className="text-[12.5px] text-graphite-600">
                    Maksājumu skaits
                  </dt>
                  <dd className="text-[15px] font-semibold tabular text-graphite-900">
                    {filtered.length}
                  </dd>
                </div>
                <div className="flex justify-between items-baseline">
                  <dt className="text-[12.5px] text-graphite-600">
                    Gaida apstiprinājumu
                  </dt>
                  <dd className="text-[15px] font-semibold tabular text-graphite-900">
                    {pendingCount}
                  </dd>
                </div>
                <div className="flex justify-between items-baseline">
                  <dt className="text-[12.5px] text-graphite-600">
                    Šodienas termiņi
                  </dt>
                  <dd
                    className={cn(
                      "text-[15px] font-semibold tabular",
                      todayDue > 0 ? "text-amber-600" : "text-graphite-900"
                    )}
                  >
                    {todayDue}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 bg-gradient-to-b from-graphite-50 to-white">
              <h4 className="text-[12.5px] font-semibold text-graphite-900">
                Nākamā darbība
              </h4>
              <p className="mt-1 text-[11.5px] text-graphite-600 leading-relaxed">
                Sagatavojiet SEPA XML failu, lai to ielādētu savā bankā. Vairāki maksājumi tiks iekļauti vienā failā.
              </p>
              <Button size="sm" className="mt-3.5 w-full">
                <FileCode className="h-3.5 w-3.5" />
                Sagatavot SEPA XML
              </Button>
            </Card>
          </motion.div>
        </div>
      </div>
    </AppShell>
  );
}
