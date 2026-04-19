"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ============================================================
// Types
// ============================================================

export type EmploymentStatus = "aktivs" | "atvaļinājumā" | "atlaists";

export type ContractType =
  | "darba_ligums"
  | "uznemuma_ligums"
  | "autoratlidziba"
  | "pakalpojuma_ligums";

export interface EmployeeContract {
  id: string;
  type: ContractType;
  number: string; // e.g. DL-2024-001
  startDate: string; // ISO YYYY-MM-DD
  endDate?: string; // optional for indefinite contracts
  positionTitle: string;
  baseSalary: number; // EUR gross monthly (or per-task amount)
  fileName?: string; // mock file attachment
  notes?: string;
}

export interface EmployeeBankAccount {
  id: string;
  iban: string;
  bankName: string;
  swift?: string;
  isPrimary: boolean;
}

/** Mandatory occupational health check (Obligātā veselības pārbaude) */
export interface OVPRecord {
  passed: boolean;
  lastCheckDate?: string;
  nextDueDate?: string;
  notes?: string;
}

/** Workplace safety briefing (Darba drošības instruktāža) */
export interface SafetyBriefingRecord {
  passed: boolean;
  lastBriefingDate?: string;
  nextDueDate?: string;
  briefingType?: "ievada" | "darba_vietā" | "atkārtota";
  notes?: string;
}

export interface Employee {
  id: string;
  // Identity
  firstName: string;
  lastName: string;
  personalCode?: string; // LV personas kods
  email?: string;
  phone?: string;
  avatarColor?: string; // hex / token; for avatar fallback
  // Employment
  status: EmploymentStatus;
  position?: string; // current position (denormalized for quick listing)
  startedAt?: string;
  // Compliance
  ovp: OVPRecord;
  safetyBriefing: SafetyBriefingRecord;
  // Related records
  contracts: EmployeeContract[];
  bankAccounts: EmployeeBankAccount[];
  // Free notes
  notes?: string;
  createdAt: string;
}

// ============================================================
// Seed data — realistic LV employees
// ============================================================

const seedEmployees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Klāvs",
    lastName: "Bērziņš",
    personalCode: "010185-12345",
    email: "klavs@globalwolfmotors.com",
    phone: "+371 2911 1234",
    status: "aktivs",
    position: "Valdes loceklis / CEO",
    startedAt: "2021-03-01",
    ovp: {
      passed: true,
      lastCheckDate: "2025-09-12",
      nextDueDate: "2026-09-12",
      notes: "Bez ierobežojumiem.",
    },
    safetyBriefing: {
      passed: true,
      lastBriefingDate: "2025-09-12",
      nextDueDate: "2026-09-12",
      briefingType: "atkārtota",
    },
    contracts: [
      {
        id: "ct-1",
        type: "darba_ligums",
        number: "DL-2021-001",
        startDate: "2021-03-01",
        positionTitle: "Valdes loceklis",
        baseSalary: 3500,
        notes: "Beztermiņa līgums, valdes locekļa atlīdzība papildus.",
      },
    ],
    bankAccounts: [
      {
        id: "bank-1",
        iban: "LV12HABA0551012345678",
        bankName: "Swedbank AS",
        swift: "HABALV22",
        isPrimary: true,
      },
    ],
    notes: "",
    createdAt: "2021-03-01T10:00:00Z",
  },
  {
    id: "emp-2",
    firstName: "Anna",
    lastName: "Kalniņa",
    personalCode: "150691-22354",
    email: "anna.kalnina@globalwolfmotors.com",
    phone: "+371 2877 4521",
    status: "aktivs",
    position: "Mārketinga vadītāja",
    startedAt: "2023-06-15",
    ovp: {
      passed: true,
      lastCheckDate: "2025-06-20",
      nextDueDate: "2026-06-20",
    },
    safetyBriefing: {
      passed: true,
      lastBriefingDate: "2025-06-20",
      nextDueDate: "2026-06-20",
      briefingType: "darba_vietā",
    },
    contracts: [
      {
        id: "ct-2",
        type: "darba_ligums",
        number: "DL-2023-008",
        startDate: "2023-06-15",
        positionTitle: "Mārketinga vadītāja",
        baseSalary: 2200,
      },
    ],
    bankAccounts: [
      {
        id: "bank-2",
        iban: "LV67UNLA0050001234567",
        bankName: "SEB banka",
        swift: "UNLALV2X",
        isPrimary: true,
      },
    ],
    createdAt: "2023-06-15T10:00:00Z",
  },
  {
    id: "emp-3",
    firstName: "Edgars",
    lastName: "Ozols",
    personalCode: "030788-15467",
    email: "edgars.ozols@globalwolfmotors.com",
    phone: "+371 2645 7766",
    status: "aktivs",
    position: "Galvenais inženieris",
    startedAt: "2022-09-01",
    ovp: {
      passed: false,
      lastCheckDate: "2024-09-01",
      nextDueDate: "2025-09-01",
      notes: "Termiņš pārsniegts — jāveic atkārtoti.",
    },
    safetyBriefing: {
      passed: true,
      lastBriefingDate: "2025-09-15",
      nextDueDate: "2026-09-15",
      briefingType: "atkārtota",
    },
    contracts: [
      {
        id: "ct-3",
        type: "darba_ligums",
        number: "DL-2022-011",
        startDate: "2022-09-01",
        positionTitle: "Galvenais inženieris",
        baseSalary: 2800,
      },
    ],
    bankAccounts: [
      {
        id: "bank-3",
        iban: "LV45RIKO0000123456789",
        bankName: "Citadele banka",
        swift: "PARXLV22",
        isPrimary: true,
      },
    ],
    notes: "",
    createdAt: "2022-09-01T10:00:00Z",
  },
  {
    id: "emp-4",
    firstName: "Inese",
    lastName: "Liepiņa",
    personalCode: "240992-31298",
    email: "inese@driftarena.lv",
    phone: "+371 2089 3344",
    status: "atvaļinājumā",
    position: "Drift Arena administrators",
    startedAt: "2024-01-15",
    ovp: {
      passed: true,
      lastCheckDate: "2025-01-15",
      nextDueDate: "2026-01-15",
    },
    safetyBriefing: {
      passed: true,
      lastBriefingDate: "2025-01-15",
      nextDueDate: "2026-01-15",
      briefingType: "ievada",
    },
    contracts: [
      {
        id: "ct-4",
        type: "darba_ligums",
        number: "DL-2024-002",
        startDate: "2024-01-15",
        positionTitle: "Administrators",
        baseSalary: 1100,
      },
    ],
    bankAccounts: [
      {
        id: "bank-4",
        iban: "LV12HABA0551098765432",
        bankName: "Swedbank AS",
        swift: "HABALV22",
        isPrimary: true,
      },
    ],
    notes: "Atvaļinājums līdz 2026-04-30.",
    createdAt: "2024-01-15T10:00:00Z",
  },
];

