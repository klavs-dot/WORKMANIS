"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  User,
  Building2,
  Globe,
  Database,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  UserCog,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, Separator } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company-context";

// Sesija 7 — restructured. Removed sections that duplicated other
// pages or had no real functionality:
//   - Eksports → already covered by /gramatvedibai eksporti
//   - Paziņojumi → no notification system yet, was a stub
//   - Bankas integrācija → covered by per-company FIDAVISTA import
//   - E-pasta importēšana → covered by per-company Gmail OAuth
//
// Kept (with real data wiring):
//   - Vispārīgie — name + email from session (Master OAuth)
//   - Uzņēmumi — list from context, default = active company
//   - Dati un dublējumi — JSON export/import + clear
//   - Valoda — UI language picker (LV only for now, but kept
//     for when EN translations land)
//
// Added:
//   - Grāmatvedība — placeholder for granting accountant access
//     (full auth implementation comes in a follow-up)
const sections = [
  { id: "general", label: "Vispārīgie", icon: User },
  { id: "companies", label: "Uzņēmumi", icon: Building2 },
  { id: "accountant", label: "Grāmatvedība", icon: UserCog },
  { id: "data", label: "Dati un dublējumi", icon: Database },
  { id: "language", label: "Valoda", icon: Globe },
];

/**
 * Safely parse a fetch Response as JSON, with helpful error
 * messages for the common server-side failure modes.
 *
 * Why a wrapper instead of plain res.json():
 *   - Vercel function timeouts return an EMPTY body (not JSON).
 *     Plain res.json() throws 'Unexpected end of JSON input'
 *     which is opaque — the user sees that and can't tell that
 *     the actual problem was a timeout.
 *   - 502/504 gateway errors sometimes return HTML error pages
 *     instead of JSON, same problem.
 *   - We want a single clean error message the caller can show.
 *
 * Returns the parsed JSON on success. Throws Error with a
 * human-readable message on any failure, including:
 *   - empty body         → 'Serveris atbildēja tukšu (iespējams, timeout)'
 *   - non-JSON body      → 'Servera kļūda (HTTP {status})'
 *   - 4xx/5xx with JSON  → uses the body's .error field
 */
async function safeJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  // Read as text first so we can detect empty / non-JSON bodies
  const text = await res.text();

  if (!text) {
    if (res.status === 504 || res.status === 408) {
      throw new Error(
        "Pieprasījums pārsniedza laika limitu. Pamēģini vēlreiz vai atver Google Sheets manuāli."
      );
    }
    throw new Error(
      `Serveris atbildēja tukšu (HTTP ${res.status}). Iespējams, funkcija pārsniedza laika limitu — pamēģini vēlreiz.`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Server returned HTML or plain text (e.g. Vercel error page)
    if (!res.ok) {
      throw new Error(`Servera kļūda (HTTP ${res.status})`);
    }
    throw new Error("Servera atbilde nav JSON");
  }

  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(err);
  }

  return data as T;
}

export default function IestatijumiPage() {
  const [active, setActive] = useState("general");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Iestatījumi"
          description="Pielāgojiet WORKMANIS savām vajadzībām"
        />

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 lg:gap-8">
          {/* Side nav */}
          <nav className="space-y-0.5">
            {sections.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors text-left",
                    isActive
                      ? "bg-graphite-100 text-graphite-900"
                      : "text-graphite-600 hover:bg-graphite-50 hover:text-graphite-900"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5",
                      isActive ? "text-graphite-900" : "text-graphite-400"
                    )}
                  />
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {active === "general" && <GeneralSettings />}
              {active === "companies" && <CompanySettings />}
              {active === "accountant" && <AccountantSettings />}
              {active === "data" && <DataManagementSettings />}
              {active === "language" && <LanguageSettings />}
            </motion.div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-5">
        <h2 className="text-[16px] font-semibold tracking-tight text-graphite-900">
          {title}
        </h2>
        {description && (
          <p className="text-[12.5px] text-graphite-500 mt-0.5">
            {description}
          </p>
        )}
      </div>
      {children}
    </Card>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2 md:gap-6 py-4 border-b border-graphite-100 last:border-0">
      <div>
        <Label>{label}</Label>
        {hint && (
          <p className="text-[11.5px] text-graphite-500 mt-0.5 leading-snug">
            {hint}
          </p>
        )}
      </div>
      <div className="max-w-md">{children}</div>
    </div>
  );
}

