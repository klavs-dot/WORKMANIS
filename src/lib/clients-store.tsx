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

const seedClients: Client[] = [
  {
    id: "cl-drift",
    type: "juridiska",
    name: "SIA Drift Arena",
    regNumber: "40203098712",
    vatNumber: "LV40203098712",
    legalAddress: "Liepājas iela 48, Liepāja, LV-3401",
    bankAccount: "LV12HABA0551000123456",
    country: "Latvija",
    countryCode: "LV",
    keywords: ["drift", "noma", "kartodroms", "liepāja"],
    status: "aktivs",
    notes: [
      {
        id: "n-drift-1",
        body: "Sezonas noma aprīlī — jāsaskaņo ar Jāni par grafiku.",
        createdAt: "2026-04-08T09:30:00Z",
      },
    ],
    createdAt: "2026-02-10T10:00:00Z",
  },
  {
    id: "cl-mosphera",
    type: "juridiska",
    name: "SIA Mosphera",
    regNumber: "40203145789",
    vatNumber: "LV40203145789",
    legalAddress: "Rūpnīcas iela 12, Liepāja, LV-3405",
    bankAccount: "LV45UNLA0050012345678",
    country: "Latvija",
    countryCode: "LV",
    keywords: ["mosphera", "elektromobilitāte", "nato"],
    status: "aktivs",
    notes: [],
    createdAt: "2026-02-15T10:00:00Z",
  },
  {
    id: "cl-nordic",
    type: "juridiska",
    name: "SIA Nordic Drift",
    regNumber: "40203123456",
    vatNumber: "LV40203123456",
    legalAddress: "Brīvības iela 85, Rīga, LV-1001",
    bankAccount: "LV12HABA0551012345678",
    country: "Latvija",
    countryCode: "LV",
    keywords: ["drift", "noma", "kartodroms"],
    status: "aktivs",
    notes: [],
    createdAt: "2026-03-10T10:00:00Z",
  },
  {
    id: "cl-baltijas",
    type: "juridiska",
    name: "SIA Baltijas Tehnika",
    regNumber: "40003556712",
    vatNumber: "LV40003556712",
    legalAddress: "Kurzemes prospekts 122, Rīga, LV-1067",
    bankAccount: "LV45UNLA0050012345678",
    country: "Latvija",
    countryCode: "LV",
    keywords: ["mehānika", "detaļas", "wolftrike"],
    status: "aktivs",
    notes: [
      {
        id: "n-balt-1",
        body: "Ilggadējs partneris, maksā laicīgi. Apspriesta 5% atlaide lieliem pasūtījumiem.",
        createdAt: "2026-03-20T14:00:00Z",
      },
    ],
    createdAt: "2026-03-11T10:00:00Z",
  },
  {
    id: "cl-john",
    type: "fiziska",
    name: "John Smith",
    legalAddress: "14 Acacia Avenue, London, UK",
    country: "Lielbritānija",
    countryCode: "GB",
    keywords: ["konsultācija", "uk"],
    status: "neaktivs",
    notes: [],
    createdAt: "2026-03-12T10:00:00Z",
  },
  {
    id: "cl-uab",
    type: "juridiska",
    name: "UAB Auto Parts LT",
    regNumber: "LT123456789",
    vatNumber: "LT123456789012",
    legalAddress: "Vilniaus gatvė 24, Vilnius, Lietuva",
    bankAccount: "LT121000011101001000",
    country: "Lietuva",
    countryCode: "LT",
    keywords: ["detaļas", "mosphera", "eksports"],
    status: "aktivs",
    notes: [],
    createdAt: "2026-03-13T10:00:00Z",
  },
];

const seedTemplates: InvoiceTemplate[] = [
  {
    id: "tpl-1",
    keyword: "noma",
    clientId: "cl-drift",
    language: "lv",
    reference: "Līgums Nr. DA-2026/04",
    content: {
      kind: "pakalpojums",
      description: "Drift Arena kartodroma noma · 4 h (darba dienā)",
      amount: 320.0,
      vatPercent: 21,
    },
    createdAt: "2026-03-15T10:00:00Z",
  },
  {
    id: "tpl-nordic",
    keyword: "sezonas noma",
    clientId: "cl-nordic",
    language: "lv",
    content: {
      kind: "pakalpojums",
      description: "Sezonas abonements · mēneša kartodroma noma",
      amount: 1200.0,
      vatPercent: 21,
    },
    createdAt: "2026-03-15T11:00:00Z",
  },
  {
    id: "tpl-2",
    keyword: "wolftrike detaļas",
    clientId: "cl-baltijas",
    language: "lv",
    content: {
      kind: "prece",
      lines: [
        {
          id: "pl-1",
          name: "Wolftrike rāmis WT-III",
          quantity: 1,
          unitPrice: 480,
          vatPercent: 21,
        },
        {
          id: "pl-2",
          name: "Wolftrike riteņu komplekts 10\"",
          quantity: 2,
          unitPrice: 145,
          vatPercent: 21,
        },
      ],
    },
    createdAt: "2026-03-16T10:00:00Z",
  },
  {
    id: "tpl-3",
    keyword: "konsultācija",
    clientId: "cl-john",
    language: "en",
    reference: "Project MX-2026",
    content: {
      kind: "pakalpojums",
      description: "Strategic consulting services",
      amount: 1200,
      vatPercent: 0,
    },
    createdAt: "2026-03-17T10:00:00Z",
  },
  {
    id: "tpl-4",
    keyword: "mosphera eksports",
    clientId: "cl-uab",
    language: "en",
    content: {
      kind: "prece",
      lines: [
        {
          id: "pl-3",
          name: "Mosphera 72V military platform",
          quantity: 2,
          unitPrice: 8900,
          vatPercent: 0,
        },
      ],
    },
    createdAt: "2026-03-18T10:00:00Z",
  },
];

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
