"use client";

/**
 * CompanyProvider — source of truth for companies.
 *
 * Hydration order (optimistic-first UX):
 *   1. On mount: read cached list from localStorage (fast, instant UI)
 *   2. Kick off fetch to /api/companies/list (slower, authoritative)
 *   3. When fetch returns: replace cache + update state
 *
 * This gives users instant UI on navigation (cached list shows) while
 * the background fetch brings the latest state from Google Sheets.
 * If the cache is stale (e.g., company added in another tab), the
 * fetch reconciles.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Company } from "@/lib/types";

const ACTIVE_KEY = "workmanis:active-company";
const CACHE_KEY = "workmanis:companies";

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (id: string) => void;
  clearActiveCompany: () => void;
  /**
   * Update the LOCAL company state. Does NOT persist to Sheets —
   * use saveRequisites for that.
   *
   * Use this only for local-only fields like sidebar metadata
   * that don't need to round-trip through the backend, OR after
   * a successful saveRequisites call to reflect the new data
   * locally without re-fetching.
   */
  updateCompany: (id: string, patch: Partial<Company>) => void;
  /**
   * Persist requisites (legal name, addresses, bank info, logo)
   * to the company's 01_requisites sheet AND update local state
   * on success. Returns true on success, throws on error.
   *
   * This is the function the requisites modal Save button should
   * call — it does both the API write and the local update.
   */
  saveRequisites: (
    id: string,
    patch: Partial<Company>
  ) => Promise<void>;
  /**
   * Load full requisites for a company from its 01_requisites
   * sheet. Used by the modal on open to pre-populate fields with
   * the latest persisted values (rather than relying on the
   * sparse list-route data which only has name / legalName /
   * regNumber / vatNumber).
   */
  loadRequisites: (id: string) => Promise<Partial<Company>>;
  /** Replace/add a company in local state (called after successful API create) */
  upsertCompany: (company: Company) => void;
  /** Force re-fetch from Sheets */
  refresh: () => Promise<void>;
  hydrated: boolean;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(
  undefined
);

function readCache(): Company[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Company[];
  } catch {
    return [];
  }
}

function writeCache(companies: Company[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(companies));
  } catch {
    // ignore quota errors
  }
}

interface ApiCompany {
  id: string;
  slug: string;
  name: string;
  legalName: string;
  regNumber: string;
  vatNumber: string | null;
  folderId: string;
  sheetId: string;
  status: string;
}

function apiToCompany(a: ApiCompany): Company {
  return {
    id: a.id,
    name: a.name,
    legalName: a.legalName || undefined,
    regNumber: a.regNumber || undefined,
    vatNumber: a.vatNumber ?? undefined,
    folderDriveId: a.folderId,
    sheetId: a.sheetId,
    slug: a.slug,
  };
}

