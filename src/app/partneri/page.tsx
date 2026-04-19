"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Factory,
  Truck,
  Wrench,
  Package,
  Link2,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  X,
  Save,
  Mail,
  Phone,
  ExternalLink,
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
  OnlineLink,
} from "@/lib/network-types";
import { cn } from "@/lib/utils";

type TabKey = BusinessContactCategory | "online_linki";

const contactTabs: {
  key: BusinessContactCategory;
  label: string;
  icon: LucideIcon;
  emptyDesc: string;
}[] = [
  {
    key: "razotaji",
    label: "Ražotāji",
    icon: Factory,
    emptyDesc: "Uzņēmumi, kas ražo sastāvdaļas vai gatavus produktus.",
  },
  {
    key: "piegadataji",
    label: "Piegādātāji",
    icon: Package,
    emptyDesc: "Uzņēmumi, kas piegādā izejvielas vai preces.",
  },
  {
    key: "pakalpojumi",
    label: "Pakalpojumi",
    icon: Wrench,
    emptyDesc: "Pakalpojumu sniedzēji — IT, mārketings, finanses, apkope.",
  },
  {
    key: "logistika",
    label: "Loģistika",
    icon: Truck,
    emptyDesc: "Kravu pārvadāšana, noliktavas, muitas aģenti.",
  },
];

const categoryLabels: Record<BusinessContactCategory, string> = {
  razotaji: "Ražotājs",
  piegadataji: "Piegādātājs",
  pakalpojumi: "Pakalpojums",
  logistika: "Loģistika",
};

