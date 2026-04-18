"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Download,
  MoreHorizontal,
  FileText,
  Copy,
  Eye,
  Trash2,
  Calendar,
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceStatusBadge } from "@/components/business/status-badge";
import { EmptyState } from "@/components/business/empty-state";
import { invoices, companies } from "@/lib/mock";
import { formatCurrency, formatDate, daysUntil, cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export default function RekiniPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [company, setCompany] = useState<string>("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (status !== "all" && inv.status !== status) return false;
      if (company !== "all" && inv.companyId !== company) return false;
      if (
        search &&
        !inv.number.toLowerCase().includes(search.toLowerCase()) &&
        !inv.supplierName.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [search, status, company]);

  const totalAmount = filtered.reduce((s, i) => s + i.total, 0);

  const openDrawer = (inv: Invoice) => {
    setSelected(inv);
    setDrawerOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Rēķini"
          description={`${filtered.length} rēķini · Kopā ${formatCurrency(totalAmount)}`}
          actions={
            <>
              <Button variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                Eksportēt
              </Button>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Pievienot rēķinu
              </Button>
            </>
          }
        />

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center"
        >
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-graphite-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Meklēt pēc piegādātāja vai rēķina nr."
              className="w-full h-9 rounded-lg border border-graphite-200 bg-white pl-9 pr-3 text-[13px] text-graphite-800 placeholder:text-graphite-400 hover:border-graphite-300 focus:border-graphite-900 focus:outline-none focus:ring-2 focus:ring-graphite-900/5 transition-colors"
            />
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="md:w-[180px]">
              <SelectValue placeholder="Statuss" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Visi statusi</SelectItem>
              <SelectItem value="gaida">Gaida</SelectItem>
              <SelectItem value="apmaksāts">Apmaksāts</SelectItem>
              <SelectItem value="termiņš_beidzies">Termiņš beidzies</SelectItem>
              <SelectItem value="melnraksts">Melnraksts</SelectItem>
            </SelectContent>
          </Select>

          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="md:w-[200px]">
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

          <Button variant="outline" size="default" className="md:ml-auto">
            <Calendar className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Datumu periods</span>
          </Button>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Netika atrasts neviens rēķins"
                description="Mēģiniet mainīt filtrus vai pievienot pirmo rēķinu."
                action={
                  <Button size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Pievienot rēķinu
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Piegādātājs</TableHead>
                    <TableHead>Rēķina nr.</TableHead>
                    <TableHead>Datums</TableHead>
                    <TableHead>Apmaksas termiņš</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead className="text-right">PVN</TableHead>
                    <TableHead>Statuss</TableHead>
                    <TableHead>Uzņēmums</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const days = daysUntil(inv.dueDate);
                    return (
                      <TableRow
                        key={inv.id}
                        className="cursor-pointer"
                        onClick={() => openDrawer(inv)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 text-[10px] font-semibold border border-graphite-100">
                              {inv.supplierName.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-graphite-900">
                              {inv.supplierName.replace(/,.*/, "")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[12px] text-graphite-600">
                          {inv.number}
                        </TableCell>
                        <TableCell className="text-graphite-600 tabular">
                          {formatDate(inv.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col tabular">
                            <span className="text-graphite-800">
                              {formatDate(inv.dueDate)}
                            </span>
                            {inv.status !== "apmaksāts" && (
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
                        <TableCell className="text-right font-semibold text-graphite-900 tabular">
                          {formatCurrency(inv.amount)}
                        </TableCell>
                        <TableCell className="text-right text-graphite-500 tabular text-[12.5px]">
                          {formatCurrency(inv.vat)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-graphite-600">
                          {inv.companyName}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openDrawer(inv)}>
                                <Eye className="h-3.5 w-3.5" />
                                Skatīt detaļas
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="h-3.5 w-3.5" />
                                Kopēt IBAN
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="h-3.5 w-3.5" />
                                Lejupielādēt PDF
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600 focus:text-red-700">
                                <Trash2 className="h-3.5 w-3.5" />
                                Dzēst
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Invoice detail drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          {selected && (
            <div className="flex flex-col h-full">
              <DrawerHeader>
                <div className="flex items-center gap-2">
                  <InvoiceStatusBadge status={selected.status} />
                  <span className="text-[11px] text-graphite-400 font-mono">
                    {selected.number}
                  </span>
                </div>
                <DrawerTitle>{selected.supplierName}</DrawerTitle>
                <DrawerDescription>
                  {selected.description || "Nav apraksta"}
                </DrawerDescription>
              </DrawerHeader>
              <DrawerBody className="space-y-6">
                {/* PDF preview placeholder */}
                <div className="aspect-[8.5/11] max-h-[320px] rounded-lg border border-graphite-200 bg-surface-subtle flex flex-col items-center justify-center gap-2 bg-grain">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-soft-sm">
                    <FileText className="h-4 w-4 text-graphite-600" />
                  </div>
                  <span className="text-[12px] text-graphite-500">
                    PDF priekšskatījums
                  </span>
                  <Button variant="secondary" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Lejupielādēt
                  </Button>
                </div>

                {/* Amounts */}
                <div className="rounded-xl border border-graphite-200/60 bg-graphite-50/40 p-4">
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-graphite-500">Summa bez PVN</span>
                      <span className="tabular text-graphite-800">
                        {formatCurrency(selected.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-graphite-500">PVN 21%</span>
                      <span className="tabular text-graphite-800">
                        {formatCurrency(selected.vat)}
                      </span>
                    </div>
                    <div className="h-px bg-graphite-200 my-2" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-[13px] font-medium text-graphite-900">
                        Kopā apmaksai
                      </span>
                      <span className="text-[22px] font-semibold tabular tracking-tight text-graphite-900">
                        {formatCurrency(selected.total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Supplier info */}
                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-wider text-graphite-400 mb-3">
                    Piegādātājs
                  </h4>
                  <dl className="space-y-2.5 text-[13px]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">Nosaukums</dt>
                      <dd className="text-right font-medium text-graphite-900">
                        {selected.supplierName}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">IBAN</dt>
                      <dd className="text-right font-mono text-[12px] text-graphite-700">
                        {selected.iban || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">Rēķina datums</dt>
                      <dd className="tabular text-graphite-800">
                        {formatDate(selected.date)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">Apmaksas termiņš</dt>
                      <dd className="tabular text-graphite-800">
                        {formatDate(selected.dueDate)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">Uzņēmums</dt>
                      <dd className="text-graphite-800">
                        {selected.companyName}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Notes */}
                {selected.notes && (
                  <div>
                    <h4 className="text-[11px] font-medium uppercase tracking-wider text-graphite-400 mb-3">
                      Piezīmes
                    </h4>
                    <p className="text-[13px] text-graphite-700 leading-relaxed rounded-lg bg-amber-50/50 border border-amber-100 p-3">
                      {selected.notes}
                    </p>
                  </div>
                )}
              </DrawerBody>
              <DrawerFooter>
                <Button variant="secondary" size="sm">
                  Atzīmēt kā apmaksātu
                </Button>
                <Button size="sm">Sagatavot maksājumu</Button>
              </DrawerFooter>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </AppShell>
  );
}
