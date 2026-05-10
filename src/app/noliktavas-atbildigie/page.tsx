"use client";

/**
 * Noliktavas atbildīgie — warehouse manager access control.
 *
 * Lists external users with role='warehouse_manager', lets the
 * owner add/remove them and pick which company subset they can
 * access. Each user gets a generated password shown ONCE for
 * out-of-band delivery (Signal, paper, etc).
 *
 * Once auth is wired up (Faze 2), these credentials power the
 * /atbildigais login route — the atbildīgais sees only Noliktava,
 * Demo produkcija, Gatavā produkcija pages, and only for the
 * companies they were granted.
 *
 * Backed by /api/external-users which writes to
 * account-master.gsheet/02_external_users with bcrypt-hashed
 * passwords.
 */

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { useCompany } from "@/lib/company-context";

interface ExternalUser {
  id: string;
  email: string;
  role: "accountant" | "warehouse_manager";
  allowedCompanyIds: string[];
  createdAt: string;
}

export default function NoliktavasAtbildigieePage() {
  const { companies } = useCompany();
  const [users, setUsers] = useState<ExternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPassword, setShowPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/external-users");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      const all = (data.users ?? []) as ExternalUser[];
      setUsers(all.filter((u) => u.role === "warehouse_manager"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Vai tiešām atņemt piekļuvi? Atbildīgais vairs nevarēs ielogoties."
      )
    ) {
      return;
    }
    try {
      const r = await fetch(`/api/external-users?id=${id}`, {
        method: "DELETE",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const companyLabel = (id: string) => {
    const c = companies.find((c) => c.id === id);
    return c?.name ?? id;
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Noliktavas atbildīgie"
          description="Pievieno noliktavas atbildīgos. Katrs ielogojas ar e-pastu un paroli, redz tikai noliktavas un Tev norādītos uzņēmumus."
          actions={
            <Button size="sm" onClick={() => setShowAdd(true)}>
              Pievienot atbildīgo
            </Button>
          }
        />

        {error && (
          <Card className="border-red-200 bg-red-50">
            <div className="p-3 text-sm text-red-900">{error}</div>
          </Card>
        )}

        <Card className="bg-white/85 backdrop-blur-sm">
          {loading ? (
            <div className="p-12 text-center text-[13px] text-graphite-500">
              Ielādē…
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-graphite-700">
                Vēl nav neviena atbildīgā
              </p>
              <p className="text-xs text-graphite-500">
                Pievieno atbildīgo, lai viņš var ielogoties /atbildigais
                lapā un strādāt ar noliktavu.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-graphite-200">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{u.email}</p>
                    <p className="text-xs text-graphite-500">
                      {u.allowedCompanyIds.length === 0
                        ? "Visi uzņēmumi"
                        : u.allowedCompanyIds
                            .map(companyLabel)
                            .join(", ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(u.id)}
                    title="Atņemt piekļuvi"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Heads-up note about not-yet-implemented login */}
        <Card className="border-amber-200 bg-amber-50">
          <div className="p-3 text-xs text-amber-900">
            <strong>Piezīme:</strong> Login lapa /atbildigais vēl ir
            izstrādes procesā. Šobrīd Tu vari pievienot atbildīgos un
            saglabāt viņu paroles, bet pati ielogošanās tiks aktivizēta
            nākamajā atjauninājumā.
          </div>
        </Card>
      </div>

      {/* Add dialog */}
      <AddManagerDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        onCreated={(email, password) => {
          setShowPassword({ email, password });
          setShowAdd(false);
          void reload();
        }}
      />

      {/* One-time password reveal */}
      {showPassword && (
        <Dialog
          open={!!showPassword}
          onOpenChange={(o) => !o && setShowPassword(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Parole izveidota</DialogTitle>
              <DialogDescription>
                Saglabā šo paroli — pēc dialoga aizvēršanas tā vairs
                nebūs redzama.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-900">
                {showPassword.email}
              </p>
              <p className="font-mono text-lg font-semibold text-amber-900">
                {showPassword.password}
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${showPassword.email}\n${showPassword.password}`
                  );
                }}
              >
                Kopēt e-pastu un paroli
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

function AddManagerDialog({
  open,
  onOpenChange,
  companies,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Array<{ id: string; name: string }>;
  onCreated: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Ievadi e-pasta adresi");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/external-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          role: "warehouse_manager",
          allowedCompanyIds: selected,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      onCreated(trimmed, data.plaintextPassword);
      setEmail("");
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pievienot atbildīgo</DialogTitle>
          <DialogDescription>
            Atbildīgais ielogosies /atbildigais lapā ar šo e-pastu un
            ģenerēto paroli. Viņš redzēs tikai noliktavas (Noliktava,
            Demo produkcija, Gatavā produkcija) un izvēlētos uzņēmumus.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>E-pasta adrese</Label>
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atbildigais@firma.lv"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Pieejamie uzņēmumi</Label>
            {companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nav pievienots neviens uzņēmums. Vispirms pievieno
                uzņēmumus &raquo; Uzņēmumi.
              </p>
            ) : (
              <div className="space-y-1">
                {companies.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border border-graphite-200 bg-white px-2 py-1.5 cursor-pointer hover:bg-graphite-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected([...selected, c.id]);
                        } else {
                          setSelected(selected.filter((id) => id !== c.id));
                        }
                      }}
                    />
                    <span className="text-sm">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Ja neizvēlies nevienu, atbildīgais redzēs visus uzņēmumus.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Parole tiks ģenerēta automātiski un parādīta vienreiz pēc
            pievienošanas.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Atcelt
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Veido…" : "Pievienot"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