function GeneralSettings() {
  // Sesija 7 — wired to actual session (Master OAuth identity)
  // instead of hardcoded 'Klāvs Bērziņš' / 'klavs@globalwolfmotors.com'.
  // The fields are READ-ONLY because name + email come from
  // Google — to change them, the user has to update their Google
  // account, not WORKMANIS. We make this clear with a hint line.
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <SettingsCard title="Profils" description="Jūsu personīgā informācija">
          <p className="text-sm text-muted-foreground">Ielādē profilu…</p>
        </SettingsCard>
      </div>
    );
  }

  const name = session?.user?.name ?? "—";
  const email = session?.user?.email ?? "—";

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Profils"
        description="Šie dati nāk no Tava Google konta. Lai mainītu, atjaunini Google profilu."
      >
        <FieldRow label="Vārds, Uzvārds">
          <Input value={name} readOnly className="bg-muted" />
        </FieldRow>
        <FieldRow label="E-pasta adrese">
          <Input value={email} type="email" readOnly className="bg-muted" />
        </FieldRow>
      </SettingsCard>
    </div>
  );
}

function CompanySettings() {
  // Sesija 7 — wired to real company list from useCompany() context
  // instead of hardcoded 'gwm/drift/mosphera/visitliepaja'.
  // The 'Pievienot uzņēmumu' button now links to /uznemumi where
  // the actual provisioning flow lives, instead of a non-functional
  // text input.
  const { companies, activeCompany, setActiveCompany } = useCompany();

  return (
    <SettingsCard
      title="Noklusējuma uzņēmums"
      description="Uzņēmums, ar kuru sākt katru sesiju"
    >
      <FieldRow
        label="Aktīvais uzņēmums"
        hint="Rēķiniem un maksājumiem, ja nav norādīts cits"
      >
        <Select
          value={activeCompany?.id ?? ""}
          onValueChange={(id) => setActiveCompany(id)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Izvēlies uzņēmumu" />
          </SelectTrigger>
          <SelectContent>
            {companies.length === 0 && (
              <SelectItem value="__none" disabled>
                Vēl nav pievienots neviens uzņēmums
              </SelectItem>
            )}
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.legalName ? ` · ${c.legalName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow
        label="Pievienot uzņēmumu"
        hint="Uzņēmumi tiek pievienoti caur uzņēmumu lapu"
      >
        <Button asChild size="sm" variant="outline">
          <a href="/uznemumi">Pārvaldīt uzņēmumus</a>
        </Button>
      </FieldRow>
    </SettingsCard>
  );
}

/**
 * Sesija 7 — placeholder for the "grant accountant access" flow.
 *
 * Vision (per user spec): the user enters an email + sets a
 * password, and the accountant can log in via /gramatvediba (or
 * a dedicated /accountant route) using that email/password to see
 * EVERYTHING in the user's WORKMANIS — full read access to all
 * companies, all sheets, all invoices.
 *
 * That's a separate auth backend from the Google OAuth used by
 * the owner — implementing it requires:
 *   - A new auth provider (credentials-based) wired into Auth.js
 *   - A new sheet/tab to store accountant credentials (hashed
 *     passwords, never plaintext)
 *   - Role-aware middleware to scope what an accountant can see
 *   - A login page at /atbildigais or /gramatvediba
 *   - Password generation + secure delivery (one-time link,
 *     emailed to the accountant)
 *
 * For now this section explains the upcoming feature and shows
 * a 'Coming soon' note. The infrastructure changes are big
 * enough to warrant their own dedicated session.
 */
function AccountantSettings() {
  return (
    <div className="space-y-4">
      <ExternalAuthSetupWizard />
      <ExternalUsersManager role="accountant" />
    </div>
  );
}

/**
 * Sesija 7 Faze 2 — onboarding wizard for the delegated-access
 * setup. Walks the owner through:
 *   1. Confirming the service account is configured server-side
 *   2. Sharing their account-master sheet with the service
 *      account email (one click → copy email to clipboard)
 *   3. Adding the sheet ID to OWNER_SHEET_REGISTRY env var
 *
 * Steps that are already done show a green check. Pending steps
 * show the action needed with copy-to-clipboard helpers.
 *
 * The wizard hides itself entirely once status='ready' — no
 * point bothering the owner with setup info after it's all
 * configured. It also surfaces if they're using a stale Vercel
 * deployment that doesn't have the service account env yet
 * (status='no-service-account').
 */
function ExternalAuthSetupWizard() {
  const [data, setData] = useState<{
    ownerEmail: string;
    sheetId: string | null;
    serviceAccountEmail: string | null;
    registeredSheetId: string | null;
    status: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/owner-setup");
        if (r.ok) setData(await r.json());
      } catch {
        // ignore — wizard hides on failure
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;
  if (!data) return null;
  if (data.status === "ready") return null; // all set

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-amber-900">
          Lai grāmatvedis un noliktavas atbildīgais varētu ielogoties
        </h3>
        <p className="text-xs text-amber-800 mt-1">
          Veic šos soļus vienreiz, lai aktivizētu ārējo lietotāju
          piekļuvi. Pēc tam šis bloks pazudīs.
        </p>
      </div>

      {data.status === "no-service-account" && (
        <div className="space-y-1.5 text-xs text-amber-900">
          <p className="font-medium">
            Solis 1 — Service account nav konfigurēts
          </p>
          <p>
            Sazinies ar sistēmas administratoru, lai pievienotu{" "}
            <code className="bg-amber-100 px-1 rounded">
              GOOGLE_SERVICE_ACCOUNT_KEY
            </code>{" "}
            Vercel environment variable.
          </p>
        </div>
      )}

      {data.status === "no-sheet" && (
        <div className="space-y-1.5 text-xs text-amber-900">
          <p className="font-medium">
            Solis 1 — WORKMANIS folderis nav atrasts
          </p>
          <p>
            Vispirms izveido uzņēmumu sadaļā &laquo;Uzņēmumi&raquo;,
            lai sistēma izveido account-master sheet.
          </p>
        </div>
      )}

      {data.serviceAccountEmail &&
        data.sheetId &&
        data.status === "needs-env-var" && (
          <>
            <div className="space-y-1.5 text-xs text-amber-900">
              <p className="font-medium">
                Solis 1 — Pievieno service account savai sheet
              </p>
              <p>
                Atver{" "}
                <a
                  href={`https://docs.google.com/spreadsheets/d/${data.sheetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  account-master sheet
                </a>
                , klikšķi <strong>Share</strong>, un pievieno šo
                e-pastu kā <em>Editor</em>:
              </p>
              <div className="flex gap-2 items-center bg-white rounded border border-amber-300 px-2 py-1.5">
                <code className="flex-1 text-[11px] font-mono break-all">
                  {data.serviceAccountEmail}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => copy(data.serviceAccountEmail!)}
                >
                  Kopēt
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-amber-900">
              <p className="font-medium">
                Solis 2 — Pievieno sheet ID Vercel env variable
              </p>
              <p>
                Vercel projekta iestatījumos, pievieno{" "}
                <code className="bg-amber-100 px-1 rounded">
                  OWNER_SHEET_REGISTRY
                </code>{" "}
                ar šādu vērtību:
              </p>
              <div className="flex gap-2 items-start bg-white rounded border border-amber-300 px-2 py-1.5">
                <code className="flex-1 text-[11px] font-mono break-all">
                  {JSON.stringify({
                    [data.ownerEmail]: data.sheetId,
                  })}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() =>
                    copy(
                      JSON.stringify({
                        [data.ownerEmail]: data.sheetId,
                      })
                    )
                  }
                >
                  Kopēt
                </Button>
              </div>
              <p>
                Pēc env vērtības pievienošanas, Vercel veiks redeploy.
                Tad varēsi pievienot grāmatvedi un atbildīgo.
              </p>
            </div>
          </>
        )}
    </div>
  );
}

