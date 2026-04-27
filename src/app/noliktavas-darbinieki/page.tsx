"use client";

/**
 * Noliktavas darbinieki — warehouse staff CRUD.
 *
 * Stores email + password + role + active status. NO authentication
 * is wired up yet — this is currently a record-keeping list only.
 * When auth is added later, these records become the credential
 * source for warehouse-employee logins.
 *
 * Per the user's MVP acknowledgement, passwords are stored as plain
 * text in the sheet. When swapping to bcrypt: hash in the API
 * create/update handlers, and add a 'password_hash' column to
 * warehouse-schema (keeping 'password' temporarily for migration,
 * removing after).
 */

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Key, Save, X, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWarehouse, type Employee } from "@/lib/warehouse-store";
import {
  ConfirmDialog,
  WarehouseBackground,
} from "@/components/warehouse/warehouse-components";

const ROLES = [
  "Noliktavas darbinieks",
  "Noliktavas administrators",
] as const;

export default function NoliktavasDarbiniekiPage() {
  const {
    employees,
    loading,
    createEmployee,
    updateEmployee,
    deleteEmployee,
  } = useWarehouse();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setFormOpen(true);
  };

  const onToggleActive = (emp: Employee) => {
    void updateEmployee(emp.id, { active: !emp.active });
  };

  return (
    <AppShell>
      <WarehouseBackground />

      <PageHeader
        title="Noliktavas darbinieki"
        description="Pārvaldi noliktavas darbiniekus un viņu pieejas"
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" />
            Pievienot darbinieku
          </Button>
        }
      />

      {loading ? (
        <Card className="bg-white/85 backdrop-blur-sm">
          <div className="p-12 text-center text-[13px] text-graphite-500">
            Ielādē…
          </div>
        </Card>
      ) : employees.length === 0 ? (
        <Card className="bg-white/85 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-50 text-graphite-400 mb-3">
              <Users className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-[15px] font-medium tracking-tight text-graphite-900">
              Vēl nav pievienots neviens noliktavas darbinieks
            </h3>
            <p className="mt-1 text-[13px] text-graphite-500 max-w-sm">
              Pievieno darbiniekus, lai vēlāk piešķirtu viņiem pieeju
              noliktavas sadaļām
            </p>
            <Button size="sm" onClick={openNew} className="mt-4">
              <Plus className="h-3.5 w-3.5" />
              Pievienot darbinieku
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="bg-white/85 backdrop-blur-sm overflow-hidden">
          <div className="divide-y divide-graphite-100">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="flex flex-col md:flex-row md:items-center gap-3 p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-graphite-900 truncate">
                      {emp.email}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                        emp.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-graphite-50 text-graphite-500 border-graphite-200"
                      )}
                    >
                      {emp.active ? "Aktīvs" : "Neaktīvs"}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-graphite-500 mt-0.5">
                    {emp.role}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleActive(emp)}
                  >
                    {emp.active ? "Deaktivizēt" : "Aktivizēt"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResetTarget(emp)}
                  >
                    <Key className="h-3.5 w-3.5" />
                    Mainīt paroli
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(emp)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPendingDelete(emp)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <EmployeeFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={(data) => {
          if (editing) {
            void updateEmployee(editing.id, data);
          } else {
            void createEmployee(data);
          }
          setFormOpen(false);
        }}
      />

      <PasswordResetModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={(newPassword) => {
          if (resetTarget) {
            void updateEmployee(resetTarget.id, { password: newPassword });
          }
          setResetTarget(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Vai tiešām dzēst šo ierakstu?"
        description={pendingDelete?.email ?? undefined}
        confirmLabel="Dzēst"
        destructive
        onConfirm={() => {
          if (pendingDelete) void deleteEmployee(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </AppShell>
  );
}

// ============================================================
// Employee form modal
// ============================================================

function EmployeeFormModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Employee | null;
  onSubmit: (data: {
    email: string;
    password: string;
    role: string;
    active: boolean;
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("Noliktavas darbinieks");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset on open / when editing target changes
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setEmail(editing.email);
      setPassword(""); // never prefill password — leave empty to indicate no change
      setRole(editing.role);
      setActive(editing.active);
    } else {
      setEmail("");
      setPassword("");
      setRole("Noliktavas darbinieks");
      setActive(true);
    }
    setError(null);
  }, [open, editing]);

  const submit = () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Ievadi korektu e-pastu.");
      return;
    }
    // Password required only on create; on edit it stays whatever it was
    if (!editing && !password.trim()) {
      setError("Ievadi paroli.");
      return;
    }
    const data: {
      email: string;
      password: string;
      role: string;
      active: boolean;
    } = {
      email: email.trim().toLowerCase(),
      password: password,
      role,
      active,
    };
    // On edit with empty password, omit password from update (handled
    // server-side: parseUpdateBody only includes string-typed fields)
    if (editing && !password.trim()) {
      onSubmit({ ...data, password: editing.password });
    } else {
      onSubmit(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot darbinieku" : "Pievienot darbinieku"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Atjaunini darbinieka datus. Paroles maiņa — atstāj tukšu, lai paliek esošā."
              : "Pievieno noliktavas darbinieku ar pieejas akreditāciju."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 mt-1">
          <div className="space-y-1.5">
            <Label>E-pasts</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vards@piemers.lv"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>{editing ? "Jauna parole (atstāj tukšu, lai paliek)" : "Parole"}</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editing ? "•••" : "Pagaidu parole"}
              className="font-mono"
            />
            {!editing && (
              <p className="text-[10.5px] text-graphite-400">
                Parole tiks glabāta vienkāršā formātā līdz pilnvērtīgas
                autentifikācijas integrācijai.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Loma</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {ROLES.map((r) => {
                const selected = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-[12.5px] font-medium text-left transition-colors",
                      selected
                        ? "border-graphite-900 bg-graphite-900 text-white"
                        : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-graphite-300"
            />
            <span className="text-[12.5px] text-graphite-700">Aktīvs</span>
          </label>

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
// Password reset modal
// ============================================================

function PasswordResetModal({
  target,
  onClose,
  onSubmit,
}: {
  target: Employee | null;
  onClose: () => void;
  onSubmit: (newPassword: string) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!pwd.trim()) {
      setError("Ievadi paroli.");
      return;
    }
    onSubmit(pwd);
    setPwd("");
    setError(null);
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setPwd("");
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mainīt paroli</DialogTitle>
          <DialogDescription>
            {target?.email && <span>{target.email}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-1">
          <Label>Jauna parole</Label>
          <Input
            type="text"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Jauna parole"
            className="font-mono"
            autoFocus
          />
          {error && (
            <p className="text-[11.5px] text-red-700">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-graphite-100">
          <Button variant="ghost" size="sm" onClick={onClose}>
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
