"use client";

/**
 * Bank-imported payments store.
 *
 * Separate from billing-store because:
 *   1. Billing-store is already huge (1200+ lines) — adding another
 *      entity would push it over the maintainability cliff
 *   2. Payments are only consumed by 2 places (Visi maksājumi tab,
 *      and the per-section red-warning rows). Don't need to live
 *      in the same context as everything else.
 *   3. Payments don't have the same optimistic-locking + soft-delete
 *      requirements as invoices, so the simpler hook works.
 *
 * Shape mirrors the API: amount in EUR (already converted), section
 * pre-classified at import time (no need to re-classify every render).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useCompany } from "./company-context";
import { pushToastGlobally } from "./toast-context";

export interface BankPayment {
  id: string;
  direction: string;
  category: string;
  invoiceOutId?: string;
  invoiceInId?: string;
  salaryId?: string;
  taxId?: string;
  counterparty: string;
  counterpartyIban?: string;
  /** Amount in EUR (signed: negative = incoming, positive = outgoing) */
  amount: number;
  paymentDate: string;
  bankAccountIban?: string;
  bankReference?: string;
  source: string;
  importedFromFilename?: string;
  /** ienakosie / izejosie / automatiskie / fiziskie */
  classifiedSection: string;
  /** When the importer found a matching invoice — set automatically.
   *  Empty for unmatched outgoing transactions (rendered as red
   *  'missing receipt' warnings in the relevant tab). */
  matchedInvoiceId?: string;
  rawReference: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentsStoreValue {
  payments: BankPayment[];
  loading: boolean;
  /** True while AI classification is running in the background */
  aiClassifying: boolean;
  refresh: () => Promise<void>;

  /** Bulk insert — used by the bank import flow. Returns both the
   *  count of successful writes AND the IDs of the created payments
   *  (so the caller can pass them to aiClassifyPending). */
  bulkCreate: (
    items: Array<Omit<BankPayment, "id" | "createdAt" | "updatedAt">>
  ) => Promise<{ succeeded: number; ids: string[] }>;

  /** Update the matched_invoice_id (when user attaches a receipt
   *  later) or any other editable field. */
  updatePayment: (
    id: string,
    patch: Partial<Omit<BankPayment, "id" | "createdAt" | "updatedAt">>
  ) => Promise<void>;

  deletePayment: (id: string) => Promise<void>;

  /** Run AI classification on a list of payment IDs and update
   *  their classified_section based on the result. Used by the
   *  bank import flow as a fire-and-forget step after import.
   *  Sends only PMNTCCRDOTHR-style card transactions to the AI —
   *  bank transfers and explicit ATM/POS codes don't need it. */
  aiClassifyPending: (paymentIds: string[]) => Promise<void>;
}

const Context = createContext<PaymentsStoreValue | null>(null);

