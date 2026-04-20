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
  updateCompany: (id: string, patch: Partial<Company>) => void;
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
