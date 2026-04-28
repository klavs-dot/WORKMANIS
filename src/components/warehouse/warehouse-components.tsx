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

import { useEffect, useRef, useState } from "react";
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
  Upload,
  Loader2,
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
    <div className="space-y-1.5">
      {/* Quick action buttons — compact 4-button row, smaller height
          to fit the horizontal card layout */}
      <div className="grid grid-cols-4 gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Paņemts", 1)}
          disabled={item.stock < 1}
          className="h-7 px-1.5 text-[11px] gap-0.5"
        >
          <Minus className="h-3 w-3" />1
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Paņemts", 2)}
          disabled={item.stock < 2}
          className="h-7 px-1.5 text-[11px] gap-0.5"
        >
          <Minus className="h-3 w-3" />2
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Nolikts", 1)}
          className="h-7 px-1.5 text-[11px] gap-0.5"
        >
          <Plus className="h-3 w-3" />1
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => trigger("Nolikts", 2)}
          className="h-7 px-1.5 text-[11px] gap-0.5"
        >
          <Plus className="h-3 w-3" />2
        </Button>
      </div>

      {/* Manual amount input + take/add */}
      <div className="flex gap-1">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={manualAmount}
          onChange={(e) => setManualAmount(e.target.value)}
          placeholder="N"
          className="flex-1 h-7 font-mono text-[12px] px-2"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onManual("Paņemts")}
          disabled={!manualAmount || parseInt(manualAmount, 10) <= 0}
          className="h-7 px-2 text-[11px] gap-0.5 shrink-0"
        >
          <Minus className="h-3 w-3" />
          Paņemt
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onManual("Nolikts")}
          disabled={!manualAmount || parseInt(manualAmount, 10) <= 0}
          className="h-7 px-2 text-[11px] gap-0.5 shrink-0"
        >
          <Plus className="h-3 w-3" />
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
  // Stock-state pulse on the card border — red when out of stock,
  // amber when low. No pulse for healthy stock — would be visual
  // noise. Uses CSS keyframes defined in globals.css.
  const pulseClass =
    item.stock <= 0
      ? "stock-out-pulse"
      : item.stock <= 2
        ? "stock-low-pulse"
        : "";

  return (
    <Card
      className={cn(
        "overflow-hidden bg-white/85 backdrop-blur-sm border",
        pulseClass
      )}
    >
      {/* Horizontal row layout — all fields visible inline like a
          spreadsheet. On narrow screens (<lg) the layout stacks
          vertically; on wide screens everything sits in one row.
          Larger padding + thumbnail + bigger text per user request
          (kept the action panel buttons compact). */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 p-4">
        {/* Thumbnail — fixed width, 2x previous size */}
        <ItemThumbnail src={item.imageUrl} />

        {/* Name + supplier — flexible, takes remaining horizontal space */}
        <div className="flex-1 min-w-0 lg:max-w-[340px]">
          <h3 className="text-[17px] font-semibold tracking-tight text-graphite-900 truncate">
            {item.name || "Bez nosaukuma"}
          </h3>
          {item.supplier && (
            <p className="text-[13.5px] text-graphite-500 mt-1 truncate">
              {item.supplier}
            </p>
          )}
          {item.notes && (
            <p className="text-[13px] text-graphite-500 mt-1 truncate italic">
              {item.notes}
            </p>
          )}
        </div>

        {/* Spreadsheet-style data columns: each cell has a tiny label
            on top and the value below. Bigger text per user request. */}
        <div className="grid grid-cols-3 lg:flex lg:items-center gap-4 lg:gap-7 lg:shrink-0">
          <DataCell label="Vieta" value={item.location || "—"} />
          <DataCell
            label="Vienam gatavam"
            value={item.qtyPerUnit > 0 ? String(item.qtyPerUnit) : "—"}
            mono
          />
          <div className="flex flex-col gap-1 lg:items-center">
            <span className="text-[11px] uppercase tracking-wider text-graphite-400 font-medium">
              Atlikums
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[26px] font-semibold tabular text-graphite-900 leading-none">
                {item.stock}
              </span>
              <StockStatusBadge stock={item.stock} />
            </div>
          </div>
        </div>

        {/* Action panel — quick +/− buttons + manual input.
            Kept compact per user instruction (only image + info
            should grow, not the action controls). */}
        <div className="lg:shrink-0 lg:min-w-[280px] lg:border-l lg:border-graphite-200/70 lg:pl-5">
          <InventoryActionPanel
            item={item}
            section={section}
            onChange={onStockChange}
          />
        </div>

        {/* Edit / Delete — icon-only on lg+ */}
        <div className="flex gap-0.5 lg:shrink-0 lg:flex-col lg:gap-1">
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
    </Card>
  );
}

/**
 * One column cell in the horizontal card layout — small label
 * on top, value below. Used for Vieta, Vienam gatavam etc.
 */
function DataCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] uppercase tracking-wider text-graphite-400 font-medium truncate">
        {label}
      </span>
      <span
        className={cn(
          "text-[15px] text-graphite-700 truncate",
          mono && "font-mono tabular"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ItemThumbnail({ src }: { src: string }) {
  if (!src) {
    return (
      <div className="h-32 w-32 shrink-0 rounded-lg bg-graphite-100 flex items-center justify-center">
        <ImageIcon className="h-9 w-9 text-graphite-400" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-32 w-32 shrink-0 rounded-lg object-cover bg-graphite-100"
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilePick = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/warehouse/images", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Upload failed: ${res.status}`);
      }
      const { imageUrl: url } = (await res.json()) as { imageUrl: string };
      setImageUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Attēla augšupielāde neizdevās"
      );
    } finally {
      setUploading(false);
      // Clear input so same file can be re-selected after a failure
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
                      {c.emoji} {c.label}
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
            <Label>Bilde</Label>
            <div className="flex gap-2.5 items-start">
              {/* Preview */}
              <div className="h-20 w-20 rounded-lg bg-graphite-100 shrink-0 overflow-hidden flex items-center justify-center">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.3";
                    }}
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-graphite-400" />
                )}
              </div>

              {/* Upload + URL controls */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFilePick(f);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Augšupielādē…
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      {imageUrl ? "Aizvietot bildi" : "Augšupielādēt bildi"}
                    </>
                  )}
                </Button>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="vai ielīmē URL"
                  className="font-mono text-[11.5px] h-8"
                />
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="text-[11px] text-graphite-500 hover:text-red-600 transition-colors"
                  >
                    Noņemt bildi
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10.5px] text-graphite-400 leading-relaxed">
              Bildes glabājas Drive mapē &ldquo;Workmanis_noliktava_attēli&rdquo;.
              Atļauti: JPEG, PNG, WebP, HEIC. Max 5 MB.
            </p>
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
