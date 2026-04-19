"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Handshake,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  X,
  Save,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CountrySelect,
  CountryLabel,
} from "@/components/ui/country-select";
import { useNetwork } from "@/lib/network-store";
import type { DistributorAgent } from "@/lib/network-types";

export default function DistributoriPage() {
  const { distributors, addDistributor, updateDistributor, deleteDistributor } =
    useNetwork();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DistributorAgent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DistributorAgent | null>(null);
  const [toDelete, setToDelete] = useState<DistributorAgent | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (d: DistributorAgent) => {
    setEditing(d);
    setModalOpen(true);
  };

  const openDetail = (d: DistributorAgent) => {
    setDetail(d);
    setDetailOpen(true);
  };

  const confirmDelete = () => {
    if (toDelete) {
      deleteDistributor(toDelete.id);
      setToDelete(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Distributori & Aģenti"
          description={`${distributors.length} ieraksti · starptautiskie partneri Mosphera un Wolftrike produktiem`}
          actions={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot ierakstu
            </Button>
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="overflow-hidden">
            {distributors.length === 0 ? (
              <EmptyState
                icon={Handshake}
                title="Vēl nav pievienots neviens ieraksts"
                description="Pievieno savus distributorus un aģentus, lai sekotu līdzi to darbībām."
                action={
                  <Button size="sm" onClick={openNew}>
                    <Plus className="h-3.5 w-3.5" />
                    Pievienot pirmo
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nosaukums</TableHead>
                    <TableHead>Valsts</TableHead>
                    <TableHead>Adrese</TableHead>
                    <TableHead>Rekvizīti</TableHead>
                    <TableHead>Komentārs</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence initial={false}>
                    {distributors.map((d) => (
                      <motion.tr
                        key={d.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-b border-graphite-100 transition-colors hover:bg-graphite-50/60 cursor-pointer"
                        onClick={() => openDetail(d)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                              <Handshake className="h-3 w-3" />
                            </div>
                            <span className="font-medium text-graphite-900">
                              {d.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CountryLabel code={d.countryCode} />
                        </TableCell>
                        <TableCell className="text-graphite-600 max-w-[220px]">
                          <span className="line-clamp-1 text-[12.5px]">
                            {d.address}
                          </span>
                        </TableCell>
                        <TableCell className="text-graphite-600 max-w-[200px]">
                          <span className="line-clamp-1 text-[11.5px] font-mono">
                            {d.requisites.split("\n")[0]}
                          </span>
                        </TableCell>
                        <TableCell className="text-graphite-600 max-w-[280px]">
                          <span className="line-clamp-1 text-[12.5px]">
                            {d.comment || (
                              <span className="text-graphite-300">—</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openDetail(d)}>
                                <Eye className="h-3.5 w-3.5" />
                                Atvērt
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openEdit(d)}>
                                <Pencil className="h-3.5 w-3.5" />
                                Labot
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-700"
                                onSelect={() => setToDelete(d)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Dzēst
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Form modal */}
      <DistributorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSubmit={(data) => {
          if (editing) updateDistributor(editing.id, data);
          else addDistributor(data);
          setModalOpen(false);
        }}
      />

      {/* Detail modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>
                  <CountryLabel code={detail.countryCode} />
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <DetailField label="Adrese" value={detail.address} />
                <DetailField
                  label="Pilni rekvizīti"
                  value={detail.requisites}
                  mono
                />
                <DetailField
                  label="Komentārs"
                  value={detail.comment || "—"}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailOpen(false)}
                >
                  Aizvērt
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setDetailOpen(false);
                    openEdit(detail);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Labot
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst ierakstu?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies dzēst{" "}
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
    </AppShell>
  );
}

// ============================================================

function DistributorModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: DistributorAgent | null;
  onSubmit: (data: Omit<DistributorAgent, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [requisites, setRequisites] = useState("");
  const [countryCode, setCountryCode] = useState("LV");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setAddress(editing.address);
      setRequisites(editing.requisites);
      setCountryCode(editing.countryCode);
      setComment(editing.comment);
    } else {
      setName("");
      setAddress("");
      setRequisites("");
      setCountryCode("LV");
      setComment("");
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      address: address.trim(),
      requisites: requisites.trim(),
      countryCode,
      comment: comment.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot ierakstu" : "Jauns ieraksts"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Atjaunini informāciju par distributoru vai aģentu"
              : "Pievieno jaunu distributoru vai aģentu"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nosaukums</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="piem. Nordic Mobility OÜ"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Valsts</Label>
            <CountrySelect value={countryCode} onChange={setCountryCode} />
          </div>

          <div className="space-y-1.5">
            <Label>Adrese</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Iela, pilsēta, pasta indekss"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Pilni rekvizīti</Label>
            <Textarea
              value={requisites}
              onChange={(e) => setRequisites(e.target.value)}
              placeholder={"Reg. nr.\nPVN nr.\nIBAN\nBanka"}
              className="min-h-[100px] font-mono text-[12px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Komentārs</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Līgumu nosacījumi, regioni, īpašas piezīmes…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim()}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-medium">
        {label}
      </Label>
      <p
        className={
          mono
            ? "mt-1.5 text-[12px] text-graphite-800 font-mono whitespace-pre-wrap"
            : "mt-1.5 text-[13px] text-graphite-800 whitespace-pre-wrap"
        }
      >
        {value}
      </p>
    </div>
  );
}
