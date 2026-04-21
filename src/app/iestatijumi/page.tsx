"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  User,
  Building2,
  FileDown,
  Globe,
  Bell,
  Landmark,
  Mail,
  CheckCircle2,
  ArrowRight,
  Database,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/business/headers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, Separator } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch-tabs";
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

const sections = [
  { id: "general", label: "Vispārīgie", icon: User },
  { id: "companies", label: "Uzņēmumi", icon: Building2 },
  { id: "export", label: "Eksports", icon: FileDown },
  { id: "data", label: "Dati un dublējumi", icon: Database },
  { id: "language", label: "Valoda", icon: Globe },
  { id: "notifications", label: "Paziņojumi", icon: Bell },
  { id: "bank", label: "Bankas integrācija", icon: Landmark },
  { id: "email", label: "E-pasta importēšana", icon: Mail },
];

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
              {active === "export" && <ExportSettings />}
              {active === "data" && <DataManagementSettings />}
              {active === "language" && <LanguageSettings />}
              {active === "notifications" && <NotificationSettings />}
              {active === "bank" && <BankIntegration />}
              {active === "email" && <EmailImport />}
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
  return (
    <div className="space-y-4">
      <SettingsCard
        title="Profils"
        description="Jūsu personīgā informācija"
      >
        <FieldRow label="Vārds, Uzvārds">
          <Input defaultValue="Klāvs Bērziņš" />
        </FieldRow>
        <FieldRow label="E-pasta adrese">
          <Input defaultValue="klavs@globalwolfmotors.com" type="email" />
        </FieldRow>
        <FieldRow label="Tālrunis">
          <Input defaultValue="+371 29 000 000" type="tel" />
        </FieldRow>
        <div className="flex justify-end pt-4 gap-2">
          <Button variant="ghost" size="sm">
            Atcelt
          </Button>
          <Button size="sm">Saglabāt izmaiņas</Button>
        </div>
      </SettingsCard>
    </div>
  );
}

function CompanySettings() {
  return (
    <SettingsCard
      title="Noklusējuma uzņēmums"
      description="Uzņēmums, ar kuru sākt katru sesiju"
    >
      <FieldRow
        label="Noklusējuma uzņēmums"
        hint="Rēķiniem un maksājumiem, ja nav norādīts cits"
      >
        <Select defaultValue="gwm">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gwm">Global Wolf Motors</SelectItem>
            <SelectItem value="drift">Drift Arena Liepāja</SelectItem>
            <SelectItem value="mosphera">Mosphera</SelectItem>
            <SelectItem value="visitliepaja">Visit Liepāja</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow
        label="Pievienot uzņēmumu"
        hint="Ievadiet reģistrācijas numuru, un automātiski aizpildīsim pārējo"
      >
        <div className="flex gap-2">
          <Input placeholder="40003000000" />
          <Button size="sm">Pievienot</Button>
        </div>
      </FieldRow>
    </SettingsCard>
  );
}

