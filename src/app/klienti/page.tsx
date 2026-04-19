"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Building2,
  User,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { EmptyState } from "@/components/business/empty-state";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ClientModal } from "@/components/billing/client-modal";
import { useClients } from "@/lib/clients-store";
import { useBilling } from "@/lib/billing-store";
import { summaryForClient } from "@/lib/client-summary";
import { COUNTRIES } from "@/lib/countries";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Client, ClientStatus, ClientType } from "@/lib/billing-types";

export default function KlientiPage() {
  const router = useRouter();
  const { clients, deleteClient } = useClients();
  const { incoming } = useBilling();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ClientType>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);

  const availableCountries = useMemo(() => {
    const codes = new Set(clients.map((c) => c.countryCode));
    return COUNTRIES.filter((c) => codes.has(c.code));
  }, [clients]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (countryFilter !== "all" && c.countryCode !== countryFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          c.name.toLowerCase().includes(q) ||
          c.regNumber?.toLowerCase().includes(q) ||
          c.vatNumber?.toLowerCase().includes(q) ||
          c.keywords.some((k) => k.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [clients, search, typeFilter, countryFilter, statusFilter]);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setModalOpen(true);
  };

  const confirmDelete = () => {
    if (toDelete) {
      deleteClient(toDelete.id);
      setToDelete(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Klienti"
          description={`${clients.length} klientu bāzē · ${clients.filter((c) => c.status === "aktivs").length} aktīvi`}
          actions={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Pievienot klientu
            </Button>
          }
        />

        {/* Search + filters */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center"
        >
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-graphite-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Meklēt pēc nosaukuma, PVN, atslēgvārdiem..."
              className="w-full h-9 rounded-lg border border-graphite-200 bg-white pl-9 pr-3 text-[13px] text-graphite-800 placeholder:text-graphite-400 hover:border-graphite-300 focus:border-graphite-900 focus:outline-none focus:ring-2 focus:ring-graphite-900/5 transition-colors"
            />
          </div>

          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
          >
            <SelectTrigger className="md:w-[170px]">
              <SelectValue placeholder="Tips" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Visi tipi</SelectItem>
              <SelectItem value="juridiska">Juridiska persona</SelectItem>
              <SelectItem value="fiziska">Fiziska persona</SelectItem>
            </SelectContent>
          </Select>

          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="md:w-[170px]">
              <SelectValue placeholder="Valsts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Visas valstis</SelectItem>
              {availableCountries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="md:w-[150px]">
              <SelectValue placeholder="Statuss" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Visi statusi</SelectItem>
              <SelectItem value="aktivs">Aktīvs</SelectItem>
              <SelectItem value="neaktivs">Neaktīvs</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <Card className="overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                icon={User}
                title={
                  clients.length === 0
                    ? "Vēl nav pievienots neviens klients"
                    : "Neviens klients neatbilst filtriem"
                }
                description={
                  clients.length === 0
                    ? "Sāciet savu klientu bāzi, lai varētu izrakstīt rēķinus."
                    : "Mēģiniet mainīt filtrus vai meklēšanas vaicājumu."
                }
                action={
                  clients.length === 0 ? (
                    <Button size="sm" onClick={openNew}>
                      <Plus className="h-3.5 w-3.5" />
                      Pievienot pirmo klientu
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nosaukums / Vārds</TableHead>
                    <TableHead>Tips</TableHead>
                    <TableHead>Reģ. nr.</TableHead>
                    <TableHead>PVN nr.</TableHead>
                    <TableHead>Valsts</TableHead>
                    <TableHead>Pēdējais rēķins</TableHead>
                    <TableHead className="text-right">Apgrozījums</TableHead>
                    <TableHead>Statuss</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const summary = summaryForClient(c, incoming);
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/klienti/${c.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-soft-xs",
                                c.type === "juridiska"
                                  ? "bg-graphite-900"
                                  : "bg-sky-600"
                              )}
                            >
                              {c.type === "juridiska" ? (
                                <Building2 className="h-3.5 w-3.5" />
                              ) : (
                                <User className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-graphite-900 truncate">
                                {c.name}
                              </p>
                              {c.keywords.length > 0 && (
                                <p className="text-[11px] text-graphite-400 truncate max-w-[200px]">
                                  {c.keywords.slice(0, 3).map((k) => `#${k}`).join(" ")}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">
                            {c.type === "juridiska" ? "Juridiska" : "Fiziska"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11.5px] text-graphite-600">
                          {c.regNumber ?? (
                            <span className="text-graphite-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-[11.5px] text-graphite-600">
                          {c.vatNumber ?? (
                            <span className="text-graphite-300">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-semibold bg-graphite-100 text-graphite-700 rounded px-1.5 py-0.5">
                              {c.countryCode}
                            </span>
                            <span className="text-graphite-600 text-[12.5px]">
                              {c.country}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-graphite-600 tabular text-[12.5px]">
                          {summary.lastInvoiceDate ? (
                            formatDate(summary.lastInvoiceDate)
                          ) : (
                            <span className="text-graphite-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-graphite-900 tabular">
                          {summary.totalRevenue > 0 ? (
                            formatCurrency(summary.totalRevenue)
                          ) : (
                            <span className="text-graphite-300">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.status === "aktivs" ? (
                            <Badge variant="success" className="gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Aktīvs
                            </Badge>
                          ) : (
                            <Badge variant="muted" className="gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-graphite-400" />
                              Neaktīvs
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/klienti/${c.id}`}>
                                  <Eye className="h-3.5 w-3.5" />
                                  Atvērt
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openEdit(c)}>
                                <Pencil className="h-3.5 w-3.5" />
                                Rediģēt
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Create / edit modal */}
      <ClientModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
      />

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dzēst klientu?</DialogTitle>
            <DialogDescription>
              Vai tiešām vēlies neatgriezeniski dzēst{" "}
              <span className="font-medium text-graphite-900">
                {toDelete?.name}
              </span>
              ? Saistītie rēķini un paraugi saglabāsies, bet zaudēs klienta
              profilu.
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
