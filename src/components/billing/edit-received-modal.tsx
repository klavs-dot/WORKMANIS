"use client";

import { useEffect, useState } from "react";
import { Save, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ReceivedInvoice } from "@/lib/billing-store";

/**
 * Edit modal for received payments. Use when the AI parser
 * misread data from the uploaded PDF — manager can correct
 * supplier, invoice number, amount, IBAN, or due date.
 *
 * Status, accountingMeta, PN akts, and fileName are NOT editable
 * here — they have their own dedicated flows.
 */
export function EditReceivedModal({
  payment,
  onClose,
  onSave,
}: {
  payment: ReceivedInvoice | null;
  onClose: () => void;
  onSave: (patch: Partial<ReceivedInvoice>) => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [iban, setIban] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!payment) return;
    setSupplier(payment.supplier);
    setInvoiceNumber(payment.invoiceNumber);
    setAmount(String(payment.amount));
    setIban(payment.iban);
    setDueDate(payment.dueDate);
  }, [payment]);

  const submit = () => {
    if (!payment) return;
    const num = parseFloat(amount);
    if (!supplier.trim() || !invoiceNumber.trim() || !iban.trim() || !dueDate || isNaN(num)) {
      return;
    }
    onSave({
      supplier: supplier.trim(),
      invoiceNumber: invoiceNumber.trim(),
      amount: num,
      iban: iban.replace(/\s/g, "").toUpperCase(),
      dueDate,
    });
  };

  const valid =
    supplier.trim().length > 0 &&
    invoiceNumber.trim().length > 0 &&
    iban.trim().length > 0 &&
    dueDate.length > 0 &&
    !isNaN(parseFloat(amount));

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-graphite-500" />
            Labot rēķina datus
          </DialogTitle>
          <DialogDescription>
            Koriģē laukus, ja automātiskā atpazīšana kļūdījās
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>
              Piegādātājs <span className="text-red-500">*</span>
            </Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="piem. AS Latvenergo"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Rēķina numurs <span className="text-red-500">*</span>
              </Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="piem. LE-26-04-02291"
                className="font-mono text-[12.5px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Summa, EUR <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="tabular"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              IBAN <span className="text-red-500">*</span>
            </Label>
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="LV61HABA0001408042678"
              className="font-mono text-[12.5px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Apmaksas termiņš <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-graphite-100 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