function ExportSettings() {
  return (
    <SettingsCard
      title="Eksporta iestatījumi"
      description="Pielāgojiet, kā dati tiek eksportēti"
    >
      <FieldRow label="Noklusējuma formāts">
        <Select defaultValue="xlsx">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow
        label="Datumu formāts"
        hint="Kā datumi tiks attēloti eksportos"
      >
        <Select defaultValue="lv">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lv">31.12.2026</SelectItem>
            <SelectItem value="iso">2026-12-31</SelectItem>
            <SelectItem value="us">12/31/2026</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow
        label="Valūtas formāts"
        hint="Decimālās atdalītājs"
      >
        <Select defaultValue="comma">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comma">1 234,56 €</SelectItem>
            <SelectItem value="dot">€1,234.56</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
    </SettingsCard>
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Neparedzēta kļūda");
      }
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Neparedzēta kļūda");
      }
      setHealthState({ kind: "success", report: data as HealthReport });
    } catch (err) {
      setHealthState({
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

function NotificationSettings() {
  const notifications = [
    {
      label: "Tuvojas apmaksas termiņš",
      hint: "3 dienas pirms rēķina termiņa",
      enabled: true,
    },
    {
      label: "Jauns rēķins saņemts",
      hint: "Kad e-pastā ienāk jauns rēķins",
      enabled: true,
    },
    {
      label: "Termiņš beidzies",
      hint: "Kad rēķins kļūst nokavēts",
      enabled: true,
    },
    {
      label: "Abonementa cenas izmaiņas",
      hint: "Kad mainās abonementa cena",
      enabled: false,
    },
    {
      label: "Nedēļas pārskats",
      hint: "Katru pirmdien 9:00",
      enabled: true,
    },
  ];

  return (
    <SettingsCard
      title="Paziņojumi"
      description="Izvēlieties, par ko jūs vēlaties tikt informēts"
    >
      <div className="-mt-2">
        {notifications.map((n, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-3.5 border-b border-graphite-100 last:border-0"
          >
            <div>
              <p className="text-[13.5px] font-medium text-graphite-900">
                {n.label}
              </p>
              <p className="text-[11.5px] text-graphite-500 mt-0.5">{n.hint}</p>
            </div>
            <Switch defaultChecked={n.enabled} />
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

function BankIntegration() {
  return (
    <div className="space-y-4">
      <Card className="p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-100/50 to-transparent rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold tracking-tight text-graphite-900">
                    SEB banka
                  </h3>
                  <Badge variant="muted">Nav pieslēgts</Badge>
                </div>
                <p className="text-[12.5px] text-graphite-500 mt-0.5">
                  Automātiski sinhronizējiet darījumus un kontus
                </p>
              </div>
            </div>
            <Button size="sm">
              Pieslēgties
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="rounded-xl bg-graphite-50/60 border border-graphite-100 p-3 text-[12px] text-graphite-600 leading-relaxed">
            <span className="text-graphite-900 font-medium">Nākošais solis:</span>{" "}
            Pieslēgšanās notiek caur SEB Open Banking API. Tas ļaus WORKMANIS redzēt rēķinu apmaksas statusus un automātiski atzīmēt apmaksātos rēķinus.
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-graphite-100 text-graphite-700 border border-graphite-200">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold tracking-tight text-graphite-900">
                Swedbank
              </h3>
              <p className="text-[12.5px] text-graphite-500 mt-0.5">
                Pieejams arī Swedbank pieslēgums
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm">
            Pieslēgties
          </Button>
        </div>
      </Card>
    </div>
  );
}

function EmailImport() {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-semibold tracking-tight text-graphite-900">
                  E-pasta importēšana
                </h3>
                <Badge variant="success">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Aktīvs
                </Badge>
              </div>
              <p className="text-[12.5px] text-graphite-500 mt-0.5">
                rekini@workmanis.lv
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm">
            Kopēt adresi
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-5 border-t border-graphite-100">
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
              Šomēnes apstrādāti
            </p>
            <p className="mt-1.5 text-[22px] font-semibold tabular text-graphite-900">
              24
            </p>
          </div>
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
              Automātiski atpazīti
            </p>
            <p className="mt-1.5 text-[22px] font-semibold tabular text-graphite-900">
              21
            </p>
          </div>
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-graphite-400 font-medium">
              Precizitāte
            </p>
            <p className="mt-1.5 text-[22px] font-semibold tabular text-emerald-600">
              87%
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-[14px] font-semibold tracking-tight text-graphite-900 mb-3">
          Kā tas strādā
        </h3>
        <ol className="space-y-3 text-[12.5px] text-graphite-600 leading-relaxed">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-graphite-900 text-white text-[10px] font-semibold">
              1
            </span>
            Pārsūtiet rēķinu e-pastus uz{" "}
            <span className="font-mono text-graphite-900">
              rekini@workmanis.lv
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-graphite-900 text-white text-[10px] font-semibold">
              2
            </span>
            AI automātiski nolasa piegādātāju, summu, IBAN un datumus
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-graphite-900 text-white text-[10px] font-semibold">
              3
            </span>
            Rēķins tiek pievienots sistēmā gaidot jūsu apstiprinājumu
          </li>
        </ol>
      </Card>
    </div>
  );
}
