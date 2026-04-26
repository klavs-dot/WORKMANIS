"use client";

/**
 * EmployeesProvider — Sheets-backed with localStorage cache and
 * optimistic-UI writes.
 *
 * Scope of this migration:
 *   - Employee core fields → 20_employees (one row per employee)
 *   - OVP and safety briefing → flattened into the employee row
 *     columns (ovp_passed, ovp_next_due_date, etc.)
 *   - contracts[] and bankAccounts[] → STILL held client-side
 *     only. They persist from legacy localStorage data but new
 *     ones aren't synced. Dedicated endpoints + UI for 21_contracts
 *     and 22_bank_accounts will land in a later session.
 *
 * Public API UNCHANGED — consumers don't need to know which
 * fields are persisted.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCompany } from "@/lib/company-context";
import { pushToastGlobally } from "@/lib/toast-context";

// ============================================================
// Types (unchanged from pre-Phase-4)
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
  number: string;
  startDate: string;
  endDate?: string;
  positionTitle: string;
  baseSalary: number;
  fileName?: string;
  notes?: string;
}

export interface EmployeeBankAccount {
  id: string;
  iban: string;
  bankName: string;
  swift?: string;
  isPrimary: boolean;
}

export interface OVPRecord {
  passed: boolean;
  lastCheckDate?: string;
  nextDueDate?: string;
  notes?: string;
}

export interface SafetyBriefingRecord {
  passed: boolean;
  lastBriefingDate?: string;
  nextDueDate?: string;
  briefingType?: "ievada" | "darba_vietā" | "atkārtota";
  notes?: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  personalCode?: string;
  email?: string;
  phone?: string;
  avatarColor?: string;
  status: EmploymentStatus;
  position?: string;
  startedAt?: string;
  ovp: OVPRecord;
  safetyBriefing: SafetyBriefingRecord;
  contracts: EmployeeContract[];
  bankAccounts: EmployeeBankAccount[];
  notes?: string;
  createdAt: string;
  /** Tracked internally for optimistic locking */
  updatedAt?: string;
}

interface EmployeesStore {
  employees: Employee[];
  addEmployee: (data: Omit<Employee, "id" | "createdAt">) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  getEmployee: (id: string) => Employee | undefined;
  loading: boolean;
}

// ============================================================
// Cache + API types
// ============================================================

const CACHE_PREFIX = "workmanis:employees-cache:";

function readCache(companyId: string): Employee[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as Employee[];
  } catch {
    return [];
  }
}

function writeCache(companyId: string, employees: Employee[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + companyId, JSON.stringify(employees));
  } catch {
    // ignore
  }
}

interface ApiEmployee {
  id: string;
  firstName: string;
  lastName: string;
  personalCode: string | undefined;
  email: string | undefined;
  phone: string | undefined;
  status: string;
  position: string | undefined;
  startedAt: string | undefined;
  notes: string | undefined;
  ovp: {
    passed: boolean;
    lastCheckDate: string | undefined;
    nextDueDate: string | undefined;
    notes: string | undefined;
  };
  safetyBriefing: {
    passed: boolean;
    lastBriefingDate: string | undefined;
    nextDueDate: string | undefined;
    briefingType: string | undefined;
    notes: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

function apiToEmployee(a: ApiEmployee): Employee {
  return {
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    personalCode: a.personalCode,
    email: a.email,
    phone: a.phone,
    status: (a.status as EmploymentStatus) ?? "aktivs",
    position: a.position,
    startedAt: a.startedAt,
    notes: a.notes,
    ovp: {
      passed: a.ovp.passed,
      lastCheckDate: a.ovp.lastCheckDate,
      nextDueDate: a.ovp.nextDueDate,
      notes: a.ovp.notes,
    },
    safetyBriefing: {
      passed: a.safetyBriefing.passed,
      lastBriefingDate: a.safetyBriefing.lastBriefingDate,
      nextDueDate: a.safetyBriefing.nextDueDate,
      briefingType: a.safetyBriefing
        .briefingType as SafetyBriefingRecord["briefingType"],
      notes: a.safetyBriefing.notes,
    },
    // Related records — start empty; later sessions will fetch
    // 21_contracts and 22_bank_accounts separately and merge
    contracts: [],
    bankAccounts: [],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// ============================================================
// Body builders for API
// ============================================================

function employeeToCreateBody(
  e: Omit<Employee, "id" | "createdAt">
): Record<string, unknown> {
  return {
    first_name: e.firstName,
    last_name: e.lastName,
    personal_code: e.personalCode ?? "",
    email: e.email ?? "",
    phone: e.phone ?? "",
    status: e.status,
    position: e.position ?? "",
    started_at: e.startedAt ?? "",
    notes: e.notes ?? "",
    ovp: {
      passed: e.ovp.passed,
      lastCheckDate: e.ovp.lastCheckDate,
      nextDueDate: e.ovp.nextDueDate,
      notes: e.ovp.notes,
    },
    safety_briefing: {
      passed: e.safetyBriefing.passed,
      lastBriefingDate: e.safetyBriefing.lastBriefingDate,
      nextDueDate: e.safetyBriefing.nextDueDate,
      briefingType: e.safetyBriefing.briefingType,
      notes: e.safetyBriefing.notes,
    },
  };
}

function patchToApiBody(patch: Partial<Employee>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.firstName !== undefined) body.first_name = patch.firstName;
  if (patch.lastName !== undefined) body.last_name = patch.lastName;
  if (patch.personalCode !== undefined)
    body.personal_code = patch.personalCode;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.phone !== undefined) body.phone = patch.phone;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.position !== undefined) body.position = patch.position;
  if (patch.startedAt !== undefined) body.started_at = patch.startedAt;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.ovp !== undefined) {
    body.ovp = {
      passed: patch.ovp.passed,
      lastCheckDate: patch.ovp.lastCheckDate,
      nextDueDate: patch.ovp.nextDueDate,
      notes: patch.ovp.notes,
    };
  }
  if (patch.safetyBriefing !== undefined) {
    body.safety_briefing = {
      passed: patch.safetyBriefing.passed,
      lastBriefingDate: patch.safetyBriefing.lastBriefingDate,
      nextDueDate: patch.safetyBriefing.nextDueDate,
      briefingType: patch.safetyBriefing.briefingType,
      notes: patch.safetyBriefing.notes,
    };
  }
  // contracts, bankAccounts, avatarColor silently ignored — not
  // persisted to 20_employees yet
  return body;
}

