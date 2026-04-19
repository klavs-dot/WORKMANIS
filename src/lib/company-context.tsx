"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { companies as seedCompanies } from "@/lib/mock";
import type { Company } from "@/lib/types";

const STORAGE_KEY = "workmanis:active-company";
const COMPANIES_KEY = "workmanis:companies";

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (id: string) => void;
  clearActiveCompany: () => void;
  updateCompany: (id: string, patch: Partial<Company>) => void;
  hydrated: boolean;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(
  undefined
);

function readCompanies(): Company[] {
  if (typeof window === "undefined") return seedCompanies;
  try {
    const raw = window.localStorage.getItem(COMPANIES_KEY);
    if (!raw) return seedCompanies;
    return JSON.parse(raw) as Company[];
  } catch {
    return seedCompanies;
  }
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>(seedCompanies);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCompanies(readCompanies());
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveId(stored);
      }
    } catch {
      // localStorage unavailable — silent
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COMPANIES_KEY, JSON.stringify(companies));
    } catch {
      // ignore
    }
  }, [companies, hydrated]);

  const setActiveCompany = (id: string) => {
    setActiveId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  const clearActiveCompany = () => {
    setActiveId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const updateCompany = (id: string, patch: Partial<Company>) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
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
        hydrated,
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
