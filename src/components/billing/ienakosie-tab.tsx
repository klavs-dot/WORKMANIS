"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Receipt,
  MoreHorizontal,
  FileText,
  Pencil,
  Check,
  Trash2,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import { IssuedStatusBadge } from "@/components/business/billing-status-badges";
import { InvoiceModal } from "./invoice-modal";
import { useBilling } from "@/lib/billing-store";
import type { IssuedInvoice } from "@/lib/billing-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  generateNumber,
  previewNumber,
  invoiceNumberLabel,
  deliveryNumberLabel,
} from "@/lib/number-generator";
import { PnAktsButton } from "@/components/billing/pn-akts-button";

// ============================================================
// FUTURE: Google Sheets integration
// Single spreadsheet with multiple tabs (one per category).
// On addIssued / attachDeliveryNote → append row to the
// correct tab. On status change → update the row in place.
// ============================================================

export function IenakosieTab() {
  const { issued, attachDeliveryNote, attachIssuedPN, detachIssuedPN, updateIssued } =
    useBilling();

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [editingNumber, setEditingNumber] = useState<string | undefined>();

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryInvoice, setDeliveryInvoice] =
    useState<IssuedInvoice | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const openNewInvoice = () => {
    setEditingNumber(undefined);
    setInvoiceModalOpen(true);
  };

  const openEditInvoice = (inv: IssuedInvoice) => {
    setEditingNumber(inv.number);
    setInvoiceModalOpen(true);
  };

  const openDelivery = (inv: IssuedInvoice) => {
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

  const previewDeliveryNum = deliveryOpen ? previewNumber("delivery") : null;

  return (
    <div className="space-y-6">
      {/* Header */}
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
          {issued.length === 0 ? (
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
                  <TableHead className="text-right w-[220px]">
                    Darbības
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issued.map((inv) => (
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
                      <IssuedStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5 items-center">
                        <PnAktsButton
                          current={inv.pnAkts}
                          onAttach={({ number, source, fileName }) =>
                            attachIssuedPN(inv.id, number, source, fileName)
                          }
                          onRemove={() => detachIssuedPN(inv.id)}
                        />
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
                          <DropdownMenuContent align="end" className="min-w-[200px]">
                            <DropdownMenuItem>
                              <FileText className="h-3.5 w-3.5 text-graphite-500" />
                              Lejupielādēt rēķinu
                            </DropdownMenuItem>
                            {inv.deliveryNote && (
                              <DropdownMenuItem>
                                <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                                Lejupielādēt pavadzīmi
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => openEditInvoice(inv)}>
                              <Pencil className="h-3.5 w-3.5 text-graphite-500" />
                              Labot
                            </DropdownMenuItem>
                            {inv.status !== "apmaksats" && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  updateIssued(inv.id, { status: "apmaksats" })
                                }
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                Atzīmēt kā apmaksātu
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-700">
                              <Trash2 className="h-3.5 w-3.5" />
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

      {/* New / edit invoice modal */}
      <InvoiceModal
        open={invoiceModalOpen}
        onOpenChange={setInvoiceModalOpen}
        editingNumber={editingNumber}
      />

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
                <div className="space-y-1.5">
                  <Label>Apraksts</Label>
                  <Textarea
                    value={deliveryForm.description}
                    onChange={(e) =>
                      setDeliveryForm({
                        ...deliveryForm,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Datums</Label>
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
                </div>
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
