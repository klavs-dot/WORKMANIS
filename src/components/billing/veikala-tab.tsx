"use client";

/**
 * VeikalaTab — Fiziskie maksājumi.
 *
 * BEFORE: this component used `storePayments` — old seed/mock
 * data from billing-store that never wired up to actual bank
 * imports. The tab always showed empty (or stale demo data) even
 * when the user had hundreds of POS card transactions.
 *
 * AFTER: filters real bank payments where the classifier (in
 * payment-classifier.ts) bucketed them as 'fiziskie' — POS
 * terminal swipes, ATM withdrawals, cash transactions. We
 * re-classify client-side rather than trusting the stored
 * classified_section so any classifier improvements (new POS
 * patterns, new chains) take effect immediately for ALL
 * existing payments without re-import.
 *
 * Layout matches automatiskie-tab.tsx for consistency.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, AlertCircle } from "lucide-react";
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
import { classifyTransaction } from "@/lib/payment-classifier";
import { formatCurrency, formatDate } from "@/lib/utils";

export function VeikalaTab() {
  const { payments, loading } = usePayments();

  // Filter to physical card / ATM / cash transactions. Re-classify
  // each payment client-side using the latest classifier rules so
  // we don't rely on the stored classified_section being correct.
  // (Old payments imported before the TypeCode fix have empty or
  // wrong classified_section; live re-classification recovers.)
  const fiziskiePayments = useMemo(() => {
    return payments.filter((p) => {
      const reclassified = classifyTransaction({
        rawDate: p.paymentDate,
        date: p.paymentDate,
        counterparty: p.counterparty,
        counterpartyIban: p.counterpartyIban,
        amount: p.amount,
        reference: p.bankReference || p.rawReference || "",
        currency: "EUR",
        // raw_reference may contain the FIDAVISTA TypeCode
        // (PMNTCCRDTPOS, PMNTCWDLATM, etc.) from imports done
        // after the TypeCode fix. Older imports have payment
        // description text here — the classifier falls back to
        // counterparty + reference pattern matching, which still
        // catches most physical-store transactions.
        raw: { TypeCode: p.rawReference || "" },
      });
      return reclassified === "fiziskie";
    });
  }, [payments]);

  if (loading) {
    return (
      <Card className="p-8 text-center text-graphite-500 text-sm">
        Ielādē fiziskos maksājumus…
      </Card>
    );
  }

  if (fiziskiePayments.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-graphite-50 flex items-center justify-center mb-3">
            <ShoppingBag className="h-5 w-5 text-graphite-400" />
          </div>
          <h3 className="text-[14px] font-medium text-graphite-900">
            Nav fizisko maksājumu
          </h3>
          <p className="text-[12px] text-graphite-500 mt-1 max-w-md mx-auto leading-relaxed">
            Šeit parādīsies kartes maksājumi POS termināļos (DUS, veikali,
            restorāni) un bankomāta darījumi pēc nākamā bankas izraksta
            importa.
          </p>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-graphite-100 flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-semibold text-graphite-900 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-graphite-600" />
                Fiziskie maksājumi
                <span className="text-graphite-500 font-normal">
                  ({fiziskiePayments.length})
                </span>
              </h3>
              <p className="text-[11.5px] text-graphite-500 mt-0.5">
                Kartes maksājumi POS termināļos un bankomāta darījumi
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-500">
                Kopā
              </div>
              <div className="text-[15px] font-semibold text-graphite-900 tabular">
                {formatCurrency(
                  fiziskiePayments.reduce((sum, p) => sum + p.amount, 0)
                )}
              </div>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Vieta / Pretpartneris</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>Datums</TableHead>
                <TableHead>Detaļas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiziskiePayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                        <ShoppingBag className="h-3 w-3" />
                      </div>
                      <span className="font-medium text-graphite-900 truncate max-w-[300px]">
                        {p.counterparty || "(bez nosaukuma)"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-graphite-900 tabular">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className="text-graphite-600 tabular text-[12px]">
                    {formatDate(p.paymentDate)}
                  </TableCell>
                  <TableCell>
                    <div className="text-[11px] text-graphite-500 truncate max-w-[300px]">
                      {p.bankReference || p.rawReference || "—"}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </motion.div>

      <div className="text-[11px] text-graphite-500 px-1 flex items-start gap-1.5">
        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          Šie maksājumi parasti nesatur atbilstošu rēķinu (kartes pirkumi
          POS termināļos un bankomāta darījumi). Grāmatvedis tos klasificē
          atsevišķi kā saimnieciskās izmaksas.
        </span>
      </div>
    </div>
  );
}
