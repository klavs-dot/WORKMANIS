"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Briefcase,
  Handshake,
  Truck,
  Wrench,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  X,
  Save,
  Mail,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
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
import type {
  BusinessContact,
  BusinessContactCategory,
} from "@/lib/network-types";
import { cn } from "@/lib/utils";

type TabKey = BusinessContactCategory;

const tabs: {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  emptyDesc: string;
}[] = [
  {
    key: "partneri",
    label: "Partneri",
    icon: Handshake,
    emptyDesc: "Pievieno biznesa partnerus — aģentūras, finansētājus, sadarbības.",
  },
  {
    key: "piegadataji",
    label: "Piegādātāji",
    icon: Truck,
    emptyDesc: "Pievieno uzņēmumus, kas piegādā preces vai izejvielas.",
  },
  {
    key: "servisi",
    label: "Servisi",
    icon: Wrench,
    emptyDesc: "Pievieno servisu partnerus — apkope, remonts, profilakse.",
  },
];

const categoryLabels: Record<BusinessContactCategory, string> = {
  partneri: "Partneris",
  piegadataji: "Piegādātājs",
  servisi: "Serviss",
};

export default function PartneriPage() {
  const { contactsByCategory, addContact, updateContact, deleteContact } =
    useNetwork();

  const [tab, setTab] = useState<TabKey>("partneri");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessContact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<BusinessContact | null>(null);
  const [toDelete, setToDelete] = useState<BusinessContact | null>(null);

  const items = contactsByCategory(tab);
  const currentTab = tabs.find((t) => t.key === tab)!;

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (c: BusinessContact) => {
    setEditing(c);
    setModalOpen(true);
  };

  const openDetail = (c: BusinessContact) => {
    setDetail(c);
    setDetailOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Partneri / Piegādātāji / Servisi"
          description="Biznesa kontaktu vienots reģistrs"
          actions={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot
            </Button>
          }
        />

        {/* Segmented tabs */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div
            role="tablist"
            className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              const count = contactsByCategory(t.key).length;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors whitespace-nowrap focus:outline-none",
                    isActive
                      ? "text-graphite-900"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="partneri-tabs-pill"
                      className="absolute inset-0 rounded-lg bg-white shadow-soft-xs border border-graphite-200/40"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {t.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular",
                          isActive
                            ? "bg-graphite-900 text-white"
                            : "bg-graphite-200/70 text-graphite-600"
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="overflow-hidden">
              {items.length === 0 ? (
                <EmptyState
                  icon={currentTab.icon}
                  title={`Nav pievienots neviens ${categoryLabels[tab].toLowerCase()}`}
                  description={currentTab.emptyDesc}
                  action={
                    <Button size="sm" onClick={openNew}>
                      <Plus className="h-3.5 w-3.5" />
                      Pievienot
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Nosaukums</TableHead>
                      <TableHead>Kategorija</TableHead>
                      <TableHead>Valsts</TableHead>
                      <TableHead>Kontaktpersona</TableHead>
                      <TableHead>E-pasts</TableHead>
                      <TableHead>Telefons</TableHead>
                      <TableHead>Komentārs</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {items.map((c) => {
                        const Icon = currentTab.icon;
                        return (
                          <motion.tr
                            key={c.id}
                            layout
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="border-b border-graphite-100 transition-colors hover:bg-graphite-50/60 cursor-pointer"
                            onClick={() => openDetail(c)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                                  <Icon className="h-3 w-3" />
                                </div>
                                <span className="font-medium text-graphite-900">
                                  {c.name}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="muted">
                                {categoryLabels[c.category]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <CountryLabel code={c.countryCode} />
                            </TableCell>
                            <TableCell className="text-graphite-700 text-[12.5px]">
                              {c.contactPerson || (
                                <span className="text-graphite-300">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-graphite-600 text-[12px]">
                              {c.email || (
                                <span className="text-graphite-300">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-graphite-600 text-[12px] tabular">
                              {c.phone || (
                                <span className="text-graphite-300">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-graphite-600 max-w-[220px]">
                              <span className="line-clamp-1 text-[12px]">
                                {c.comment || (
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
                                    onSelect={() => openDetail(c)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    Atvērt
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => openEdit(c)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Labot
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-700"
                                    onSelect={() => setToDelete(c)}
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
              )}
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <ContactModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        defaultCategory={tab}
        onSubmit={(data) => {
          if (editing) updateContact(editing.id, data);
          else addContact(data);
          setModalOpen(false);
        }}
      />

      {/* Detail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="muted">
                    {categoryLabels[detail.category]}
                  </Badge>
                  <CountryLabel code={detail.countryCode} />
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <DetailField label="Adrese" value={detail.address} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <DetailField
                    label="Kontaktpersona"
                    value={detail.contactPerson}
                  />
                  <DetailField
                    label="E-pasts"
                    value={detail.email}
                    icon={Mail}
                  />
                  <DetailField
                    label="Telefons"
                    value={detail.phone}
                    icon={Phone}
                  />
                </div>
                <DetailField label="Komentārs" value={detail.comment} />
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

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst ierakstu?</DialogTitle>
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
                if (toDelete) deleteContact(toDelete.id);
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

function ContactModal({
  open,
  onOpenChange,
  editing,
  defaultCategory,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: BusinessContact | null;
  defaultCategory: BusinessContactCategory;
  onSubmit: (data: Omit<BusinessContact, "id" | "createdAt">) => void;
}) {
  const [category, setCategory] =
    useState<BusinessContactCategory>(defaultCategory);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("LV");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCategory(editing.category);
      setName(editing.name);
      setCountryCode(editing.countryCode);
      setAddress(editing.address);
      setContactPerson(editing.contactPerson);
      setEmail(editing.email);
      setPhone(editing.phone);
      setComment(editing.comment);
    } else {
      setCategory(defaultCategory);
      setName("");
      setCountryCode("LV");
      setAddress("");
      setContactPerson("");
      setEmail("");
      setPhone("");
      setComment("");
    }
  }, [open, editing, defaultCategory]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      category,
      name: name.trim(),
      countryCode,
      address: address.trim(),
      contactPerson: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
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
            Pievieno biznesa kontaktu kopējā reģistrā
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Kategorija</Label>
            <div className="inline-flex items-center rounded-lg bg-graphite-100 p-1 border border-graphite-200/50">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setCategory(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors",
                    category === t.key
                      ? "bg-white text-graphite-900 shadow-soft-xs"
                      : "text-graphite-500 hover:text-graphite-700"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nosaukums</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Uzņēmuma nosaukums"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valsts</Label>
              <CountrySelect value={countryCode} onChange={setCountryCode} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Adrese</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Iela, pilsēta, pasta indekss"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kontaktpersona</Label>
              <Input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Vārds Uzvārds"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefons</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+371 00 000 000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>E-pasts</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Komentārs</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Īss apraksts, līgumu nosacījumi, specializācija…"
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
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div>
      <Label className="text-[10.5px] uppercase tracking-wider text-graphite-500 font-medium flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-graphite-400" />}
        {label}
      </Label>
      <p className="mt-1.5 text-[13px] text-graphite-800 whitespace-pre-wrap">
        {value || <span className="text-graphite-400">—</span>}
      </p>
    </div>
  );
}
