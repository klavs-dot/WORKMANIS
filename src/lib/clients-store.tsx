"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  Client,
  InvoiceTemplate,
  ProductLine,
} from "./billing-types";

// ============================================================
// Seed data
// ============================================================

const seedClients: Client[] = [];

const seedTemplates: InvoiceTemplate[] = [];

// ============================================================
// Store
// ============================================================

interface ClientTemplatesStore {
  clients: Client[];
  templates: InvoiceTemplate[];
  addClient: (data: Omit<Client, "id" | "createdAt" | "notes">) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  searchClients: (query: string) => Client[];
  getClient: (id: string) => Client | undefined;

  addNote: (clientId: string, body: string) => void;
  updateNote: (clientId: string, noteId: string, body: string) => void;
  deleteNote: (clientId: string, noteId: string) => void;

  addTemplate: (data: Omit<InvoiceTemplate, "id" | "createdAt">) => InvoiceTemplate;
  updateTemplate: (id: string, patch: Partial<InvoiceTemplate>) => void;
  deleteTemplate: (id: string) => void;
  templatesForClient: (clientId: string) => InvoiceTemplate[];
}

const CLIENTS_KEY = "workmanis:clients-store";
const TEMPLATES_KEY = "workmanis:templates-store";

function readArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Migrate clients that may be missing status / notes from older versions */
function readClients(): Client[] {
  if (typeof window === "undefined") return seedClients;
  try {
    const raw = localStorage.getItem(CLIENTS_KEY);
    if (!raw) return seedClients;
    const parsed = JSON.parse(raw) as Partial<Client>[];
    return parsed.map((c) => ({
      id: c.id ?? Math.random().toString(36).slice(2, 10),
      type: (c.type ?? "juridiska") as Client["type"],
      name: c.name ?? "",
      regNumber: c.regNumber,
      vatNumber: c.vatNumber,
      legalAddress: c.legalAddress,
      bankAccount: c.bankAccount,
      country: c.country ?? "Latvija",
      countryCode: c.countryCode ?? "LV",
      keywords: c.keywords ?? [],
      status: (c.status ?? "aktivs") as Client["status"],
      notes: c.notes ?? [],
      createdAt: c.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return seedClients;
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

const ClientsContext = createContext<ClientTemplatesStore | undefined>(
  undefined
);

export function ClientsProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>(seedClients);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>(seedTemplates);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setClients(readClients());
    setTemplates(readArray(TEMPLATES_KEY, seedTemplates));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeArray(CLIENTS_KEY, clients);
  }, [clients, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeArray(TEMPLATES_KEY, templates);
  }, [templates, hydrated]);

  const store: ClientTemplatesStore = {
    clients,
    templates,

    addClient: (data) => {
      const newClient: Client = {
        ...data,
        id: uid(),
        createdAt: new Date().toISOString(),
        notes: [],
      };
      setClients((prev) => [newClient, ...prev]);
      return newClient;
    },

    updateClient: (id, patch) => {
      setClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },

    deleteClient: (id) => {
      setClients((prev) => prev.filter((c) => c.id !== id));
    },

    searchClients: (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return clients;
      return clients.filter((c) => {
        if (c.name.toLowerCase().includes(q)) return true;
        if (c.regNumber?.toLowerCase().includes(q)) return true;
        if (c.vatNumber?.toLowerCase().includes(q)) return true;
        if (c.keywords.some((k) => k.toLowerCase().includes(q))) return true;
        return false;
      });
    },

    getClient: (id) => clients.find((c) => c.id === id),

    addNote: (clientId, body) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? {
                ...c,
                notes: [
                  {
                    id: uid(),
                    body,
                    createdAt: new Date().toISOString(),
                  },
                  ...c.notes,
                ],
              }
            : c
        )
      );
    },

    updateNote: (clientId, noteId, body) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? {
                ...c,
                notes: c.notes.map((n) =>
                  n.id === noteId
                    ? { ...n, body, updatedAt: new Date().toISOString() }
                    : n
                ),
              }
            : c
        )
      );
    },

    deleteNote: (clientId, noteId) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) }
            : c
        )
      );
    },

    addTemplate: (data) => {
      const newTpl: InvoiceTemplate = {
        ...data,
        id: uid(),
        createdAt: new Date().toISOString(),
      };
      setTemplates((prev) => [newTpl, ...prev]);
      return newTpl;
    },

    updateTemplate: (id, patch) => {
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
    },

    deleteTemplate: (id) => {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },

    templatesForClient: (clientId) =>
      templates.filter((t) => t.clientId === clientId),
  };

  return (
    <ClientsContext.Provider value={store}>{children}</ClientsContext.Provider>
  );
}

export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) throw new Error("useClients must be used inside ClientsProvider");
  return ctx;
}

// ============================================================
// Helpers for product lines
// ============================================================

export function createEmptyLine(): ProductLine {
  return {
    id: uid(),
    name: "",
    quantity: 1,
    unitPrice: 0,
    vatPercent: 21,
  };
}