async function fetchCompanies(): Promise<Company[]> {
  const res = await fetch("/api/companies/list", {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`List companies failed: ${res.status}`);
  }
  const data = (await res.json()) as { companies: ApiCompany[] };
  return data.companies.map(apiToCompany);
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchCompanies();
      setCompanies(fresh);
      writeCache(fresh);
    } catch (err) {
      console.error("Refresh companies failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCache();
    setCompanies(cached);

    try {
      const stored = window.localStorage.getItem(ACTIVE_KEY);
      if (stored) setActiveId(stored);
    } catch {
      // ignore
    }

    setHydrated(true);

    void refresh();
  }, [refresh]);

  const setActiveCompany = (id: string) => {
    setActiveId(id);
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      // ignore
    }
  };

  const clearActiveCompany = () => {
    setActiveId(null);
    try {
      window.localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // ignore
    }
  };

  const updateCompany = (id: string, patch: Partial<Company>) => {
    setCompanies((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      writeCache(next);
      return next;
    });
  };

  /**
   * Persist requisites to the company's 01_requisites sheet, then
   * update local state on success. The two-step (API → local) is
   * deliberate: if the API call fails, we don't want stale-but-
   * unsynced data in localStorage that the user thinks is saved.
   */
  const saveRequisites = async (
    id: string,
    patch: Partial<Company>
  ): Promise<void> => {
    // Pick out the fields the requisites endpoint accepts.
    // Filter out undefined so we don't accidentally clear fields
    // that the caller didn't change.
    const body: Record<string, unknown> = {};
    const fields: Array<keyof Company> = [
      "name",
      "legalName",
      "regNumber",
      "vatNumber",
      "legalAddress",
      "deliveryAddress",
      "contactEmail",
      "invoiceEmail",
      "iban",
      "bankName",
      "swift",
      "phone",
      "website",
      "logoDriveId",
    ];
    for (const f of fields) {
      const v = patch[f];
      if (v !== undefined) body[f] = v;
    }

    const res = await fetch(
      `/api/companies/requisites?company_id=${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errBody = await res
        .json()
        .catch(() => ({ error: `HTTP ${res.status}` }));
      const message =
        typeof errBody?.error === "string"
          ? errBody.error
          : `Saglabāšana neizdevās (${res.status})`;
      throw new Error(message);
    }

    // Reflect locally only after successful API write
    updateCompany(id, patch);
  };

  /**
   * Fetch the full requisites for a company. Returns a partial
   * Company patch ready to merge into local state. Empty object
   * if the company has no requisites yet (first-time visit).
   */
  const loadRequisites = async (id: string): Promise<Partial<Company>> => {
    const res = await fetch(
      `/api/companies/requisites?company_id=${encodeURIComponent(id)}`,
      { method: "GET", cache: "no-store" }
    );
    if (!res.ok) {
      // Don't throw on read errors — modal can still open with
      // whatever data is already in local state. Just log.
      console.warn(`Load requisites failed: ${res.status}`);
      return {};
    }
    const data = (await res.json()) as {
      requisites: {
        name: string;
        legalName: string;
        regNumber: string;
        vatNumber: string;
        legalAddress: string;
        deliveryAddress: string;
        contactEmail: string;
        invoiceEmail: string;
        iban: string;
        bankName: string;
        swift: string;
        phone: string;
        website: string;
        logoDriveId: string;
      };
    };
    const r = data.requisites;
    // Convert empty strings to undefined so the type's optional
    // fields stay clean
    const patch: Partial<Company> = {};
    if (r.name) patch.name = r.name;
    if (r.legalName) patch.legalName = r.legalName;
    if (r.regNumber) patch.regNumber = r.regNumber;
    if (r.vatNumber) patch.vatNumber = r.vatNumber;
    if (r.legalAddress) patch.legalAddress = r.legalAddress;
    if (r.deliveryAddress) patch.deliveryAddress = r.deliveryAddress;
    if (r.contactEmail) patch.contactEmail = r.contactEmail;
    if (r.invoiceEmail) patch.invoiceEmail = r.invoiceEmail;
    if (r.iban) patch.iban = r.iban;
    if (r.bankName) patch.bankName = r.bankName;
    if (r.swift) patch.swift = r.swift;
    if (r.phone) patch.phone = r.phone;
    if (r.website) patch.website = r.website;
    if (r.logoDriveId) patch.logoDriveId = r.logoDriveId;

    // Reflect into local state so the next render sees the data
    if (Object.keys(patch).length > 0) {
      updateCompany(id, patch);
    }
    return patch;
  };

  const upsertCompany = (company: Company) => {
    setCompanies((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === company.id);
      const next =
        existingIdx >= 0
          ? prev.map((c, i) => (i === existingIdx ? company : c))
          : [...prev, company];
      writeCache(next);
      return next;
    });
  };

  const activeCompany =
    activeId && companies.find((c) => c.id === activeId)
      ? companies.find((c) => c.id === activeId) ?? null
      : null;

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        setActiveCompany,
        clearActiveCompany,
        updateCompany,
        saveRequisites,
        loadRequisites,
        upsertCompany,
        refresh,
        hydrated,
        loading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used inside CompanyProvider");
  }
  return ctx;
}
