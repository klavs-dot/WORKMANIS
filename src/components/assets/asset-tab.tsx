"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/business/empty-state";
import { AssetModal } from "./asset-modal";
import { cn } from "@/lib/utils";
import {
  useAssets,
  type Asset,
  type AssetCategory,
  statusLabels,
  statusVariants,
  noteColorClasses,
  displayNote,
} from "@/lib/assets-store";

interface AssetTabProps {
  category: AssetCategory;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}

export function AssetTab({
  category,
  icon: Icon,
  emptyTitle,
  emptyDescription,
}: AssetTabProps) {
  const { getByCategory, deleteAsset } = useAssets();
  const items = getByCategory(category);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [toDelete, setToDelete] = useState<Asset | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setModalOpen(true);
  };

  const confirmDelete = () => {
    if (toDelete) {
      deleteAsset(toDelete.id);
      setToDelete(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with action */}
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-graphite-500">
          {items.length === 0
            ? "Vēl nav pievienots neviens aktīvs"
            : `${items.length} ${items.length === 1 ? "ieraksts" : "ieraksti"}`}
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Pievienot aktīvu
        </Button>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Icon}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <Button size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                Pievienot pirmo
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nosaukums</TableHead>
                  <TableHead>Komentārs</TableHead>
                  <TableHead>Statuss</TableHead>
                  <TableHead>Piezīme</TableHead>
                  <TableHead className="w-[100px] text-right">
                    Darbības
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {items.map((asset) => {
                    const colorCfg = noteColorClasses[asset.noteColor];
                    const today = new Date().toISOString().slice(0, 10);
                    const needsAttention =
                      !!asset.reminderDate && asset.reminderDate <= today;
                    return (
                      <motion.tr
                        key={asset.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className={cn(
                          "border-b border-graphite-100 transition-colors hover:bg-graphite-50/60",
                          // Attention rows: red left border + subtle red wash
                          needsAttention &&
                            "bg-red-50/40 hover:bg-red-50/70 border-l-2 border-l-red-500"
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                                needsAttention
                                  ? "bg-red-50 text-red-600 border-red-100"
                                  : "bg-graphite-50 text-graphite-700 border-graphite-100"
                              )}
                            >
                              {needsAttention ? (
                                <AlertCircle className="h-3 w-3" />
                              ) : (
                                <Icon className="h-3 w-3" />
                              )}
                            </div>
                            <div className="flex flex-col leading-tight">
                              <span className="font-medium text-graphite-900">
                                {asset.name}
                              </span>
                              {needsAttention && asset.reminderDate && (
                                <span className="text-[10.5px] text-red-600 font-medium tabular mt-0.5">
                                  Pievērst uzmanību no{" "}
                                  {formatReminderDate(asset.reminderDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-graphite-600 max-w-[320px]">
                          <span className="line-clamp-1">
                            {asset.comment || (
                              <span className="text-graphite-400">—</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariants[asset.status]}>
                            {statusLabels[asset.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium border max-w-[200px]",
                              colorCfg.bg,
                              colorCfg.text,
                              colorCfg.border
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full shrink-0",
                                colorCfg.dot
                              )}
                            />
                            <span className="truncate">
                              {displayNote(asset.note, asset.noteColor)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEdit(asset)}>
                                <Pencil className="h-3.5 w-3.5" />
                                Labot
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700"
                                onSelect={() => setToDelete(asset)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Dzēst
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </Card>
        </motion.div>
      )}

      {/* Create / edit modal */}
      <AssetModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        category={category}
        editing={editing}
      />

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst aktīvu?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies neatgriezeniski dzēst{" "}
              <span className="font-medium text-graphite-900">
                {toDelete?.name}
              </span>
              ? Šo darbību nevar atsaukt.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToDelete(null)}
            >
              Atcelt
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Dzēst
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Format ISO date (YYYY-MM-DD) into Latvian short form like
 * "20.04.2026" — used for the reminder hint under asset names.
 */
function formatReminderDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
