"use client";

/**
 * Reusable building blocks for the warehouse module.
 *
 * Kept in a single file because each piece is small and they're all
 * tightly coupled to the same data shape (InventoryItem). Splitting
 * them across files would mean lots of cross-imports without much
 * organizational benefit.
 *
 * Components exported here:
 *   - StockStatusBadge       (visual indicator: out / low / in stock)
 *   - InventoryActionPanel   (the +/− buttons and manual amount input)
 *   - InventoryCard          (one item rendered as a card, mobile-first)
 *   - InventoryFormModal     (create / edit dialog)
 *   - ConfirmDialog          (yes/no confirmation)
 *   - WarehouseBackground    (subtle warehouse photo backdrop)
 */

import { useEffect, useState } from "react";
import {
  Plus,
  Minus,
  Trash2,
  Pencil,
  Package,
  ImageIcon,
  AlertTriangle,
  Save,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import {
  WAREHOUSE_CATEGORIES,
  type WarehouseCategoryId,
} from "@/lib/warehouse-schema";
import type {
  InventoryItem,
  StockChangeAction,
  WarehouseSection,
} from "@/lib/warehouse-store";

// ============================================================
// Stock status badge
// ============================================================

export function StockStatusBadge({ stock }: { stock: number }) {
  let label: string;
  let style: string;

  if (stock <= 0) {
    label = "Nav noliktavā";
    style = "bg-red-50 text-red-700 border-red-200";
  } else if (stock <= 2) {
    label = "Zems atlikums";
    style = "bg-amber-50 text-amber-700 border-amber-200";
  } else {
    label = "Ir noliktavā";
    style = "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        style
      )}
    >
      {label}
    </span>
  );
}

// ============================================================
// Inventory action panel — +/- buttons and manual amount input
// ============================================================