// ============================================================
// Store
// ============================================================

interface EmployeesStore {
  employees: Employee[];
  addEmployee: (data: Omit<Employee, "id" | "createdAt">) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  getEmployee: (id: string) => Employee | undefined;
}

const KEY = "workmanis:employees";

function readEmployees(): Employee[] {
  if (typeof window === "undefined") return seedEmployees;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedEmployees;
    return JSON.parse(raw) as Employee[];
  } catch {
    return seedEmployees;
  }
}

function writeEmployees(list: Employee[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

const EmployeesContext = createContext<EmployeesStore | undefined>(undefined);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>(seedEmployees);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEmployees(readEmployees());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeEmployees(employees);
  }, [employees, hydrated]);

  const store: EmployeesStore = {
    employees,
    addEmployee: (data) =>
      setEmployees((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]),
    updateEmployee: (id, patch) =>
      setEmployees((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      ),
    deleteEmployee: (id) =>
      setEmployees((prev) => prev.filter((e) => e.id !== id)),
    getEmployee: (id) => employees.find((e) => e.id === id),
  };

  return (
    <EmployeesContext.Provider value={store}>
      {children}
    </EmployeesContext.Provider>
  );
}

export function useEmployees() {
  const ctx = useContext(EmployeesContext);
  if (!ctx)
    throw new Error("useEmployees must be used inside EmployeesProvider");
  return ctx;
}

// ============================================================
// Helpers
// ============================================================

export function fullName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

export function initials(e: Employee): string {
  return `${e.firstName[0] ?? ""}${e.lastName[0] ?? ""}`.toUpperCase();
}

export function contractTypeLabel(t: ContractType): string {
  switch (t) {
    case "darba_ligums":
      return "Darba līgums";
    case "uznemuma_ligums":
      return "Uzņēmuma līgums";
    case "autoratlidziba":
      return "Autoratlīdzība";
    case "pakalpojuma_ligums":
      return "Pakalpojuma līgums";
  }
}

export function statusLabel(s: EmploymentStatus): string {
  switch (s) {
    case "aktivs":
      return "Aktīvs";
    case "atvaļinājumā":
      return "Atvaļinājumā";
    case "atlaists":
      return "Atlaists";
  }
}

/** Returns true when an OVP date has already passed. */
export function isOVPOverdue(ovp: OVPRecord): boolean {
  if (!ovp.nextDueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return ovp.nextDueDate < today;
}

export function isSafetyOverdue(b: SafetyBriefingRecord): boolean {
  if (!b.nextDueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return b.nextDueDate < today;
}
