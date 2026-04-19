import type { InvoiceContent } from "./billing-types";

export interface InvoiceTotals {
  subtotal: number; // bez PVN
  vatAmount: number;
  total: number; // ar PVN
}

export function calculateTotals(
  content: InvoiceContent,
  applyVAT: boolean
): InvoiceTotals {
  if (content.kind === "pakalpojums") {
    const subtotal = content.amount || 0;
    const vatAmount = applyVAT ? subtotal * (content.vatPercent / 100) : 0;
    return { subtotal, vatAmount, total: subtotal + vatAmount };
  }

  // Product lines
  let subtotal = 0;
  let vatAmount = 0;
  for (const line of content.lines) {
    const lineSubtotal = (line.quantity || 0) * (line.unitPrice || 0);
    subtotal += lineSubtotal;
    if (applyVAT) {
      vatAmount += lineSubtotal * ((line.vatPercent || 0) / 100);
    }
  }
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