export function InventoryActionPanel({
  item,
  section,
  onChange,
}: {
  item: InventoryItem;
  section: WarehouseSection;
  onChange: (
    section: WarehouseSection,
    itemId: string,
    action: StockChangeAction,
    amount: number
  ) => void;
}) {
  const [manualAmount, setManualAmount] = useState<string>("");

  const trigger = (action: StockChangeAction, amount: number) => {
    onChange(section, item.id, action, amount);
  };

  const onManual = (action: StockChangeAction) => {
    const n = parseInt(manualAmount, 10);
    if (isNaN(n) || n <= 0) return;
    onChange(section, item.id, action, n);
    setManualAmount("");
  };

  return (
    <div className="space-y-2.5">
      {/* Quick action buttons — large, workshop-friendly */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Paņemts", 1)}
          disabled={item.stock < 1}
          className="h-9"
        >
          <Minus className="h-3.5 w-3.5" />
          Paņemt 1
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Nolikts", 1)}
          className="h-9"
        >
          <Plus className="h-3.5 w-3.5" />
          Nolikt 1
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Paņemts", 2)}
          disabled={item.stock < 2}
          className="h-9"
        >
          <Minus className="h-3.5 w-3.5" />
          Paņemt 2
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Nolikts", 2)}
          className="h-9"
        >
          <Plus className="h-3.5 w-3.5" />
          Nolikt 2
        </Button>
      </div>

      {/* Manual amount input + take/add */}
      <div className="flex gap-1.5">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={manualAmount}
          onChange={(e) => setManualAmount(e.target.value)}
          placeholder="Skaits"
          className="flex-1 h-9 font-mono"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onManual("Paņemts")}
          disabled={!manualAmount || parseInt(manualAmount, 10) <= 0}
          className="h-9 shrink-0"
        >
          <Minus className="h-3.5 w-3.5" />
          Paņemt
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onManual("Nolikts")}
          disabled={!manualAmount || parseInt(manualAmount, 10) <= 0}
          className="h-9 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Nolikt
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Inventory card — one item, mobile-friendly
// ============================================================

export function InventoryCard({
  item,
  section,
  onStockChange,
  onEdit,
  onDelete,
}: {
  item: InventoryItem;
  section: WarehouseSection;
  onStockChange: (
    section: WarehouseSection,
    itemId: string,
    action: StockChangeAction,
    amount: number
  ) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}) {
  return (
    <Card className="overflow-hidden bg-white/85 backdrop-blur-sm">
      <div className="p-4 flex flex-col gap-3.5">
        {/* Top row: image + main info + actions */}
        <div className="flex gap-3">
          <ItemThumbnail src={item.imageUrl} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[14px] font-semibold tracking-tight text-graphite-900 line-clamp-2">
                {item.name || "Bez nosaukuma"}
              </h3>
              <div className="flex gap-0.5 shrink-0 -mt-1 -mr-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onEdit(item)}
                  title="Labot"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(item)}
                  title="Dzēst"
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {item.supplier && (
              <p className="text-[11.5px] text-graphite-500 mt-0.5 truncate">
                {item.supplier}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2">
              <span className="text-[20px] font-semibold tabular text-graphite-900">
                {item.stock}
              </span>
              <StockStatusBadge stock={item.stock} />
            </div>

            {(item.location || item.qtyPerUnit > 0) && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-graphite-500">
                {item.location && (
                  <span>
                    Vieta:{" "}
                    <span className="font-medium text-graphite-700">
                      {item.location}
                    </span>
                  </span>
                )}
                {item.qtyPerUnit > 0 && (
                  <span>
                    Uz vienu gatavo:{" "}
                    <span className="font-medium text-graphite-700 tabular">
                      {item.qtyPerUnit}
                    </span>
                  </span>
                )}
              </div>
            )}

            {item.notes && (
              <p className="text-[11.5px] text-graphite-600 mt-1.5 line-clamp-2 italic">
                {item.notes}
              </p>
            )}
          </div>
        </div>

        {/* Action panel (+/- buttons) */}
        <InventoryActionPanel
          item={item}
          section={section}
          onChange={onStockChange}
        />
      </div>
    </Card>
  );
}

function ItemThumbnail({ src }: { src: string }) {
  if (!src) {
    return (
      <div className="h-16 w-16 shrink-0 rounded-lg bg-graphite-100 flex items-center justify-center">
        <ImageIcon className="h-5 w-5 text-graphite-400" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-16 w-16 shrink-0 rounded-lg object-cover bg-graphite-100"
      onError={(e) => {
        // If image fails to load, hide it; the layout will collapse
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// ============================================================
// Inventory form modal — create / edit
// ============================================================

export function InventoryFormModal({
  open,
  onOpenChange,
  initialItem,
  showCategory,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialItem: InventoryItem | null;
  showCategory: boolean;
  onSubmit: (data: {
    category: string;
    imageUrl: string;
    name: string;
    supplier: string;
    qtyPerUnit: number;
    location: string;
    stock: number;
    notes: string;
  }) => void;
}) {
  const [category, setCategory] = useState<WarehouseCategoryId>("standarta");
  const [imageUrl, setImageUrl] = useState("");
  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [qtyPerUnit, setQtyPerUnit] = useState("");
  const [location, setLocation] = useState("");
  const [stock, setStock] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset form on open / when editing target changes
  useEffect(() => {
    if (!open) return;
    if (initialItem) {
      setCategory((initialItem.category as WarehouseCategoryId) || "standarta");
      setImageUrl(initialItem.imageUrl);
      setName(initialItem.name);
      setSupplier(initialItem.supplier);
      setQtyPerUnit(initialItem.qtyPerUnit ? String(initialItem.qtyPerUnit) : "");
      setLocation(initialItem.location);
      setStock(String(initialItem.stock));
      setNotes(initialItem.notes);
    } else {
      setCategory("standarta");
      setImageUrl("");
      setName("");
      setSupplier("");
      setQtyPerUnit("");
      setLocation("");
      setStock("");
      setNotes("");
    }
    setError(null);
  }, [open, initialItem]);

  const submit = () => {
    if (!name.trim()) {
      setError("Ievadi preces nosaukumu.");
      return;
    }
    const stockN = parseFloat(stock);
    const qtyN = parseFloat(qtyPerUnit);
    onSubmit({
      category: showCategory ? category : "",
      imageUrl: imageUrl.trim(),
      name: name.trim(),
      supplier: supplier.trim(),
      qtyPerUnit: isNaN(qtyN) ? 0 : qtyN,
      location: location.trim(),
      stock: isNaN(stockN) ? 0 : stockN,
      notes: notes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialItem ? "Labot preci" : "Pievienot preci"}
          </DialogTitle>
          <DialogDescription>
            {initialItem
              ? "Atjaunini preces datus. Atlikuma maiņa tiks ierakstīta žurnālā."
              : "Pievieno jaunu preci noliktavā."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 mt-1">
          {showCategory && (
            <div className="space-y-1.5">
              <Label>Kategorija</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {WAREHOUSE_CATEGORIES.map((c) => {
                  const selected = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium text-left transition-colors",
                        selected
                          ? "border-graphite-900 bg-graphite-900 text-white"
                          : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nosaukums *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preces nosaukums"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Bilde (URL)</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="font-mono text-[12px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Atlikums</Label>
              <Input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Skaits vienam gatavam</Label>
              <Input
                type="number"
                value={qtyPerUnit}
                onChange={(e) => setQtyPerUnit(e.target.value)}
                placeholder="0"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Piegādātājs</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Piegādātāja nosaukums"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Atrašanās vieta</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Plaukts, kaste, telpa"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Piezīmes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Piezīmes par preci"
              rows={2}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-graphite-100">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Confirmation dialog — generic yes/no
// ============================================================

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Apstiprināt",
  cancelLabel = "Atcelt",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-3 border-t border-graphite-100">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Warehouse background — subtle full-page warehouse photo
// ============================================================

/**
 * Full-page warehouse background. Uses a stock warehouse photo from
 * Unsplash (free for commercial use). Heavily blurred + low opacity
 * so it sits behind cards as ambient context, not as primary content.
 *
 * Cards on top should use bg-white/85 + backdrop-blur-sm to stay
 * legible against the photo.
 */
export function WarehouseBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.07]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1920&q=70')",
          filter: "blur(4px) saturate(0.7)",
        }}
      />
      {/* White wash to push the photo even further back */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-white/60" />
    </div>
  );
}

// ============================================================
// Empty + low-stock badge for headers
// ============================================================

export function InventoryEmptyState({
  onAddFirst,
}: {
  onAddFirst: () => void;
}) {
  return (
    <Card className="bg-white/85 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-50 text-graphite-400 mb-3">
          <Package className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h3 className="text-[15px] font-medium tracking-tight text-graphite-900">
          Šajā sadaļā vēl nav pievienota neviena prece
        </h3>
        <p className="mt-1 text-[13px] text-graphite-500 max-w-sm">
          Pievieno pirmo preci, lai sāktu sekot līdzi noliktavas atlikumiem
        </p>
        <Button size="sm" onClick={onAddFirst} className="mt-4">
          <Plus className="h-3.5 w-3.5" />
          Pievienot pirmo preci
        </Button>
      </div>
    </Card>
  );
}

// Re-export motion utilities for pages that animate card grids
export { motion, AnimatePresence, AlertTriangle };
