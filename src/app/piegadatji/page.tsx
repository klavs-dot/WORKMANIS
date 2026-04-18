"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, Plus, MoreHorizontal, Building2, Mail, MapPin } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from "@/components/ui/drawer";
import { suppliers, invoices } from "@/lib/mock";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Supplier } from "@/lib/types";

export default function PiegadatjiPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  const openDetail = (s: Supplier) => {
    setSelected(s);
    setDrawerOpen(true);
  };

  const supplierInvoices = selected
    ? invoices.filter((i) => i.supplierId === selected.id)
    : [];

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Piegādātāji"
          description={`${suppliers.length} piegādātāji ${new Set(suppliers.map((s) => s.country)).size} valstīs`}
          actions={
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Pievienot piegādātāju
            </Button>
          }
        />

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-graphite-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Meklēt piegādātājus..."
            className="w-full h-9 rounded-lg border border-graphite-200 bg-white pl-9 pr-3 text-[13px] text-graphite-800 placeholder:text-graphite-400 hover:border-graphite-300 focus:border-graphite-900 focus:outline-none focus:ring-2 focus:ring-graphite-900/5 transition-colors"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nosaukums</TableHead>
                  <TableHead>Reģ. nr.</TableHead>
                  <TableHead>PVN nr.</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead>Valsts</TableHead>
                  <TableHead>Pēdējais rēķins</TableHead>
                  <TableHead className="text-right">Kopējā summa</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => openDetail(s)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 text-[10px] font-semibold border border-graphite-100">
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-graphite-900">
                            {s.name.replace(/,.*/, "")}
                          </p>
                          {s.category && (
                            <p className="text-[10.5px] text-graphite-400 mt-0.5">
                              {s.category}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11.5px] text-graphite-600 tabular">
                      {s.regNumber}
                    </TableCell>
                    <TableCell className="font-mono text-[11.5px] text-graphite-600 tabular">
                      {s.vatNumber}
                    </TableCell>
                    <TableCell className="font-mono text-[11.5px] text-graphite-600">
                      {s.iban.slice(0, 4)}…{s.iban.slice(-4)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-semibold bg-graphite-100 text-graphite-700 rounded px-1.5 py-0.5">
                          {s.countryCode}
                        </span>
                        <span className="text-graphite-600 text-[12.5px]">
                          {s.country}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-graphite-600 tabular">
                      {s.lastInvoiceDate ? formatDate(s.lastInvoiceDate) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-graphite-900 tabular">
                      {formatCurrency(s.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </motion.div>
      </div>

      {/* Supplier drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          {selected && (
            <div className="flex flex-col h-full">
              <DrawerHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-50 text-graphite-700 text-[14px] font-semibold border border-graphite-100">
                    {selected.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <DrawerTitle>{selected.name}</DrawerTitle>
                    <DrawerDescription>
                      {selected.category || "Piegādātājs"} · {selected.country}
                    </DrawerDescription>
                  </div>
                </div>
              </DrawerHeader>
              <DrawerBody className="space-y-6">
                {/* Key info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-graphite-200/60 bg-white p-3.5">
                    <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                      Kopējā summa
                    </p>
                    <p className="mt-1.5 text-[20px] font-semibold tabular tracking-tight text-graphite-900">
                      {formatCurrency(selected.totalAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-graphite-200/60 bg-white p-3.5">
                    <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
                      Rēķini
                    </p>
                    <p className="mt-1.5 text-[20px] font-semibold tabular tracking-tight text-graphite-900">
                      {supplierInvoices.length}
                    </p>
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <h4 className="text-[11px] font-medium uppercase tracking-wider text-graphite-400 mb-3">
                    Kontaktinformācija
                  </h4>
                  <dl className="space-y-2.5 text-[13px]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">Reģ. nr.</dt>
                      <dd className="font-mono text-[12px] text-graphite-700">
                        {selected.regNumber}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">PVN nr.</dt>
                      <dd className="font-mono text-[12px] text-graphite-700">
                        {selected.vatNumber}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-graphite-500">IBAN</dt>
                      <dd className="font-mono text-[12px] text-graphite-700">
                        {selected.iban}
                      </dd>
                    </div>
                    {selected.email && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-graphite-500 flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          E-pasts
                        </dt>
                        <dd className="text-graphite-700">{selected.email}</dd>
                      </div>
                    )}
                    {selected.address && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-graphite-500 flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" />
                          Adrese
                        </dt>
                        <dd className="text-graphite-700 text-right">
                          {selected.address}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Related invoices */}
                {supplierInvoices.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-medium uppercase tracking-wider text-graphite-400 mb-3">
                      Saistītie rēķini ({supplierInvoices.length})
                    </h4>
                    <div className="rounded-xl border border-graphite-200/60 divide-y divide-graphite-100">
                      {supplierInvoices.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 hover:bg-graphite-50/50 transition-colors"
                        >
                          <div>
                            <p className="text-[12.5px] font-medium text-graphite-900 font-mono">
                              {inv.number}
                            </p>
                            <p className="text-[11px] text-graphite-500 tabular">
                              {formatDate(inv.date)}
                            </p>
                          </div>
                          <span className="text-[13px] font-semibold tabular text-graphite-900">
                            {formatCurrency(inv.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </DrawerBody>
              <DrawerFooter>
                <Button variant="secondary" size="sm">
                  Rediģēt
                </Button>
                <Button size="sm">Pievienot rēķinu</Button>
              </DrawerFooter>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </AppShell>
  );
}
