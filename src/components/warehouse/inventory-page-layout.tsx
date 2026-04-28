"use client";

/**
 * InventoryPageLayout — the shared frame used by /noliktava, /demo,
 * and /gatava-produkcija. Each of those three pages picks a section
 * (inventory / demo-production / finished-production), passes the
 * matching items array, and gets a fully-wired UI with:
 *   - search box
 *   - sort dropdown (name / low stock)
 *   - optional category tabs (only for /noliktava)
 *   - "Pievienot preci" button + form modal
 *   - card grid (mobile-friendly)
 *   - stock-change confirmation flow
 *   - delete confirmation flow
 *   - empty state when nothing matches
 *
 * Why a single layout component: the three pages would otherwise be
 * 95% duplicated. A shared layout means a UX tweak happens in one
 * place and applies to all three sections.
 */

import { useMemo, useState } from "react";
import { Plus, Search, ArrowDownAZ, ArrowDown01 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  InventoryCard,
  InventoryFormModal,
  InventoryEmptyState,
  ConfirmDialog,
  WarehouseBackground,
} from "./warehouse-components";
import {
  WAREHOUSE_CATEGORIES,
  type WarehouseCategoryId,
} from "@/lib/warehouse-schema";
import {
  useWarehouse,
  type InventoryItem,
  type StockChangeAction,
  type WarehouseSection,
} from "@/lib/warehouse-store";

type SortMode = "name" | "low-stock";

interface PendingStockChange {
  itemId: string;
  itemName: string;
  action: StockChangeAction;
  amount: number;
}

