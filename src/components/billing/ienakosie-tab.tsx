"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Download,
  FileText,
  Receipt,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IncomingStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import type { IncomingInvoice, IncomingStatus } from "@/lib/billing-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  generateNumber,
  previewNumber,
  invoiceNumberLabel,
  deliveryNumberLabel,
} from "@/lib/number-generator";

// ============================================================
// FUTURE: Google Sheets integration
// Single spreadsheet with multiple tabs (one per category).
// On addIncoming / attachDeliveryNote → append row to the
// correct tab. On status change → update the row in place.
// See: https://developers.google.com/sheets/api/reference/rest
// ============================================================

type InvoiceFormState = {
  client: string;
  description: string;
  amount: string;
  vat: string;
  date: string;
  dueDate: string;
};

const emptyInvoice = (): InvoiceFormState => ({
  client: "",
  description: "",
  amount: "",
  vat: "",
  date: new Date().toISOString().slice(0, 10),
  dueDate: "",
});

export function IenakosieTab() {
  const { incoming, addIncoming, attachDeliveryNote, updateIncoming } =
    useBilling();

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editing, setEditing] = useState<IncomingInvoice | null>(null);
  const [form, setForm] = useState<InvoiceFormState>(emptyInvoice());

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryInvoice, setDeliveryInvoice] =
    useState<IncomingInvoice | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const openNewInvoice = () => {
    setEditing(null);
    setForm(emptyInvoice());
    setInvoiceOpen(true);
  };

  const openEditInvoice = (inv: IncomingInvoice) => {
    setEditing(inv);
    setForm({
      client: inv.client,
      description: inv.description,
      amount: String(inv.amount),
      vat: String(inv.vat),
      date: inv.date,
      dueDate: inv.dueDate,
    });
    setInvoiceOpen(true);
  };

  const submitInvoice = () => {
    const amount = parseFloat(form.amount) || 0;
    const vat = parseFloat(form.vat) || 0;

    if (editing) {
      // Editing existing → DO NOT generate new number
      updateIncoming(editing.id, {
        client: form.client,
        description: form.description,
        amount,
        vat,
        date: form.date,
        dueDate: form.dueDate,
      });
    } else {
      // New invoice → generate number for today
      const number = generateNumber("invoice");
      addIncoming({
        number,
        client: form.client,
        description: form.description,
        amount,
        vat,
        date: form.date,
        dueDate: form.dueDate,
        status: "gaidam_apmaksu" as IncomingStatus,
      });
    }
    setInvoiceOpen(false);
  };

  const openDelivery = (inv: IncomingInvoice) => {
    setDeliveryInvoice(inv);
    setDeliveryForm({
      description: inv.description,
      date: new Date().toISOString().slice(0, 10),
    });
    setDeliveryOpen(true);
  };

  const submitDelivery = () => {
    if (!deliveryInvoice) return;
    const noteNumber = generateNumber("delivery");
    attachDeliveryNote(deliveryInvoice.id, noteNumber);
    setDeliveryOpen(false);
  };

  const previewInvoiceNum = invoiceOpen && !editing ? previewNumber("invoice") : null;
  const previewDeliveryNum = deliveryOpen ? previewNumber("delivery") : null;

  return (
    <div className="space-y-6">
      {/* Header with action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Izrakstītie rēķini
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            Rēķini, ko mēs esam izrakstījuši klientiem
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <Download className="h-3.5 w-3.5" />
            Eksportēt PDF
          </Button>
          <Button size="sm" onClick={openNewInvoice}>
            <Plus className="h-3.5 w-3.5" />
            Izrakstīt rēķinu
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
          {incoming.length === 0 ? (
            <div className="p-12 text-center text-[13px] text-graphite-500">
              Vēl nav izrakstīts neviens rēķins
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Klients</TableHead>
                  <TableHead>Rēķina numurs</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Termiņš</TableHead>
                  <TableHead>Statuss</TableHead>
                  <TableHead className="text-right w-[200px]">
                    Darbības
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incoming.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-graphite-900">
                          {inv.client}
                        </p>
                        <p className="text-[11px] text-graphite-500 mt-0.5 truncate max-w-[280px]">
                          {inv.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-graphite-600">
                      Rēķins Nr. {inv.number}
                      {inv.deliveryNote && (
                        <div className="text-[10.5px] text-graphite-400 mt-0.5">
                          Pavadz. {inv.deliveryNote}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-graphite-900 tabular">
                      {formatCurrency(inv.amount + inv.vat)}
                    </TableCell>
                    <TableCell className="text-graphite-600 tabular">
                      {formatDate(inv.dueDate)}
                    </TableCell>
                    <TableCell>
                      <IncomingStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {!inv.deliveryNote ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openDelivery(inv)}
                          >
                            <Receipt className="h-3 w-3" />
                            Izrakstīt pavadzīmi
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium mr-1">
                            <Receipt className="h-3 w-3" />
                            Pavadzīme
                          </span>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEditInvoice(inv)}>
                              Rediģēt
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                updateIncoming(inv.id, { status: "apmaksats" })
                              }
                            >
                              Atzīmēt kā apmaksātu
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="h-3.5 w-3.5" />
                              Lejupielādēt PDF
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-700">
                              Dzēst
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </motion.div>

      {/* Invoice form modal */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Rediģēt rēķinu" : "Izrakstīt jaunu rēķinu"}
            </DialogTitle>
            <DialogDescription>
              {editing ? (
                <>
                  Numurs:{" "}
                  <span className="font-mono text-graphite-700">
                    {invoiceNumberLabel(editing.number)}
                  </span>
                </>
              ) : previewInvoiceNum ? (
                <>
                  Tiks piešķirts numurs:{" "}
                  <span className="font-mono text-graphite-700">
                    {invoiceNumberLabel(previewInvoiceNum)}
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 pt-2">
            <Field label="Klients">
              <Input
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                placeholder="Klienta nosaukums vai SIA"
              />
            </Field>
            <Field label="Apraksts">
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Pakalpojuma vai preces apraksts"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Summa (bez PVN)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                />
              </Field>
              <Field label="PVN (21%)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.vat}
                  onChange={(e) => setForm({ ...form, vat: e.target.value })}
                  placeholder="0,00"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datums">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Apmaksas termiņš">
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" size="sm" onClick={() => setInvoiceOpen(false)}>
              Atcelt
            </Button>
            <Button size="sm" onClick={submitInvoice} disabled={!form.client}>
              <FileText className="h-3.5 w-3.5" />
              {editing ? "Saglabāt" : "Izrakstīt rēķinu"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery note modal */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Izrakstīt pavadzīmi</DialogTitle>
            <DialogDescription>
              {previewDeliveryNum && (
                <>
                  Tiks piešķirts numurs:{" "}
                  <span className="font-mono text-graphite-700">
                    {deliveryNumberLabel(previewDeliveryNum)}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {deliveryInvoice && (
            <>
              <div className="rounded-lg bg-graphite-50/60 border border-graphite-100 p-3 space-y-1.5">
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-graphite-500">Rēķins</span>
                  <span className="font-mono text-graphite-700">
                    {invoiceNumberLabel(deliveryInvoice.number)}
                  </span>
                </div>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-graphite-500">Klients</span>
                  <span className="text-graphite-800">
                    {deliveryInvoice.client}
                  </span>
                </div>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-graphite-500">Summa</span>
                  <span className="font-semibold text-graphite-900 tabular">
                    {formatCurrency(
                      deliveryInvoice.amount + deliveryInvoice.vat
                    )}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 pt-2">
                <Field label="Apraksts">
                  <Textarea
                    value={deliveryForm.description}
                    onChange={(e) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        description: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Datums">
                  <Input
                    type="date"
                    value={deliveryForm.date}
                    onChange={(e) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        date: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeliveryOpen(false)}
                >
                  Atcelt
                </Button>
                <Button size="sm" onClick={submitDelivery}>
                  <Receipt className="h-3.5 w-3.5" />
                  Izrakstīt pavadzīmi
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
