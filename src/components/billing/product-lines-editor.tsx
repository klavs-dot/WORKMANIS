"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { createEmptyLine } from "@/lib/clients-store";
import type { ProductLine } from "@/lib/billing-types";
import { formatCurrency, cn } from "@/lib/utils";

interface ProductLinesEditorProps {
  lines: ProductLine[];
  onChange: (lines: ProductLine[]) => void;
  applyVAT: boolean;
}

export function ProductLinesEditor({
  lines,
  onChange,
  applyVAT,
}: ProductLinesEditorProps) {
  const updateLine = (id: string, patch: Partial<ProductLine>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    onChange([...lines, createEmptyLine()]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((l) => l.id !== id));
  };

  const parseNum = (s: string) => {
    const cleaned = s.replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-graphite-200 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_72px_100px_60px_100px_32px] gap-2 bg-graphite-50 px-3 py-2 text-[10.5px] uppercase tracking-wider font-medium text-graphite-500">
          <span>Nosaukums</span>
          <span className="text-right">Skaits</span>
          <span className="text-right">Cena</span>
          <span className="text-right">PVN %</span>
          <span className="text-right">Ar PVN</span>
          <span></span>
        </div>
        {lines.map((line, idx) => {
          const subtotal = line.quantity * line.unitPrice;
          const vatAmount = applyVAT
            ? subtotal * (line.vatPercent / 100)
            : 0;
          const total = subtotal + vatAmount;
          return (
            <div
              key={line.id}
              className={cn(
                "grid grid-cols-[1fr_72px_100px_60px_100px_32px] gap-2 px-3 py-2 items-center",
                idx !== lines.length - 1 && "border-b border-graphite-100"
              )}
            >
              <Input
                value={line.name}
                onChange={(e) => updateLine(line.id, { name: e.target.value })}
                placeholder="Preces nosaukums"
                className="h-8 text-[13px]"
              />
              <Input
                type="number"
                min="0"
                step="1"
                value={line.quantity}
                onChange={(e) =>
                  updateLine(line.id, { quantity: parseNum(e.target.value) })
                }
                className="h-8 text-[13px] text-right tabular"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.unitPrice}
                onChange={(e) =>
                  updateLine(line.id, { unitPrice: parseNum(e.target.value) })
                }
                className="h-8 text-[13px] text-right tabular"
              />
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={line.vatPercent}
                onChange={(e) =>
                  updateLine(line.id, { vatPercent: parseNum(e.target.value) })
                }
                disabled={!applyVAT}
                className="h-8 text-[13px] text-right tabular"
              />
              <div className="text-right text-[13px] font-semibold text-graphite-900 tabular">
                {formatCurrency(total)}
              </div>
              <button
                onClick={() => removeLine(line.id)}
                disabled={lines.length <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-md text-graphite-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Dzēst rindu"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <Button variant="ghost" size="sm" onClick={addLine}>
        <Plus className="h-3.5 w-3.5" />
        Pievienot rindu
      </Button>
    </div>
  );
}
