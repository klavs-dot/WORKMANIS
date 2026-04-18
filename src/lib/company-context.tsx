"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { companies } from "@/lib/mock";
import type { Company } from "@/lib/types";

const STORAGE_KEY = "workmanis:active-company";

interface CompanyContextValue {
  activeCompany: Company | null;
  setActiveCompany: (id: string) => void;
  clearActiveCompany: () => void;
  hydrated: boolean;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(
  undefined
);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && companies.find((c) => c.id === stored)) {
        setActiveId(stored);
      }
    } catch {
      // localStorage unavailable — silent
    }
    setHydrated(true);
  }, []);

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

  const activeCompany = activeId
    ? companies.find((c) => c.id === activeId) ?? null
    : null;

  return (
    <CompanyContext.Provider
      value={{ activeCompany, setActiveCompany, clearActiveCompany, hydrated }}
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