export default function PartneriPage() {
  const {
    contactsByCategory,
    addContact,
    updateContact,
    deleteContact,
    onlineLinks,
    addOnlineLink,
    updateOnlineLink,
    deleteOnlineLink,
  } = useNetwork();

  const [tab, setTab] = useState<TabKey>("razotaji");

  // Contact state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<BusinessContact | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<BusinessContact | null>(null);
  const [toDeleteContact, setToDeleteContact] =
    useState<BusinessContact | null>(null);

  // Online link state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<OnlineLink | null>(null);
  const [toDeleteLink, setToDeleteLink] = useState<OnlineLink | null>(null);

  const isOnlineLinks = tab === "online_linki";
  const currentContactTab = contactTabs.find((t) => t.key === tab);
  const contactItems = currentContactTab
    ? contactsByCategory(currentContactTab.key)
    : [];

  const openNewEntry = () => {
    if (isOnlineLinks) {
      setEditingLink(null);
      setLinkModalOpen(true);
    } else {
      setEditingContact(null);
      setContactModalOpen(true);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Partneri / Piegādātāji / Servisi"
          description="Biznesa kontaktu vienots reģistrs"
          actions={
            <Button size="sm" onClick={openNewEntry}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot
            </Button>
          }
        />

        {/* Segmented tabs — 5 of them */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div
            role="tablist"
            className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50"
          >
            {contactTabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              const count = contactsByCategory(t.key).length;
              return (
                <TabButton
                  key={t.key}
                  isActive={isActive}
                  onClick={() => setTab(t.key)}
                  icon={Icon}
                  label={t.label}
                  count={count}
                />
              );
            })}
            <TabButton
              isActive={tab === "online_linki"}
              onClick={() => setTab("online_linki")}
              icon={Link2}
              label="Online linki"
              count={onlineLinks.length}
            />
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {isOnlineLinks ? (
              <OnlineLinksTable
                links={onlineLinks}
                onNew={() => {
                  setEditingLink(null);
                  setLinkModalOpen(true);
                }}
                onEdit={(link) => {
                  setEditingLink(link);
                  setLinkModalOpen(true);
                }}
                onDelete={(link) => setToDeleteLink(link)}
              />
            ) : (
              <ContactsTable
                items={contactItems}
                currentTab={currentContactTab!}
                onNew={openNewEntry}
                onOpen={(c) => {
                  setDetail(c);
                  setDetailOpen(true);
                }}
                onEdit={(c) => {
                  setEditingContact(c);
                  setContactModalOpen(true);
                }}
                onDelete={(c) => setToDeleteContact(c)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Contact modal */}
      <ContactModal
        open={contactModalOpen}
        onOpenChange={setContactModalOpen}
        editing={editingContact}
        defaultCategory={
          isOnlineLinks ? "razotaji" : (tab as BusinessContactCategory)
        }
        onSubmit={(data) => {
          if (editingContact) updateContact(editingContact.id, data);
          else addContact(data);
          setContactModalOpen(false);
        }}
      />

      {/* Online link modal */}
      <OnlineLinkModal
        open={linkModalOpen}
        onOpenChange={setLinkModalOpen}
        editing={editingLink}
        onSubmit={(data) => {
          if (editingLink) updateOnlineLink(editingLink.id, data);
          else addOnlineLink(data);
          setLinkModalOpen(false);
        }}
      />

      {/* Contact detail */}
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
                    setEditingContact(detail);
                    setContactModalOpen(true);
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

      {/* Delete contact */}
      <Dialog
        open={!!toDeleteContact}
        onOpenChange={(o) => !o && setToDeleteContact(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst ierakstu?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies dzēst{" "}
              <span className="font-medium text-graphite-900">
                {toDeleteContact?.name}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToDeleteContact(null)}
            >
              Atcelt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (toDeleteContact) deleteContact(toDeleteContact.id);
                setToDeleteContact(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Dzēst
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete online link */}
      <Dialog
        open={!!toDeleteLink}
        onOpenChange={(o) => !o && setToDeleteLink(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst saiti?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies dzēst saiti{" "}
              <span className="font-medium text-graphite-900">
                {toDeleteLink?.productName}
              </span>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setToDeleteLink(null)}
            >
              Atcelt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (toDeleteLink) deleteOnlineLink(toDeleteLink.id);
                setToDeleteLink(null);
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

// ============================================================
// Tab button
// ============================================================

function TabButton({
  isActive,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  isActive: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
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
        {label}
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
}

// ============================================================
// Contacts table (used for Ražotāji / Piegādātāji / Pakalpojumi / Loģistika)
// ============================================================

function ContactsTable({
  items,
  currentTab,
  onNew,
  onOpen,
  onEdit,
  onDelete,
}: {
  items: BusinessContact[];
  currentTab: { key: BusinessContactCategory; label: string; icon: LucideIcon; emptyDesc: string };
  onNew: () => void;
  onOpen: (c: BusinessContact) => void;
  onEdit: (c: BusinessContact) => void;
  onDelete: (c: BusinessContact) => void;
}) {
  const Icon = currentTab.icon;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Icon}
          title={`Nav pievienots neviens ${categoryLabels[currentTab.key].toLowerCase()}`}
          description={currentTab.emptyDesc}
          action={
            <Button size="sm" onClick={onNew}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Nosaukums</TableHead>
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
            {items.map((c) => (
              <motion.tr
                key={c.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="border-b border-graphite-100 transition-colors hover:bg-graphite-50/60 cursor-pointer"
                onClick={() => onOpen(c)}
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
                  <CountryLabel code={c.countryCode} />
                </TableCell>
                <TableCell className="text-graphite-700 text-[12.5px]">
                  {c.contactPerson || (
                    <span className="text-graphite-300">—</span>
                  )}
                </TableCell>
                <TableCell className="text-graphite-600 text-[12px]">
                  {c.email || <span className="text-graphite-300">—</span>}
                </TableCell>
                <TableCell className="text-graphite-600 text-[12px] tabular">
                  {c.phone || <span className="text-graphite-300">—</span>}
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
                      <DropdownMenuItem onSelect={() => onOpen(c)}>
                        <Eye className="h-3.5 w-3.5" />
                        Atvērt
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Labot
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onSelect={() => onDelete(c)}
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
    </Card>
  );
}

// ============================================================
// Online Links table — only 3 columns: product, link, comment
// ============================================================

function OnlineLinksTable({
  links,
  onNew,
  onEdit,
  onDelete,
}: {
  links: OnlineLink[];
  onNew: () => void;
  onEdit: (l: OnlineLink) => void;
  onDelete: (l: OnlineLink) => void;
}) {
  if (links.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Link2}
          title="Nav pievienota neviena saite"
          description="Saglabā noderīgas saites uz preču lapām — AliExpress, eBay, Alibaba u.c."
          action={
            <Button size="sm" onClick={onNew}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Nosaukums preces</TableHead>
            <TableHead>Links</TableHead>
            <TableHead>Komentārs</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {links.map((l) => (
              <motion.tr
                key={l.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="border-b border-graphite-100 transition-colors hover:bg-graphite-50/60"
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-graphite-50 text-graphite-700 border border-graphite-100">
                      <Link2 className="h-3 w-3" />
                    </div>
                    <span className="font-medium text-graphite-900">
                      {l.productName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[320px]">
                  {l.url ? (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[12.5px] text-sky-600 hover:text-sky-800 hover:underline truncate max-w-full"
                    >
                      <span className="truncate">{l.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ) : (
                    <span className="text-graphite-300">—</span>
                  )}
                </TableCell>
                <TableCell className="text-graphite-600 max-w-[280px]">
                  <span className="line-clamp-1 text-[12.5px]">
                    {l.comment || <span className="text-graphite-300">—</span>}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Labot
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-700"
                        onSelect={() => onDelete(l)}
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
    </Card>
  );
}

// ============================================================
// Business contact modal (shared across 4 contact categories)
// ============================================================

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
            <div className="inline-flex items-center rounded-lg bg-graphite-100 p-1 border border-graphite-200/50 flex-wrap">
              {contactTabs.map((t) => (
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

// ============================================================
// Online link modal (3 fields only)
// ============================================================

function OnlineLinkModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: OnlineLink | null;
  onSubmit: (data: Omit<OnlineLink, "id" | "createdAt">) => void;
}) {
  const [productName, setProductName] = useState("");
  const [url, setUrl] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setProductName(editing.productName);
      setUrl(editing.url);
      setComment(editing.comment);
    } else {
      setProductName("");
      setUrl("");
      setComment("");
    }
  }, [open, editing]);

  const submit = () => {
    if (!productName.trim()) return;
    onSubmit({
      productName: productName.trim(),
      url: url.trim(),
      comment: comment.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot saiti" : "Jauna online saite"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Atjaunini informāciju par saiti"
              : "Pievieno saiti uz preces lapu vai piegādātāju"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nosaukums preces</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="piem. Mosphera LiPo battery 72V"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Links</Label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="font-mono text-[12px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Komentārs</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Īss apraksts — kāpēc saglabāts, kāds konteksts…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!productName.trim()}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================

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