export function PaymentsProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const [payments, setPayments] = useState<BankPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);

  // Ref that always holds the latest payments array. Used by
  // aiClassifyPending which is called immediately after bulkCreate
  // resolves — at that moment, React may not have re-rendered yet,
  // so reading from the closure-captured 'payments' state would
  // miss the just-added items. The ref is updated synchronously
  // inside setPayments callbacks so it's always up to date.
  const paymentsRef = useRef<BankPayment[]>([]);
  paymentsRef.current = payments;

  const fetchAll = useCallback(async () => {
    if (!activeCompany?.id) {
      setPayments([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payments?company_id=${encodeURIComponent(activeCompany.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        // If the column 'classified_section' doesn't exist yet
        // (user hasn't run schema repair after the deploy adding
        // the new fields), the API will 500. Don't toast that —
        // the user gets an empty list and a normal experience until
        // they repair the schema. Quiet console log is fine.
        console.warn("Payments fetch failed:", res.status);
        return;
      }
      const { payments: items } = (await res.json()) as {
        payments: BankPayment[];
      };
      // Newest first
      setPayments(
        (items ?? []).sort((a, b) =>
          (b.paymentDate || "").localeCompare(a.paymentDate || "")
        )
      );
    } catch (err) {
      console.error("Payments load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const bulkCreate: PaymentsStoreValue["bulkCreate"] = async (items) => {
    if (!activeCompany?.id) return { succeeded: 0, ids: [] };
    let succeeded = 0;
    // Sequential rather than parallel — Sheets writes don't parallelize
    // well (last-write-wins on the same range can lose data) and
    // import sizes are small enough (<200 rows typically) that
    // sequential is fine.
    const created: BankPayment[] = [];
    for (const item of items) {
      try {
        const res = await fetch(
          `/api/payments?company_id=${encodeURIComponent(activeCompany.id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              direction: item.direction,
              category: item.category,
              invoice_out_id: item.invoiceOutId ?? "",
              invoice_in_id: item.invoiceInId ?? "",
              salary_id: item.salaryId ?? "",
              tax_id: item.taxId ?? "",
              counterparty: item.counterparty,
              counterparty_iban: item.counterpartyIban ?? "",
              amount: item.amount,
              payment_date: item.paymentDate,
              bank_account_iban: item.bankAccountIban ?? "",
              bank_reference: item.bankReference ?? "",
              source: item.source,
              imported_from_csv_filename: item.importedFromFilename ?? "",
              classified_section: item.classifiedSection,
              matched_invoice_id: item.matchedInvoiceId ?? "",
              raw_reference: item.rawReference,
            }),
          }
        );
        if (res.ok) {
          const { payment } = (await res.json()) as { payment: BankPayment };
          created.push(payment);
          succeeded++;
        }
      } catch (err) {
        console.error("Payment create failed:", err);
      }
    }

    // Update local state with everything we successfully created
    if (created.length > 0) {
      setPayments((prev) =>
        [...created, ...prev].sort((a, b) =>
          (b.paymentDate || "").localeCompare(a.paymentDate || "")
        )
      );
    }
    return { succeeded, ids: created.map((p) => p.id) };
  };

  const updatePayment: PaymentsStoreValue["updatePayment"] = async (
    id,
    patch
  ) => {
    if (!activeCompany?.id) return;
    const current = payments.find((p) => p.id === id);
    if (!current) return;
    try {
      const res = await fetch(
        `/api/payments/${id}?company_id=${encodeURIComponent(activeCompany.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_updated_at: current.updatedAt,
            ...(patch.matchedInvoiceId !== undefined && {
              matched_invoice_id: patch.matchedInvoiceId,
            }),
            ...(patch.invoiceInId !== undefined && {
              invoice_in_id: patch.invoiceInId,
            }),
            ...(patch.classifiedSection !== undefined && {
              classified_section: patch.classifiedSection,
            }),
            ...(patch.category !== undefined && { category: patch.category }),
          }),
        }
      );
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      const { payment } = (await res.json()) as { payment: BankPayment };
      setPayments((prev) => prev.map((p) => (p.id === id ? payment : p)));
    } catch (err) {
      console.error("Payment update failed:", err);
      pushToastGlobally("error", "Kļūda atjauninot maksājumu", 6000);
      throw err;
    }
  };

  const deletePayment: PaymentsStoreValue["deletePayment"] = async (id) => {
    if (!activeCompany?.id) return;
    try {
      const res = await fetch(
        `/api/payments/${id}?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setPayments((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Payment delete failed:", err);
      pushToastGlobally("error", "Kļūda dzēšot maksājumu", 6000);
      throw err;
    }
  };

  /**
   * Run AI classification on a batch of just-imported payments.
   *
   * Filters down to PMNTCCRDOTHR-Pirkums style card transactions
   * before sending to the API — explicit type codes (PMNTCWDLATM,
   * PMNTCCRDTPOS) are already correctly classified by the regex
   * step, so spending tokens on them would be waste.
   *
   * After Claude responds, PATCH each payment whose AI
   * classification differs from what's already stored. The visible
   * UI updates automatically because Visi maksājumi tab subscribes
   * to this store.
   *
   * Errors are logged but not surfaced — AI is a best-effort
   * enhancement on top of regex classification, so a failure
   * leaves the user with the regex result and no visible problem.
   */
  const aiClassifyPending: PaymentsStoreValue["aiClassifyPending"] = async (
    paymentIds
  ) => {
    if (!activeCompany?.id || paymentIds.length === 0) return;

    // Build the input set, but only for payments that look like
    // ambiguous card purchases. Heuristic: type code (stored in
    // raw_reference for our import path) contains 'PMNTCCRDOTHR'
    // OR the existing classified_section is the regex-fallback
    // 'automatiskie' that's likely wrong.
    //
    // Read from the ref, NOT from the closure-captured 'payments' —
    // when this runs immediately after bulkCreate, the closure
    // reflects the pre-import state because React hasn't flushed
    // the setState yet.
    const candidates = paymentsRef.current.filter((p) => {
      if (!paymentIds.includes(p.id)) return false;
      const code = (p.rawReference || "").toLowerCase();
      const ref = (p.bankReference || "").toLowerCase();
      // Skip obvious non-card transactions
      if (code.includes("pmntcwdlatm") || code.includes("pmntcdpsatm")) {
        return false; // ATM — already correct as fiziskie
      }
      if (code.includes("pmntccrdtpos")) {
        return false; // Explicit POS — already correct
      }
      if (code.includes("pmntccrdothr") || ref.includes("pmntccrdothr")) {
        return true; // SEB generic card purchase — needs AI
      }
      // Other bank transfers don't go through AI either
      return false;
    });

    if (candidates.length === 0) return;

    setAiClassifying(true);
    try {
      const aiInput = candidates.map((p, idx) => ({
        index: idx,
        counterparty: p.counterparty,
        reference: p.bankReference || "",
        typeCode: p.rawReference || "",
      }));

      const res = await fetch(
        `/api/payments/ai-classify?company_id=${encodeURIComponent(activeCompany.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: aiInput }),
        }
      );

      if (!res.ok) {
        console.warn("AI classify endpoint returned", res.status);
        return;
      }

      const { results } = (await res.json()) as {
        results: Array<{
          index: number;
          section: "fiziskie" | "automatiskie";
          confidence: "high" | "medium" | "low";
          reasoning: string;
        }>;
      };

      // PATCH each payment whose AI classification differs from
      // what's already stored. Skip 'low' confidence — those are
      // guesses and shouldn't override the regex result.
      const updates = results.filter((r) => {
        const original = candidates[r.index];
        if (!original) return false;
        if (r.confidence === "low") return false;
        return original.classifiedSection !== r.section;
      });

      // Sequential PATCHes — Sheets last-write-wins is unreliable
      // for parallel writes on the same range
      for (const r of updates) {
        const original = candidates[r.index];
        if (!original) continue;
        try {
          await updatePayment(original.id, { classifiedSection: r.section });
        } catch (err) {
          console.warn(
            `Failed to apply AI classification for ${original.id}:`,
            err
          );
        }
      }

      if (updates.length > 0) {
        pushToastGlobally(
          "success",
          `AI pārklasificēja ${updates.length} kartes pirkumus`,
          5000
        );
      }
    } catch (err) {
      console.error("AI classification failed:", err);
    } finally {
      setAiClassifying(false);
    }
  };

  const value = useMemo<PaymentsStoreValue>(
    () => ({
      payments,
      loading,
      aiClassifying,
      refresh: fetchAll,
      bulkCreate,
      updatePayment,
      deletePayment,
      aiClassifyPending,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, loading, aiClassifying, fetchAll]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePayments() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("usePayments must be used inside PaymentsProvider");
  }
  return ctx;
}