/**
 * Reusable CRUD panel for external users (accountants and
 * warehouse managers). Both roles share the same
 * /api/external-users endpoint — they only differ in:
 *   - Default allowedCompanyIds: accountant gets all (empty array
 *     means 'all'), warehouse_manager gets a curated subset
 *   - Description copy + section title
 *
 * The panel:
 *   1. Lists existing users for this role on mount (GET)
 *   2. Lets owner add a new user (POST → shows plaintext password
 *      ONCE, never again)
 *   3. Lets owner remove an existing user (DELETE)
 *   4. For warehouse_manager: lets owner edit the company access
 *      list per user (PATCH)
 */
function ExternalUsersManager({
  role,
}: {
  role: "accountant" | "warehouse_manager";
}) {
  const { companies } = useCompany();
  const [users, setUsers] = useState<
    Array<{
      id: string;
      email: string;
      role: "accountant" | "warehouse_manager";
      allowedCompanyIds: string[];
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPassword, setNewPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/external-users");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      const all = (data.users ?? []) as Array<{
        id: string;
        email: string;
        role: "accountant" | "warehouse_manager";
        allowedCompanyIds: string[];
        createdAt: string;
      }>;
      setUsers(all.filter((u) => u.role === role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Vai tiešām atņemt piekļuvi? Lietotājs vairs nevarēs ielogoties."
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

  const isAccountant = role === "accountant";
  const title = isAccountant
    ? "Grāmatvedības piekļuve"
    : "Noliktavas atbildīgie";
  const description = isAccountant
    ? "Piešķir savai grāmatvedei tiesības ielogoties ar atsevišķu paroli un skatīt VISU Tavu WORKMANIS — visus uzņēmumus, rēķinus un maksājumus."
    : "Pievieno noliktavas atbildīgos. Katrs atbildīgais var ielogoties ar savu paroli un redzēt tikai pieejamās noliktavas (Noliktava, Demo produkcija, Gatavā produkcija).";

  return (
    <div className="space-y-4">
      <SettingsCard title={title} description={description}>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {/* List existing users */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Ielādē…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAccountant
              ? "Vēl nav pievienota neviena grāmatvede."
              : "Vēl nav pievienots neviens atbildīgais."}
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-graphite-200 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {isAccountant
                      ? "Pilna piekļuve visiem uzņēmumiem"
                      : u.allowedCompanyIds.length === 0
                        ? "Visi uzņēmumi"
                        : `${u.allowedCompanyIds.length} ${
                            u.allowedCompanyIds.length === 1
                              ? "uzņēmums"
                              : "uzņēmumi"
                          }`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(u.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => setShowAdd(true)}>
            {isAccountant
              ? "Pievienot grāmatvedi"
              : "Pievienot atbildīgo"}
          </Button>
        </div>
      </SettingsCard>

      {/* Show plaintext password once after creation */}
      {newPassword && (
        <Dialog
          open={!!newPassword}
          onOpenChange={(o) => !o && setNewPassword(null)}
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
                {newPassword.email}
              </p>
              <p className="font-mono text-lg font-semibold text-amber-900">
                {newPassword.password}
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${newPassword.email}\n${newPassword.password}`
                  );
                }}
              >
                Kopēt e-pastu un paroli
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AddExternalUserDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        role={role}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        onCreated={(email, password) => {
          setNewPassword({ email, password });
          setShowAdd(false);
          void reload();
        }}
      />
    </div>
  );
}

function AddExternalUserDialog({
  open,
  onOpenChange,
  role,
  companies,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: "accountant" | "warehouse_manager";
  companies: Array<{ id: string; name: string }>;
  onCreated: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAccountant = role === "accountant";

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
          role,
          // Accountant always gets all-companies access (empty array
          // is the convention for 'all' on read-side checks).
          // Warehouse manager gets the curated subset.
          allowedCompanyIds: isAccountant ? [] : selectedCompanies,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      onCreated(trimmed, data.plaintextPassword);
      setEmail("");
      setSelectedCompanies([]);
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
          <DialogTitle>
            {isAccountant
              ? "Pievienot grāmatvedi"
              : "Pievienot atbildīgo"}
          </DialogTitle>
          <DialogDescription>
            {isAccountant
              ? "Grāmatvede saņems pilnu piekļuvi visam Tavam WORKMANIS — visiem uzņēmumiem, rēķiniem, maksājumiem."
              : "Atbildīgais redzēs tikai pieejamos uzņēmumus un to noliktavas (Noliktava, Demo, Gatavā produkcija)."}
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
              placeholder={
                isAccountant
                  ? "gramatvede@firma.lv"
                  : "atbildigais@firma.lv"
              }
            />
          </div>

          {!isAccountant && (
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
                        checked={selectedCompanies.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCompanies([
                              ...selectedCompanies,
                              c.id,
                            ]);
                          } else {
                            setSelectedCompanies(
                              selectedCompanies.filter((id) => id !== c.id)
                            );
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
          )}

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


// ============================================================
// Data management — backup, restore, reset all localStorage
// ============================================================

/**
 * All localStorage keys WORKMANIS owns. Keep this in sync with
 * the STORAGE_KEY constants scattered across the store files.
 * If a new store is added, append its key here so export/import/reset
 * work correctly.
 */
const WORKMANIS_STORAGE_KEYS = [
  "workmanis:active-company",
  "workmanis:companies",
  "workmanis:billing-store",
  "workmanis:number-counters",
  "workmanis:assets-store",
  "workmanis:clients-store",
  "workmanis:templates-store",
  "workmanis:distributors",
  "workmanis:demo-products",
  "workmanis:business-contacts",
  "workmanis:online-links",
  "workmanis:employees",
  "workmanis:orders",
  "workmanis:documents",
] as const;

function DataManagementSettings() {
  const [resetOpen, setResetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    keysFound: string[];
    keysSkipped: string[];
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<Record<
    string,
    string
  > | null>(null);

  const [repairState, setRepairState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  interface HealthTabReport {
    tab: string;
    prefix: string;
    rowCount?: number;
    deletedCount?: number;
    error?: string;
  }

  interface HealthReport {
    ok: boolean;
    company: {
      id: string;
      name: string;
      sheetId: string;
      sheetTitle?: string;
    };
    summary: {
      tabsChecked: number;
      totalActiveRows: number;
      tabsWithErrors: number;
    };
    tabs: HealthTabReport[];
  }

  const [healthState, setHealthState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "success"; report: HealthReport }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  interface AuditEntry {
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    entityTable: string;
    entityId: string;
    changesJson: string;
  }

  interface AuditReport {
    ok: boolean;
    count: number;
    total: number;
    entries: AuditEntry[];
  }

  const [auditState, setAuditState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "success"; report: AuditReport }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Pull active company from the Company context so we can call
  // the repair API with the right company_id
  const { activeCompany } = useCompany();

  const runRepair = async () => {
    if (!activeCompany?.id) {
      setRepairState({
        kind: "error",
        message: "Nav aktīva uzņēmuma. Izvēlieties uzņēmumu vispirms.",
      });
      return;
    }
    setRepairState({ kind: "running" });
    try {
      const res = await fetch(
        `/api/companies/repair?company_id=${encodeURIComponent(activeCompany.id)}`,
        { method: "POST" }
      );
      const data = await safeJsonResponse<{ message?: string }>(res);
      setRepairState({
        kind: "success",
        message: data.message ?? "Shēma atjaunināta",
      });
      // Auto-clear after a moment
      setTimeout(() => setRepairState({ kind: "idle" }), 4000);
    } catch (err) {
      setRepairState({
        kind: "error",
        message: err instanceof Error ? err.message : "Neparedzēta kļūda",
      });
    }
  };

  const runHealthCheck = async () => {
    if (!activeCompany?.id) {
      setHealthState({
        kind: "error",
        message: "Nav aktīva uzņēmuma.",
      });
      return;
    }
    setHealthState({ kind: "running" });
    try {
      const res = await fetch(
        `/api/health?company_id=${encodeURIComponent(activeCompany.id)}`,
        { cache: "no-store" }
      );
      const data = await safeJsonResponse<HealthReport>(res);
      setHealthState({ kind: "success", report: data });
    } catch (err) {
      setHealthState({
        kind: "error",
        message: err instanceof Error ? err.message : "Neparedzēta kļūda",
      });
    }
  };

  const runAuditLoad = async () => {
    if (!activeCompany?.id) {
      setAuditState({
        kind: "error",
        message: "Nav aktīva uzņēmuma.",
      });
      return;
    }
    setAuditState({ kind: "running" });
    try {
      const res = await fetch(
        `/api/audit-log?company_id=${encodeURIComponent(activeCompany.id)}&limit=50`,
        { cache: "no-store" }
      );
      const data = await safeJsonResponse<AuditReport>(res);
      setAuditState({ kind: "success", report: data });
    } catch (err) {
      setAuditState({
        kind: "error",
        message: err instanceof Error ? err.message : "Neparedzēta kļūda",
      });
    }
  };

  const exportToJSON = () => {
    if (typeof window === "undefined") return;
    const dump: Record<string, string | null> = {};
    for (const key of WORKMANIS_STORAGE_KEYS) {
      dump[key] = window.localStorage.getItem(key);
    }
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: "WORKMANIS",
      data: dump,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `workmanis-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !parsed.data) {
        alert(
          "Nederīgs faila formāts. Failam jābūt WORKMANIS dublējumam ar 'data' lauku."
        );
        return;
      }
      const data = parsed.data as Record<string, unknown>;
      const keysFound: string[] = [];
      const keysSkipped: string[] = [];
      const validData: Record<string, string> = {};
      for (const key of Object.keys(data)) {
        if ((WORKMANIS_STORAGE_KEYS as readonly string[]).includes(key)) {
          if (typeof data[key] === "string") {
            keysFound.push(key);
            validData[key] = data[key] as string;
          } else if (data[key] === null) {
            // Stored as null in export — skip without flagging
          } else {
            keysSkipped.push(`${key} (nepareizs tips)`);
          }
        } else {
          keysSkipped.push(`${key} (nezināms)`);
        }
      }
      setImportPreview({ keysFound, keysSkipped });
      setPendingImport(validData);
      setImportOpen(true);
    } catch (e) {
      alert(`Neizdevās nolasīt JSON failu: ${(e as Error).message}`);
    }
  };

  const confirmImport = () => {
    if (!pendingImport || typeof window === "undefined") return;
    // Replace each key with the imported value
    for (const [key, value] of Object.entries(pendingImport)) {
      window.localStorage.setItem(key, value);
    }
    setImportOpen(false);
    setPendingImport(null);
    setImportPreview(null);
    // Reload so all stores re-hydrate from the imported localStorage
    window.location.reload();
  };

  const confirmReset = () => {
    if (typeof window === "undefined") return;
    for (const key of WORKMANIS_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    setResetOpen(false);
    // Hard reload so every store starts fresh
    window.location.href = "/";
  };

  return (
    <div className="space-y-6">
      {/* Export */}
      <SettingsCard
        title="Eksportēt datus"
        description="Lejupielādējiet visus savus WORKMANIS datus kā JSON failu drošības dublējumam"
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-graphite-50/60 border border-graphite-100">
          <Download className="h-4 w-4 shrink-0 mt-0.5 text-graphite-500" />
          <div className="flex-1 text-[12.5px] text-graphite-600 leading-relaxed">
            Tiks eksportētas visas {WORKMANIS_STORAGE_KEYS.length} datu
            grupas — uzņēmumi, klienti, rēķini, darbinieki, dokumenti un
            aktīvi. Failu var izmantot vēlāk, lai atjaunotu datus vai
            pārnestu uz citu pārlūku.
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={exportToJSON}>
            <Download className="h-3.5 w-3.5" />
            Lejupielādēt JSON dublējumu
          </Button>
        </div>
      </SettingsCard>

      {/* Repair — schema reconciliation */}
      <SettingsCard
        title="Pārbaudīt datu struktūru"
        description="Ja datu tabulas Google Sheets failā ir vecākā versijā, šis pievienos trūkstošās kolonnas. Esošie dati netiek skarti."
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-graphite-50 border border-graphite-200">
          <Database className="h-4 w-4 shrink-0 mt-0.5 text-graphite-500" />
          <div className="flex-1 text-[12.5px] text-graphite-600 leading-relaxed">
            {activeCompany ? (
              <>
                Pārbaude tiks veikta uzņēmumam{" "}
                <span className="font-medium">{activeCompany.name}</span>.
                Process ir drošs un idempotents — var palaist atkārtoti bez
                riska.
              </>
            ) : (
              <>
                Nav izvēlēta aktīva uzņēmuma. Dodieties uz{" "}
                <span className="font-medium">Uzņēmumi</span> un izvēlieties
                uzņēmumu, kuru vēlaties pārbaudīt.
              </>
            )}
          </div>
        </div>

        {repairState.kind === "success" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="flex-1 text-[12px] text-emerald-800 leading-relaxed">
              ✓ {repairState.message}
            </div>
          </div>
        )}

        {repairState.kind === "error" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 text-[12px] text-red-800 leading-relaxed">
              {repairState.message}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={runRepair}
            disabled={!activeCompany || repairState.kind === "running"}
          >
            <Database className="h-3.5 w-3.5" />
            {repairState.kind === "running"
              ? "Pārbauda…"
              : "Pārbaudīt un atjaunot"}
          </Button>
        </div>
      </SettingsCard>

      {/* Health check — row counts per tab */}
      <SettingsCard
        title="Pārbaudīt datu saskaņotību"
        description="Parāda, cik rindu ir katrā Google Sheets tabulā. Izmantojams, lai pārliecinātos, ka dati patiešām saglabājas pēc migrācijas."
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-graphite-50 border border-graphite-200">
          <Database className="h-4 w-4 shrink-0 mt-0.5 text-graphite-500" />
          <div className="flex-1 text-[12.5px] text-graphite-600 leading-relaxed">
            {activeCompany ? (
              <>
                Pārbaude tiks veikta uzņēmumam{" "}
                <span className="font-medium">{activeCompany.name}</span>.
                Drošs, tikai lasīšanas režīms — nevienu datu neizmaina.
              </>
            ) : (
              <>Nav izvēlēta aktīva uzņēmuma.</>
            )}
          </div>
        </div>

        {healthState.kind === "error" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 text-[12px] text-red-800 leading-relaxed">
              {healthState.message}
            </div>
          </div>
        )}

        {healthState.kind === "success" && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div className="flex-1 text-[12px] text-emerald-800 leading-relaxed">
                ✓ {healthState.report.summary.tabsChecked} tabulas pārbaudītas,
                kopā <strong>{healthState.report.summary.totalActiveRows}</strong>{" "}
                aktīvu rindu
                {healthState.report.summary.tabsWithErrors > 0 && (
                  <>
                    {" "}
                    · <span className="text-amber-700">
                      {healthState.report.summary.tabsWithErrors} tabulas ar
                      kļūdām
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-graphite-200">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-graphite-50 text-graphite-600 text-left">
                    <th className="px-3 py-2 font-medium">Tabula</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Aktīvās
                    </th>
                    <th className="px-3 py-2 font-medium text-right">
                      Dzēstās
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {healthState.report.tabs.map((t) => (
                    <tr
                      key={t.tab}
                      className="border-t border-graphite-100"
                    >
                      <td className="px-3 py-1.5 font-mono text-graphite-700">
                        {t.tab}
                      </td>
                      {t.error ? (
                        <td
                          colSpan={2}
                          className="px-3 py-1.5 text-red-600 text-right"
                        >
                          {t.error}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {t.rowCount === 0 ? (
                              <span className="text-graphite-400">0</span>
                            ) : (
                              <span className="font-medium text-graphite-900">
                                {t.rowCount}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-graphite-400">
                            {t.deletedCount || ""}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={runHealthCheck}
            disabled={!activeCompany || healthState.kind === "running"}
          >
            <Database className="h-3.5 w-3.5" />
            {healthState.kind === "running"
              ? "Pārbauda…"
              : "Skenēt tabulu rindu skaitu"}
          </Button>
        </div>
      </SettingsCard>

      {/* Audit log viewer */}
      <SettingsCard
        title="Darbību vēsture"
        description="Parāda pēdējās 50 izmaiņas jūsu datos. Katra pievienošana, rediģēšana un dzēšana tiek reģistrēta audit log tabulā."
      >
        {auditState.kind === "error" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 text-[12px] text-red-800 leading-relaxed">
              {auditState.message}
            </div>
          </div>
        )}

        {auditState.kind === "success" && (
          <div className="space-y-2">
            <div className="text-[12px] text-graphite-600">
              Rādītas {auditState.report.count} no{" "}
              {auditState.report.total} darbībām kopā.
            </div>

            {auditState.report.entries.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-graphite-500 bg-graphite-50 rounded-lg">
                Nav ierakstu. Pievienojiet vai rediģējiet datus, lai tos
                redzētu.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-graphite-200">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="bg-graphite-50 text-graphite-600 text-left">
                      <th className="px-3 py-2 font-medium">Laiks</th>
                      <th className="px-3 py-2 font-medium">Darbība</th>
                      <th className="px-3 py-2 font-medium">Tabula</th>
                      <th className="px-3 py-2 font-medium">Ieraksts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditState.report.entries.map((e) => {
                      const ts = e.timestamp;
                      let tsDisplay = ts;
                      try {
                        const d = new Date(ts);
                        if (!isNaN(d.getTime())) {
                          tsDisplay = d.toLocaleString("lv", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          });
                        }
                      } catch {
                        // leave as-is
                      }

                      const actionLabel =
                        e.action === "create"
                          ? "Izveidots"
                          : e.action === "update"
                            ? "Rediģēts"
                            : e.action === "softDelete"
                              ? "Dzēsts"
                              : e.action;

                      const actionColor =
                        e.action === "create"
                          ? "text-emerald-700 bg-emerald-50"
                          : e.action === "update"
                            ? "text-amber-700 bg-amber-50"
                            : e.action === "softDelete"
                              ? "text-red-700 bg-red-50"
                              : "text-graphite-700 bg-graphite-50";

                      return (
                        <tr
                          key={e.id}
                          className="border-t border-graphite-100"
                        >
                          <td className="px-3 py-1.5 text-graphite-600 whitespace-nowrap">
                            {tsDisplay}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={cn(
                                "inline-block px-2 py-0.5 rounded-md text-[10.5px] font-medium",
                                actionColor
                              )}
                            >
                              {actionLabel}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-graphite-700">
                            {e.entityTable}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-graphite-500">
                            {e.entityId}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={runAuditLoad}
            disabled={!activeCompany || auditState.kind === "running"}
          >
            <Database className="h-3.5 w-3.5" />
            {auditState.kind === "running"
              ? "Ielādē…"
              : auditState.kind === "success"
                ? "Atjaunot"
                : "Ielādēt darbību vēsturi"}
          </Button>
        </div>
      </SettingsCard>

      {/* Import */}
      <SettingsCard
        title="Importēt datus"
        description="Atjaunojiet datus no iepriekš eksportēta JSON dublējuma"
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/60 border border-amber-200/70">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 text-[12.5px] text-amber-900 leading-relaxed">
            <span className="font-medium">Uzmanību:</span> imports aizvietos
            visus pašreizējos datus. Pirms importēšanas iesakām eksportēt
            esošos datus kā drošības dublējumu.
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            id="data-import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              document.getElementById("data-import-input")?.click()
            }
          >
            <Upload className="h-3.5 w-3.5" />
            Izvēlēties JSON failu
          </Button>
        </div>
      </SettingsCard>

      {/* Reset — destructive zone */}
      <SettingsCard
        title="Iztīrīt visus datus"
        description="Neatgriezeniski dzēsiet visus WORKMANIS datus no šī pārlūka"
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50/60 border border-red-200/70">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1 text-[12.5px] text-red-900 leading-relaxed">
            <span className="font-medium">Bīstama darbība:</span> tiks
            neatgriezeniski dzēsti visi uzņēmumi, klienti, rēķini, darbinieki
            un visi pārējie dati no šī pārlūka. Šo darbību nevar atsaukt.
            Pirms turpināšanas eksportējiet datus.
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setResetOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Iztīrīt visus datus
          </Button>
        </div>
      </SettingsCard>

      {/* ─── Reset confirmation ─── */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Apstiprināt datu dzēšanu
            </DialogTitle>
            <DialogDescription>
              Šī darbība neatgriezeniski iztīrīs visus localStorage datus
              no šī pārlūka. Vai turpināt?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-graphite-50 border border-graphite-100 p-3 text-[11.5px] text-graphite-600 leading-relaxed">
            Tiks dzēsti šādu grupu dati:
            <ul className="mt-2 space-y-0.5 font-mono text-[10.5px]">
              {WORKMANIS_STORAGE_KEYS.map((k) => (
                <li key={k} className="text-graphite-500">
                  · {k}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(false)}
            >
              Atcelt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmReset}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Jā, iztīrīt visu
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Import confirmation with preview ─── */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          if (!o) {
            setImportOpen(false);
            setPendingImport(null);
            setImportPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-graphite-500" />
              Apstiprināt importu
            </DialogTitle>
            <DialogDescription>
              Pārbaudiet, kuri dati tiks ielādēti no faila. Pašreizējie dati
              tiks aizvietoti.
            </DialogDescription>
          </DialogHeader>

          {importPreview && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-3">
                <p className="text-[11.5px] font-semibold text-emerald-800 mb-1.5">
                  Tiks ielādēts ({importPreview.keysFound.length})
                </p>
                {importPreview.keysFound.length === 0 ? (
                  <p className="text-[11px] text-emerald-700">Nekas</p>
                ) : (
                  <ul className="space-y-0.5 font-mono text-[10.5px]">
                    {importPreview.keysFound.map((k) => (
                      <li key={k} className="text-emerald-700">
                        · {k}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {importPreview.keysSkipped.length > 0 && (
                <div className="rounded-lg bg-graphite-50 border border-graphite-100 p-3">
                  <p className="text-[11.5px] font-semibold text-graphite-700 mb-1.5">
                    Tiks izlaists ({importPreview.keysSkipped.length})
                  </p>
                  <ul className="space-y-0.5 font-mono text-[10.5px]">
                    {importPreview.keysSkipped.map((k) => (
                      <li key={k} className="text-graphite-500">
                        · {k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImportOpen(false);
                setPendingImport(null);
                setImportPreview(null);
              }}
            >
              Atcelt
            </Button>
            <Button
              size="sm"
              onClick={confirmImport}
              disabled={
                !importPreview || importPreview.keysFound.length === 0
              }
            >
              <Upload className="h-3.5 w-3.5" />
              Importēt un pārlādēt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LanguageSettings() {
  return (
    <SettingsCard title="Valoda" description="Izvēlieties WORKMANIS valodu">
      <FieldRow label="Interfeisa valoda">
        <Select defaultValue="lv">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lv">Latviešu</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ru">Русский</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Reģions">
        <Select defaultValue="lv">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lv">Latvija</SelectItem>
            <SelectItem value="ee">Igaunija</SelectItem>
            <SelectItem value="lt">Lietuva</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
    </SettingsCard>
  );
}

