"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Check,
  Plus,
  Users,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Trash2,
  MoreHorizontal,
  Briefcase,
  Landmark,
  HeartPulse,
  ShieldCheck,
  Phone,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/business/empty-state";
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
import { SalaryStatusBadge } from "@/components/business/billing-status-badges";
import { useBilling } from "@/lib/billing-store";
import type { SalaryType } from "@/lib/billing-store";
import {
  useEmployees,
  fullName,
  initials,
  contractTypeLabel,
  statusLabel,
  isOVPOverdue,
  isSafetyOverdue,
  type Employee,
} from "@/lib/employees-store";
import { EmployeeModal } from "./employee-modal";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

type SubTab = "darbinieki" | "maksajumi";

export function AlgasTab() {
  const [subTab, setSubTab] = useState<SubTab>("darbinieki");

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-graphite-100 p-1 border border-graphite-200/50">
        <SubTabButton
          isActive={subTab === "darbinieki"}
          onClick={() => setSubTab("darbinieki")}
          icon={Users}
          label="Darbinieki"
        />
        <SubTabButton
          isActive={subTab === "maksajumi"}
          onClick={() => setSubTab("maksajumi")}
          icon={Wallet}
          label="Algu maksājumi"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {subTab === "darbinieki" ? <DarbiniekiSection /> : <MaksajumiSection />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Sub-tab button
// ============================================================

function SubTabButton({
  isActive,
  onClick,
  icon: Icon,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-selected={isActive}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors whitespace-nowrap",
        isActive
          ? "text-graphite-900"
          : "text-graphite-500 hover:text-graphite-700"
      )}
    >
      {isActive && (
        <motion.span
          layoutId="algas-subtabs-pill"
          className="absolute inset-0 rounded-lg bg-white shadow-soft-xs border border-graphite-200/40"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {label}
      </span>
    </button>
  );
}

// ============================================================
// Darbinieki section — employee cards
// ============================================================

function DarbiniekiSection() {
  const { employees, addEmployee, updateEmployee, deleteEmployee } =
    useEmployees();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setModalOpen(true);
  };

  // Compliance counters
  const ovpOverdueCount = employees.filter((e) => isOVPOverdue(e.ovp)).length;
  const safetyOverdueCount = employees.filter((e) =>
    isSafetyOverdue(e.safetyBriefing)
  ).length;

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Darbinieku reģistrs
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {employees.length} darbinieki
            {ovpOverdueCount + safetyOverdueCount > 0 && (
              <>
                {" · "}
                <span className="text-amber-700 font-medium">
                  {ovpOverdueCount + safetyOverdueCount} ar nokavētiem termiņiem
                </span>
              </>
            )}
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Pievienot darbinieku
        </Button>
      </div>

      {/* Cards grid */}
      {employees.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Vēl nav darbinieku"
            description="Pievieno pirmo darbinieku, lai sāktu pārvaldīt līgumus, bankas kontus un drošības pārbaudes."
            action={
              <Button size="sm" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" />
                Pievienot darbinieku
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {employees.map((e) => (
            <EmployeeCard
              key={e.id}
              employee={e}
              onEdit={() => openEdit(e)}
              onDelete={() => setToDelete(e)}
            />
          ))}
        </div>
      )}

      {/* Add/edit modal */}
      <EmployeeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editing={editing}
        onSubmit={(data) => {
          if (editing) updateEmployee(editing.id, data);
          else addEmployee(data);
          setModalOpen(false);
        }}
      />

      {/* Delete confirmation */}
      <DeleteEmployeeDialog
        employee={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteEmployee(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}

// ============================================================
// Employee card
// ============================================================

function EmployeeCard({
  employee,
  onEdit,
  onDelete,
}: {
  employee: Employee;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ovpOverdue = isOVPOverdue(employee.ovp);
  const safetyOverdue = isSafetyOverdue(employee.safetyBriefing);
  const primaryBank = employee.bankAccounts.find((b) => b.isPrimary);
  const activeContract = employee.contracts[0];

  return (
    <Card className="p-4 flex flex-col gap-3 transition-all hover:shadow-soft-sm hover:border-graphite-300">
      {/* Header: avatar + name + actions */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-graphite-900 text-white text-[13px] font-semibold tracking-tight shadow-soft-xs">
          {initials(employee)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-graphite-900 truncate leading-tight">
            {fullName(employee)}
          </p>
          {employee.position && (
            <p className="text-[11.5px] text-graphite-500 truncate mt-0.5">
              {employee.position}
            </p>
          )}
          <div className="mt-1.5">
            <StatusPill status={employee.status} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Labot
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-700"
              onSelect={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Dzēst
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Contact */}
      {(employee.email || employee.phone) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-graphite-600">
          {employee.email && (
            <span className="inline-flex items-center gap-1 truncate max-w-full">
              <Mail className="h-3 w-3 text-graphite-400 shrink-0" />
              <span className="truncate">{employee.email}</span>
            </span>
          )}
          {employee.phone && (
            <span className="inline-flex items-center gap-1 tabular">
              <Phone className="h-3 w-3 text-graphite-400 shrink-0" />
              {employee.phone}
            </span>
          )}
        </div>
      )}

      {/* Compliance */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-graphite-100">
        <ComplianceChip
          label="OVP"
          icon={HeartPulse}
          passed={employee.ovp.passed && !ovpOverdue}
          overdue={ovpOverdue}
          dueDate={employee.ovp.nextDueDate}
        />
        <ComplianceChip
          label="DDI"
          icon={ShieldCheck}
          passed={employee.safetyBriefing.passed && !safetyOverdue}
          overdue={safetyOverdue}
          dueDate={employee.safetyBriefing.nextDueDate}
        />
      </div>

      {/* Records summary */}
      <div className="space-y-1.5 pt-3 border-t border-graphite-100 text-[11.5px]">
        <RecordRow
          icon={Briefcase}
          label={
            activeContract
              ? `${contractTypeLabel(activeContract.type)} · ${activeContract.number}`
              : "Nav aktīva līguma"
          }
          empty={!activeContract}
        />
        <RecordRow
          icon={Landmark}
          label={
            primaryBank
              ? `${primaryBank.bankName} · ${primaryBank.iban}`
              : "Nav pievienots bankas konts"
          }
          empty={!primaryBank}
          mono={!!primaryBank}
        />
      </div>
    </Card>
  );
}

// ============================================================
// Sub-pieces
// ============================================================

function StatusPill({ status }: { status: Employee["status"] }) {
  if (status === "aktivs") {
    return (
      <Badge variant="success" className="gap-1 text-[10px]">
        <span className="h-1 w-1 rounded-full bg-emerald-500" />
        Aktīvs
      </Badge>
    );
  }
  if (status === "atvaļinājumā") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 text-[10px] font-semibold">
        <span className="h-1 w-1 rounded-full bg-sky-500" />
        Atvaļinājumā
      </span>
    );
  }
  return (
    <Badge variant="muted" className="gap-1 text-[10px]">
      <span className="h-1 w-1 rounded-full bg-graphite-400" />
      Atlaists
    </Badge>
  );
}

function ComplianceChip({
  label,
  icon: Icon,
  passed,
  overdue,
  dueDate,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  passed: boolean;
  overdue: boolean;
  dueDate?: string;
}) {
  let toneClass = "bg-graphite-50 border-graphite-100 text-graphite-600";
  let icon = passed && !overdue ? CheckCircle2 : AlertTriangle;
  if (passed && !overdue) {
    toneClass = "bg-emerald-50 border-emerald-100 text-emerald-700";
  } else if (overdue) {
    toneClass = "bg-red-50 border-red-100 text-red-700";
  } else {
    toneClass = "bg-amber-50 border-amber-100 text-amber-700";
  }
  const StatusIcon = icon;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1.5",
        toneClass
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[10.5px] font-semibold">
          {label}
          <StatusIcon className="h-2.5 w-2.5 inline ml-0.5 -mt-0.5" />
        </span>
        <span className="text-[9.5px] opacity-80 tabular truncate">
          {dueDate ? `līdz ${formatDate(dueDate)}` : "nav datu"}
        </span>
      </div>
    </div>
  );
}

function RecordRow({
  icon: Icon,
  label,
  empty,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  empty: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon
        className={cn(
          "h-3 w-3 shrink-0",
          empty ? "text-graphite-300" : "text-graphite-400"
        )}
      />
      <span
        className={cn(
          "truncate",
          empty ? "italic text-graphite-400" : "text-graphite-700",
          mono && "font-mono text-[11px]"
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================
// Delete dialog
// ============================================================

function DeleteEmployeeDialog({
  employee,
  onClose,
  onConfirm,
}: {
  employee: Employee | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!employee) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-graphite-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="p-5 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-semibold text-graphite-900 mb-1">
          Dzēst darbinieku?
        </h3>
        <p className="text-[12.5px] text-graphite-600">
          Vai tiešām vēlies dzēst darbinieku{" "}
          <span className="font-medium text-graphite-900">
            {fullName(employee)}
          </span>
          ? Visi pievienotie līgumi, bankas konti un atbilstības dati arī tiks
          dzēsti.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Atcelt
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            <Trash2 className="h-3.5 w-3.5" />
            Dzēst
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Maksajumi section — original payments table
// ============================================================

function MaksajumiSection() {
  const { salaries, updateSalary } = useBilling();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const prepared = salaries.filter((s) => s.status === "sagatavots");
  const totalPrepared = prepared.reduce((s, x) => s + x.amount, 0);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const sendToBank = () => {
    if (selected.size > 0) {
      selected.forEach((id) => updateSalary(id, { status: "izmaksats" }));
    } else {
      prepared.forEach((s) => updateSalary(s.id, { status: "izmaksats" }));
    }
    setSelected(new Set());
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-graphite-900">
            Algu maksājumi
          </h3>
          <p className="mt-0.5 text-[12.5px] text-graphite-500">
            {prepared.length > 0
              ? `${prepared.length} sagatavoti · ${formatCurrency(
                  totalPrepared
                )} kopā`
              : "Visi sagatavotie algu maksājumi ir izmaksāti"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={sendToBank}
          disabled={prepared.length === 0}
        >
          <Send className="h-3.5 w-3.5" />
          Sagatavot maksājumu bankā
          {selected.size > 0 && ` (${selected.size})`}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10"></TableHead>
              <TableHead>Darbinieks</TableHead>
              <TableHead className="text-right">Summa</TableHead>
              <TableHead>Periods</TableHead>
              <TableHead>Tips</TableHead>
              <TableHead>Statuss</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaries.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {s.status === "sagatavots" ? (
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
                    />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-graphite-900 text-white text-[10px] font-semibold">
                      {s.employee
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <span className="font-medium text-graphite-900">
                      {s.employee}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-graphite-900 tabular">
                  {formatCurrency(s.amount)}
                </TableCell>
                <TableCell className="text-graphite-600">{s.period}</TableCell>
                <TableCell>
                  <Select
                    value={s.type}
                    onValueChange={(v) =>
                      updateSalary(s.id, { type: v as SalaryType })
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px] text-[12.5px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="darba_alga">Darba alga</SelectItem>
                      <SelectItem value="atvalinajums">Atvaļinājums</SelectItem>
                      <SelectItem value="avansa_norekini">
                        Avansa norēķini
                      </SelectItem>
                      <SelectItem value="piemaksa">Piemaksa</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <SalaryStatusBadge status={s.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
