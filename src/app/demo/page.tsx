"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Boxes,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  X,
  Save,
  MapPin,
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
import { useNetwork } from "@/lib/network-store";
import type { DemoProduct } from "@/lib/network-types";

export default function DemoPage() {
  const { demoProducts, addDemo, updateDemo, deleteDemo } = useNetwork();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DemoProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DemoProduct | null>(null);
  const [toDelete, setToDelete] = useState<DemoProduct | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (d: DemoProduct) => {
    setEditing(d);
    setModalOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Demo produkcija"
          description={`${demoProducts.length} demo vienības · prezentācijām, izstādēm un testiem`}
          actions={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot demo vienību
            </Button>
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="overflow-hidden">
            {demoProducts.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Vēl nav demo vienību"
                description="Pievieno demo produktus, lai sekotu līdzi to atrašanās vietām un stāvoklim."
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
                    <TableHead>Produkta nosaukums</TableHead>
                    <TableHead>Demo testē</TableHead>
                    <TableHead>Atrašanās vieta</TableHead>
                    <TableHead>Komentārs</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence initial={false}>
                    {demoProducts.map((d) => (
                      <motion.tr
                        key={d.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-b border-graphite-100 transition-colors hover:bg-graphite-50/60 cursor-pointer"
                        onClick={() => {
                          setDetail(d);
                          setDetailOpen(true);
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                              <Boxes className="h-3 w-3" />
                            </div>
                            <span className="font-medium text-graphite-900">
                              {d.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-graphite-700 text-[12.5px]">
                          {d.tester ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                              {d.tester}
                            </span>
                          ) : (
                            <span className="text-graphite-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-graphite-600">
                          <div className="flex items-center gap-1.5 text-[12.5px]">
                            <MapPin className="h-3 w-3 text-graphite-400" />
                            <span className="line-clamp-1">{d.location}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-graphite-600 max-w-[320px]">
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
                              <DropdownMenuItem
                                onSelect={() => {
                                  setDetail(d);
                                  setDetailOpen(true);
                                }}
                              >
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

      <DemoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSubmit={(data) => {
          if (editing) updateDemo(editing.id, data);
          else addDemo(data);
          setModalOpen(false);
        }}
      />

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  {detail.location}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                {detail.tester && (
                  <div>
                    <Label className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-medium">
                      Demo testē
                    </Label>
                    <p className="mt-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 border border-violet-100 px-2 py-0.5 text-[12px] font-medium text-violet-700">
                        {detail.tester}
                      </span>
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-medium">
                    Komentārs
                  </Label>
                  <p className="mt-1.5 text-[13px] text-graphite-800 whitespace-pre-wrap">
                    {detail.comment || (
                      <span className="text-graphite-400">Nav komentāra</span>
                    )}
                  </p>
                </div>
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

      {/* Delete */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst demo vienību?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies dzēst{" "}
              <span className="font-medium text-graphite-900">
                {toDelete?.name}
              </span>
              ?
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (toDelete) deleteDemo(toDelete.id);
                setToDelete(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Dzēst
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function DemoModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: DemoProduct | null;
  onSubmit: (data: Omit<DemoProduct, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [tester, setTester] = useState("");
  const [location, setLocation] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTester(editing.tester);
      setLocation(editing.location);
      setComment(editing.comment);
    } else {
      setName("");
      setTester("");
      setLocation("");
      setComment("");
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      tester: tester.trim(),
      location: location.trim(),
      comment: comment.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot demo vienību" : "Jauna demo vienība"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Atjaunini informāciju"
              : "Pievieno jaunu demo vienību izstādēm un prezentācijām"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Produkta nosaukums</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="piem. Mosphera Demo #1"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Demo testē</Label>
            <Input
              value={tester}
              onChange={(e) => setTester(e.target.value)}
              placeholder="piem. Policija, NMPD, Armija, klients…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Atrašanās vieta</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pilsēta, ēka, istaba"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Komentārs</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Stāvoklis, pieejamība, piezīmes…"
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
