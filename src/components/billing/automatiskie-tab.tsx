"use client";

/**
 * AutomatiskieTab — online card payments and subscriptions.
 *
 * Reads from PaymentsStore (bank-imported transactions classified
 * as 'automatiskie' by the regex+AI pipeline) and renders one row
 * per transaction. Each row shows amount, merchant, date, plus
 * the InvoiceFileActions component for attaching/viewing the
 * receipt PDF.
 *
 * Receipt PDFs go onto the matched 31_invoices_in row's
 * fileDriveId column when one exists. When no invoice is matched
 * (the common case for online card purchases — there's no formal
 * supplier invoice, just an emailed receipt), the upload still
 * succeeds but the file isn't tied to a billing record. A
 * follow-up iteration will add a dedicated 'receipts' table for
 * these orphaned PDFs.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Globe, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { usePayments } from "@/lib/payments-store";
import { useBilling } from "@/lib/billing-store";
import { classifyTransaction } from "@/lib/payment-classifier";
import { InvoiceFileActions } from "@/components/billing/invoice-file-actions";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

export function AutomatiskieTab() {
  const { payments, loading } = usePayments();
  const { received, updateReceived } = useBilling();

  // Filter payments classified as 'automatiskie'. Re-classify
  // client-side rather than trusting the stored field — this way
  // any classifier updates (new patterns, AI fixes) take effect
  // immediately without needing a re-import.
  const automatiskiePayments = useMemo(() => {
    return payments.filter((p) => {
      const reclassified = classifyTransaction({
        rawDate: p.paymentDate,
        date: p.paymentDate,
        counterparty: p.counterparty,
        counterpartyIban: p.counterpartyIban,
        amount: p.amount,
        reference: p.bankReference || p.rawReference || "",
        currency: "EUR",
        raw: { TypeCode: p.rawReference || "" },
      });
      return reclassified === "automatiskie";
    });
  }, [payments]);

  const receivedById = useMemo(() => {
    return new Map(received.map((r) => [r.id, r]));
  }, [received]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-graphite-100">
            <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
              Automātiskie & Internetā
            </h3>
            <p className="mt-0.5 text-[12.5px] text-graphite-500">
              Online kartes pirkumi, abonementi un automātiskie maksājumi.
              Pievieno čeka PDF lai grāmatvedim ir pierādījums par pirkumu.
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-[13px] text-graphite-500">
              Ielādē…
            </div>
          ) : automatiskiePayments.length === 0 ? (
            <div className="p-12 text-center text-[13px] text-graphite-500">
              Nav automātisko maksājumu. Importē bankas izrakstu, lai
              tos ielādētu.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Pakalpojums</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Datums</TableHead>
                  <TableHead className="w-[180px] text-right">
                    Rēķins / Čeks
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automatiskiePayments.map((p) => {
                  const matched = p.matchedInvoiceId
                    ? receivedById.get(p.matchedInvoiceId)
                    : undefined;
                  const isMissing = !matched?.fileDriveId;

                  return (
                    <TableRow
                      key={p.id}
                      className={cn(
                        isMissing &&
                          "bg-red-50/40 hover:bg-red-50/60 border-l-2 border-l-red-300"
                      )}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                            <Globe className="h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <div
                              className={cn(
                                "font-medium",
                                isMissing
                                  ? "text-red-900"
                                  : "text-graphite-900"
                              )}
                            >
                              {p.counterparty || "—"}
                            </div>
                            {isMissing && (
                              <div className="text-[10.5px] text-red-700 font-normal mt-0.5 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Trūkst čeka — pievieno PDF
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-graphite-900 tabular">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell className="text-graphite-600 tabular">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5 items-center">
                          <InvoiceFileActions
                            fileDriveId={matched?.fileDriveId}
                            fileName={matched?.fileName}
                            direction="received"
                            invoiceDate={p.paymentDate}
                            size="icon"
                            onFileUploaded={(driveFileId, originalName) => {
                              if (matched) {
                                updateReceived(matched.id, {
                                  fileDriveId: driveFileId,
                                  fileName: originalName,
                                });
                              }
                            }}
                          />
                        </div>
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
  );
}
