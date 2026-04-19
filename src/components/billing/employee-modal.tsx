"use client";

import { useEffect, useState } from "react";
import {
  X,
  Save,
  Plus,
  Trash2,
  User as UserIcon,
  Briefcase,
  Landmark,
  HeartPulse,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  contractTypeLabel,
  type ContractType,
  type Employee,
  type EmployeeBankAccount,
  type EmployeeContract,
  type EmploymentStatus,
} from "@/lib/employees-store";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);

const blankContract = (): EmployeeContract => ({
  id: uid(),
  type: "darba_ligums",
  number: "",
  startDate: "",
  positionTitle: "",
  baseSalary: 0,
});

const blankBank = (isPrimary: boolean): EmployeeBankAccount => ({
  id: uid(),
  iban: "",
  bankName: "",
  swift: "",
  isPrimary,
});

export function EmployeeModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Employee | null;
  onSubmit: (data: Omit<Employee, "id" | "createdAt">) => void;
}) {
  // Identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalCode, setPersonalCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Employment
  const [status, setStatus] = useState<EmploymentStatus>("aktivs");
  const [position, setPosition] = useState("");
  const [startedAt, setStartedAt] = useState("");

  // Compliance
  const [ovpPassed, setOvpPassed] = useState(false);
  const [ovpLast, setOvpLast] = useState("");
  const [ovpNext, setOvpNext] = useState("");
  const [ovpNotes, setOvpNotes] = useState("");

  const [safetyPassed, setSafetyPassed] = useState(false);
  const [safetyLast, setSafetyLast] = useState("");
  const [safetyNext, setSafetyNext] = useState("");
  const [safetyType, setSafetyType] = useState<
    "ievada" | "darba_vietā" | "atkārtota"
  >("atkārtota");
  const [safetyNotes, setSafetyNotes] = useState("");

  // Contracts and bank accounts
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [bankAccounts, setBankAccounts] = useState<EmployeeBankAccount[]>([]);

  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setFirstName(editing.firstName);
      setLastName(editing.lastName);
      setPersonalCode(editing.personalCode ?? "");
      setEmail(editing.email ?? "");
      setPhone(editing.phone ?? "");
      setStatus(editing.status);
      setPosition(editing.position ?? "");
      setStartedAt(editing.startedAt ?? "");
      setOvpPassed(editing.ovp.passed);
      setOvpLast(editing.ovp.lastCheckDate ?? "");
      setOvpNext(editing.ovp.nextDueDate ?? "");
      setOvpNotes(editing.ovp.notes ?? "");
      setSafetyPassed(editing.safetyBriefing.passed);
      setSafetyLast(editing.safetyBriefing.lastBriefingDate ?? "");
      setSafetyNext(editing.safetyBriefing.nextDueDate ?? "");
      setSafetyType(editing.safetyBriefing.briefingType ?? "atkārtota");
      setSafetyNotes(editing.safetyBriefing.notes ?? "");
      setContracts(editing.contracts);
      setBankAccounts(editing.bankAccounts);
      setNotes(editing.notes ?? "");
    } else {
      setFirstName("");
      setLastName("");
      setPersonalCode("");
      setEmail("");
      setPhone("");
      setStatus("aktivs");
      setPosition("");
      setStartedAt("");
      setOvpPassed(false);
      setOvpLast("");
      setOvpNext("");
      setOvpNotes("");
      setSafetyPassed(false);
      setSafetyLast("");
      setSafetyNext("");
      setSafetyType("atkārtota");
      setSafetyNotes("");
      setContracts([]);
      setBankAccounts([]);
      setNotes("");
    }
  }, [open, editing]);

  const updateContract = (id: string, patch: Partial<EmployeeContract>) =>
    setContracts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeContract = (id: string) =>
    setContracts((prev) => prev.filter((c) => c.id !== id));

  const updateBank = (id: string, patch: Partial<EmployeeBankAccount>) => {
    setBankAccounts((prev) => {
      let updated = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
      // Ensure exactly one primary
      if (patch.isPrimary === true) {
        updated = updated.map((b) =>
          b.id === id ? b : { ...b, isPrimary: false }
        );
      }
      return updated;
    });
  };

  const removeBank = (id: string) =>
    setBankAccounts((prev) => {
      const filtered = prev.filter((b) => b.id !== id);
      // If we removed the primary, mark the first remaining as primary
      if (filtered.length > 0 && !filtered.some((b) => b.isPrimary)) {
        filtered[0] = { ...filtered[0], isPrimary: true };
      }
      return filtered;
    });

  const submit = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      personalCode: personalCode.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      status,
      position: position.trim() || undefined,
      startedAt: startedAt || undefined,
      ovp: {
        passed: ovpPassed,
        lastCheckDate: ovpLast || undefined,
        nextDueDate: ovpNext || undefined,
        notes: ovpNotes.trim() || undefined,
      },
      safetyBriefing: {
        passed: safetyPassed,
        lastBriefingDate: safetyLast || undefined,
        nextDueDate: safetyNext || undefined,
        briefingType: safetyType,
        notes: safetyNotes.trim() || undefined,
      },
      contracts,
      bankAccounts,
      notes: notes.trim() || undefined,
    });
  };

  const valid = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Labot darbinieku" : "Jauns darbinieks"}
          </DialogTitle>
          <DialogDescription>
            Pievieno darba līgumu, bankas kontu, OVP un Darba drošības
            instruktāžu
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Identity */}
          <Section icon={UserIcon} title="Personīgā informācija">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vārds" required>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Uzvārds" required>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Personas kods">
                <Input
                  value={personalCode}
                  onChange={(e) => setPersonalCode(e.target.value)}
                  placeholder="010185-12345"
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field label="Telefons">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+371 00 000 000"
                />
              </Field>
            </div>
            <Field label="E-pasts">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vards@uzņēmums.com"
              />
            </Field>
          </Section>

          {/* Employment */}
          <Section icon={Briefcase} title="Nodarbinātība">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Statuss">
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as EmploymentStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktivs">Aktīvs</SelectItem>
                    <SelectItem value="atvaļinājumā">Atvaļinājumā</SelectItem>
                    <SelectItem value="atlaists">Atlaists</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Amats">
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="piem. Mārketinga vadītāja"
                />
              </Field>
              <Field label="Sākts strādāt">
                <Input
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Contracts */}
          <Section
            icon={Briefcase}
            title="Līgumi"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContracts((p) => [...p, blankContract()])}
              >
                <Plus className="h-3 w-3" />
                Pievienot līgumu
              </Button>
            }
          >
            {contracts.length === 0 ? (
              <EmptyRow text="Nav pievienots neviens līgums." />
            ) : (
              <div className="space-y-2.5">
                {contracts.map((c) => (
                  <ContractRow
                    key={c.id}
                    contract={c}
                    onChange={(patch) => updateContract(c.id, patch)}
                    onRemove={() => removeContract(c.id)}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Bank accounts */}
          <Section
            icon={Landmark}
            title="Bankas konti"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setBankAccounts((p) => [
                    ...p,
                    blankBank(p.length === 0),
                  ])
                }
              >
                <Plus className="h-3 w-3" />
                Pievienot kontu
              </Button>
            }
          >
            {bankAccounts.length === 0 ? (
              <EmptyRow text="Nav pievienots neviens bankas konts." />
            ) : (
              <div className="space-y-2.5">
                {bankAccounts.map((b) => (
                  <BankRow
                    key={b.id}
                    account={b}
                    onChange={(patch) => updateBank(b.id, patch)}
                    onRemove={() => removeBank(b.id)}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* OVP */}
          <Section
            icon={HeartPulse}
            title="Obligātā veselības pārbaude (OVP)"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={ovpPassed}
                onChange={setOvpPassed}
                label="OVP veikta un derīga"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pēdējā pārbaude">
                <Input
                  type="date"
                  value={ovpLast}
                  onChange={(e) => setOvpLast(e.target.value)}
                />
              </Field>
              <Field label="Nākamā pārbaude (līdz)">
                <Input
                  type="date"
                  value={ovpNext}
                  onChange={(e) => setOvpNext(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Piezīmes">
              <Textarea
                value={ovpNotes}
                onChange={(e) => setOvpNotes(e.target.value)}
                placeholder="Ierobežojumi, paskaidrojumi…"
                rows={2}
              />
            </Field>
          </Section>

          {/* Safety briefing */}
          <Section
            icon={ShieldCheck}
            title="Darba drošības instruktāža (DDI)"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={safetyPassed}
                onChange={setSafetyPassed}
                label="Instruktāža veikta un derīga"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Veids">
                <Select
                  value={safetyType}
                  onValueChange={(v) =>
                    setSafetyType(v as typeof safetyType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ievada">Ievada</SelectItem>
                    <SelectItem value="darba_vietā">Darba vietā</SelectItem>
                    <SelectItem value="atkārtota">Atkārtota</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pēdējā instruktāža">
                <Input
                  type="date"
                  value={safetyLast}
                  onChange={(e) => setSafetyLast(e.target.value)}
                />
              </Field>
              <Field label="Nākamā (līdz)">
                <Input
                  type="date"
                  value={safetyNext}
                  onChange={(e) => setSafetyNext(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Piezīmes">
              <Textarea
                value={safetyNotes}
                onChange={(e) => setSafetyNotes(e.target.value)}
                rows={2}
              />
            </Field>
          </Section>

          {/* General notes */}
          <Field label="Vispārīgas piezīmes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brīvas piezīmes par darbinieku…"
              rows={2}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-graphite-100 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
            Atcelt
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid}>
            <Save className="h-3.5 w-3.5" />
            Saglabāt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sub-components
// ============================================================

function Section({
  icon: Icon,
  title,
  actions,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-graphite-900 uppercase tracking-wider">
          <Icon className="h-3.5 w-3.5 text-graphite-500" />
          {title}
        </h4>
        {actions}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-[12.5px] text-graphite-700 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-graphite-300 accent-graphite-900"
      />
      {label}
    </label>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-graphite-200 px-3 py-3 text-[12px] text-graphite-400 italic">
      {text}
    </div>
  );
}

function ContractRow({
  contract,
  onChange,
  onRemove,
}: {
  contract: EmployeeContract;
  onChange: (patch: Partial<EmployeeContract>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-graphite-200 p-3 space-y-2.5 bg-graphite-50/30">
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={contract.type}
          onValueChange={(v) => onChange({ type: v as ContractType })}
        >
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="darba_ligums">
              {contractTypeLabel("darba_ligums")}
            </SelectItem>
            <SelectItem value="uznemuma_ligums">
              {contractTypeLabel("uznemuma_ligums")}
            </SelectItem>
            <SelectItem value="autoratlidziba">
              {contractTypeLabel("autoratlidziba")}
            </SelectItem>
            <SelectItem value="pakalpojuma_ligums">
              {contractTypeLabel("pakalpojuma_ligums")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={contract.number}
          onChange={(e) => onChange({ number: e.target.value })}
          placeholder="DL-2025-001"
          className="h-8 font-mono text-[11.5px]"
        />
      </div>
      <Input
        value={contract.positionTitle}
        onChange={(e) => onChange({ positionTitle: e.target.value })}
        placeholder="Amats līgumā"
        className="h-8 text-[12.5px]"
      />
      <div className="grid grid-cols-3 gap-2">
        <Input
          type="date"
          value={contract.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
          className="h-8 text-[12.5px]"
        />
        <Input
          type="date"
          value={contract.endDate ?? ""}
          onChange={(e) => onChange({ endDate: e.target.value || undefined })}
          placeholder="Beigas (pēc izvēles)"
          className="h-8 text-[12.5px]"
        />
        <Input
          type="number"
          value={contract.baseSalary}
          onChange={(e) => onChange({ baseSalary: Number(e.target.value) })}
          placeholder="EUR/mēn"
          className="h-8 text-[12.5px] tabular"
        />
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
          Noņemt
        </Button>
      </div>
    </div>
  );
}

function BankRow({
  account,
  onChange,
  onRemove,
}: {
  account: EmployeeBankAccount;
  onChange: (patch: Partial<EmployeeBankAccount>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2.5",
        account.isPrimary
          ? "border-graphite-300 bg-white shadow-soft-xs"
          : "border-graphite-200 bg-graphite-50/30"
      )}
    >
      <div className="grid grid-cols-3 gap-2">
        <Input
          value={account.iban}
          onChange={(e) => onChange({ iban: e.target.value })}
          placeholder="LV00BANK1234567890123"
          className="h-8 col-span-2 font-mono text-[11.5px] uppercase"
        />
        <Input
          value={account.swift ?? ""}
          onChange={(e) => onChange({ swift: e.target.value })}
          placeholder="SWIFT"
          className="h-8 font-mono text-[11.5px] uppercase"
        />
      </div>
      <Input
        value={account.bankName}
        onChange={(e) => onChange({ bankName: e.target.value })}
        placeholder="Bankas nosaukums (piem. Swedbank AS)"
        className="h-8 text-[12.5px]"
      />
      <div className="flex justify-between items-center">
        <Checkbox
          checked={account.isPrimary}
          onChange={(v) => onChange({ isPrimary: v })}
          label="Galvenais konts algas izmaksai"
        />
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
          Noņemt
        </Button>
      </div>
    </div>
  );
}