export function InventoryPageLayout({
  title,
  description,
  section,
  items,
  showCategoryTabs,
}: {
  title: string;
  description: string;
  section: WarehouseSection;
  items: InventoryItem[];
  showCategoryTabs: boolean;
}) {
  const { loading, createItem, updateItem, deleteItem, changeStock } =
    useWarehouse();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [category, setCategory] = useState<WarehouseCategoryId | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [pendingStock, setPendingStock] = useState<PendingStockChange | null>(
    null
  );

  // ---------- Filter + sort ----------
  const visibleItems = useMemo(() => {
    let result = items;

    if (showCategoryTabs && category !== "all") {
      result = result.filter((i) => i.category === category);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.supplier.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q)
      );
    }

    if (sort === "name") {
      result = [...result].sort((a, b) =>
        a.name.localeCompare(b.name, "lv")
      );
    } else {
      // Low stock first
      result = [...result].sort((a, b) => a.stock - b.stock);
    }

    return result;
  }, [items, search, sort, category, showCategoryTabs]);

  // ---------- Handlers ----------

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setFormOpen(true);
  };

  const submitForm = (data: {
    category: string;
    imageUrl: string;
    name: string;
    supplier: string;
    qtyPerUnit: number;
    location: string;
    stock: number;
    notes: string;
  }) => {
    if (editing) {
      void updateItem(section, editing.id, data);
    } else {
      void createItem(section, data);
    }
    setFormOpen(false);
  };

  const onStockChangeRequest = (
    sec: WarehouseSection,
    itemId: string,
    action: StockChangeAction,
    amount: number
  ) => {
    const item = items.find((i) => i.id === itemId);
    setPendingStock({
      itemId,
      itemName: item?.name ?? "",
      action,
      amount,
    });
  };

  const confirmStockChange = () => {
    if (!pendingStock) return;
    void changeStock({
      section,
      itemId: pendingStock.itemId,
      action: pendingStock.action,
      amount: pendingStock.amount,
    });
    setPendingStock(null);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    void deleteItem(section, pendingDelete.id);
    setPendingDelete(null);
  };

  // ---------- Render ----------

  return (
    <AppShell>
      <WarehouseBackground />

      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openNew} size="sm">
            <Plus className="h-3.5 w-3.5" />
            Pievienot preci
          </Button>
        }
      />

      {/* Toolbar: search + sort + count */}
      <Card className="bg-white/85 backdrop-blur-sm">
        <div className="p-3 flex flex-col md:flex-row gap-2.5 md:items-center md:justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-graphite-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Meklēt pēc nosaukuma, piegādātāja vai vietas"
                className="pl-8 h-9 text-[12.5px]"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {sort === "name" ? (
                    <>
                      <ArrowDownAZ className="h-3.5 w-3.5" />
                      Pēc nosaukuma
                    </>
                  ) : (
                    <>
                      <ArrowDown01 className="h-3.5 w-3.5" />
                      Pēc atlikuma
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSort("name")}>
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                  Pēc nosaukuma
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort("low-stock")}>
                  <ArrowDown01 className="h-3.5 w-3.5" />
                  Pēc atlikuma (zemākais pirmais)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-[11.5px] text-graphite-500 shrink-0">
            <span className="font-mono font-semibold text-graphite-900">
              {visibleItems.length}
            </span>{" "}
            no {items.length}{" "}
            {items.length === 1 ? "preces" : "precēm"}
          </div>
        </div>

        {showCategoryTabs && (
          <div className="px-3 pb-3 flex gap-1.5 overflow-x-auto items-center">
            {/* 'Visas' chip — explicitly larger per user request,
                no stock-alert ring (it shows everything, would
                always be alarming if anything anywhere is low). */}
            <CategoryChip
              active={category === "all"}
              onClick={() => setCategory("all")}
              size="lg"
            >
              Visas ({items.length})
            </CategoryChip>
            {WAREHOUSE_CATEGORIES.map((c) => {
              const itemsInCat = items.filter((i) => i.category === c.id);
              const count = itemsInCat.length;
              // Compute the worst stock state in this category — that
              // determines the chip's alert ring color. 'out' (any item
              // at zero) wins over 'low' (any 1-2) wins over neither.
              const hasZero = itemsInCat.some((i) => i.stock <= 0);
              const hasLow = itemsInCat.some(
                (i) => i.stock > 0 && i.stock <= 2
              );
              const alert: "out" | "low" | undefined = hasZero
                ? "out"
                : hasLow
                  ? "low"
                  : undefined;
              return (
                <CategoryChip
                  key={c.id}
                  active={category === c.id}
                  onClick={() => setCategory(c.id)}
                  alert={alert}
                  size="lg"
                >
                  {c.emoji} {c.label} ({count})
                </CategoryChip>
              );
            })}
          </div>
        )}
      </Card>

      {/* Results */}
      {loading ? (
        <Card className="bg-white/85 backdrop-blur-sm">
          <div className="p-12 text-center text-[13px] text-graphite-500">
            Ielādē…
          </div>
        </Card>
      ) : visibleItems.length === 0 ? (
        items.length === 0 ? (
          <InventoryEmptyState onAddFirst={openNew} />
        ) : (
          <Card className="bg-white/85 backdrop-blur-sm">
            <div className="p-10 text-center text-[13px] text-graphite-500">
              Šim meklējumam nav rezultātu
            </div>
          </Card>
        )
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              section={section}
              onStockChange={onStockChangeRequest}
              onEdit={openEdit}
              onDelete={(it) => setPendingDelete(it)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <InventoryFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        initialItem={editing}
        showCategory={showCategoryTabs}
        onSubmit={submitForm}
      />

      <ConfirmDialog
        open={pendingStock !== null}
        onOpenChange={(open) => !open && setPendingStock(null)}
        title={
          pendingStock
            ? pendingStock.action === "Paņemts"
              ? `Vai tiešām paņemt ${pendingStock.amount}?`
              : `Vai tiešām nolikt ${pendingStock.amount}?`
            : ""
        }
        description={pendingStock?.itemName ?? undefined}
        onConfirm={confirmStockChange}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Vai tiešām dzēst šo ierakstu?"
        description={pendingDelete?.name ?? undefined}
        confirmLabel="Dzēst"
        destructive
        onConfirm={confirmDelete}
      />
    </AppShell>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
  size = "md",
  alert,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
  /** Surface a stock-alert ring on the chip:
   *    'out' = at least one item in this category is at zero
   *    'low' = at least one item is 1-2 (but none at zero) */
  alert?: "out" | "low";
}) {
  // Build the border/ring style. Active state still wins on bg/text,
  // but the alert ring stays visible so users can scan for trouble
  // even on the chip they've selected.
  const sizeClass =
    size === "lg"
      ? "px-5 py-2 text-[14px]"
      : "px-3 py-1 text-[11.5px]";

  let borderClass: string;
  if (alert === "out") {
    // Solid red ring + soft glow. Reads as 'something is missing'.
    borderClass = active
      ? "bg-graphite-900 text-white border-red-500 ring-2 ring-red-500/40"
      : "bg-red-50 text-red-700 border-red-400 ring-2 ring-red-500/20 hover:border-red-500";
  } else if (alert === "low") {
    // Amber ring — same idea, lower urgency.
    borderClass = active
      ? "bg-graphite-900 text-white border-amber-500 ring-2 ring-amber-500/40"
      : "bg-amber-50 text-amber-800 border-amber-400 ring-2 ring-amber-500/20 hover:border-amber-500";
  } else {
    borderClass = active
      ? "bg-graphite-900 text-white border-graphite-900"
      : "bg-white/60 text-graphite-700 border-graphite-200 hover:border-graphite-300";
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full font-medium whitespace-nowrap transition-colors border",
        sizeClass,
        borderClass
      )}
    >
      {children}
    </button>
  );
}