// ============================================================
// Provider
// ============================================================

const uid = () => Math.random().toString(36).slice(2, 10);

const EmployeesContext = createContext<EmployeesStore | undefined>(undefined);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  const updatedAtMapRef = useRef<Map<string, string>>(new Map());
  const lastCompanyIdRef = useRef<string | null>(null);

  const fetchFromServer = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/employees?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`List employees failed: ${res.status}`);
      const data = (await res.json()) as { employees: ApiEmployee[] };

      const newMap = new Map<string, string>();
      for (const e of data.employees) newMap.set(e.id, e.updatedAt);
      updatedAtMapRef.current = newMap;

      const fresh = data.employees.map(apiToEmployee);
      setEmployees(fresh);
      writeCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch employees failed:", err);
      pushToastGlobally("error", "Neizdevās ielādēt darbiniekus.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setEmployees([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    setEmployees(readCache(companyId));
    void fetchFromServer(companyId);
  }, [activeCompany, fetchFromServer]);

  // ========== Mutations ==========

  const addEmployee: EmployeesStore["addEmployee"] = (data) => {
    const companyId = activeCompany?.id;
    if (!companyId) {
      console.warn("addEmployee without active company");
      return;
    }

    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const optimistic: Employee = {
      ...data,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    setEmployees((prev) => {
      const next = [optimistic, ...prev];
      writeCache(companyId, next);
      return next;
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/employees?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(employeeToCreateBody(data)),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`POST failed: ${res.status} ${text}`);
        }
        const body = (await res.json()) as { employee: ApiEmployee };
        const server = apiToEmployee(body.employee);
        updatedAtMapRef.current.set(server.id, body.employee.updatedAt);

        setEmployees((prev) => {
          const next = prev.map((e) => (e.id === tempId ? server : e));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("addEmployee sync failed:", err);
        pushToastGlobally("error", "Darbinieka saglabāšana neizdevās.");
        setEmployees((prev) => {
          const next = prev.filter((e) => e.id !== tempId);
          writeCache(companyId, next);
          return next;
        });
      }
    })();
  };

  const updateEmployee: EmployeesStore["updateEmployee"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Employee | undefined;
    setEmployees((prev) => {
      previous = prev.find((e) => e.id === id);
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      writeCache(companyId, next);
      return next;
    });

    if (!previous) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtMapRef.current.get(id) ?? previous.createdAt;

    const apiBody = {
      expected_updated_at: expectedUpdatedAt,
      ...patchToApiBody(patch),
    };

    void (async () => {
      try {
        const res = await fetch(
          `/api/employees/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiBody),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`PATCH failed: ${res.status} ${text}`);
        }
        const body = (await res.json()) as { employee: ApiEmployee };
        const server = apiToEmployee(body.employee);
        updatedAtMapRef.current.set(server.id, body.employee.updatedAt);
        setEmployees((prev) => {
          const next = prev.map((e) => (e.id === id ? server : e));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("updateEmployee sync failed:", err);
        pushToastGlobally("error", "Darbinieka izmaiņas nesaglabājās.");
        if (previous) {
          const prev2 = previous;
          setEmployees((prev) => {
            const next = prev.map((e) => (e.id === id ? prev2 : e));
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const deleteEmployee: EmployeesStore["deleteEmployee"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let removed: Employee | undefined;
    setEmployees((prev) => {
      removed = prev.find((e) => e.id === id);
      const next = prev.filter((e) => e.id !== id);
      writeCache(companyId, next);
      return next;
    });

    if (!removed) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtMapRef.current.get(id) ?? removed.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/employees/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      } catch (err) {
        console.error("deleteEmployee sync failed:", err);
        pushToastGlobally("error", "Darbinieka dzēšana neizdevās.");
        if (removed) {
          const restored = removed;
          setEmployees((prev) => {
            const next = [restored, ...prev];
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const getEmployee: EmployeesStore["getEmployee"] = (id) =>
    employees.find((e) => e.id === id);

  const store: EmployeesStore = {
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployee,
    loading,
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
// Display helpers (unchanged)
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
