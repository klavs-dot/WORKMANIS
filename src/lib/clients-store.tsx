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
    createdAt: "2026-03-13T10:00:00Z",
  },
];

const seedTemplates: InvoiceTemplate[] = [
  {
    id: "tpl-1",
    keyword: "noma",
    clientId: "cl-nordic",
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
  addClient: (data: Omit<Client, "id" | "createdAt">) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  searchClients: (query: string) => Client[];
  getClient: (id: string) => Client | undefined;

  addTemplate: (data: Omit<InvoiceTemplate, "id" | "createdAt">) => InvoiceTemplate;
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
    setClients(readArray(CLIENTS_KEY, seedClients));
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
      };
      setClients((prev) => [newClient, ...prev]);
      return newClient;
    },

    updateClient: (id, patch) => {
      setClients((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
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

    addTemplate: (data) => {
      const newTpl: InvoiceTemplate = {
        ...data,
        id: uid(),
        createdAt: new Date().toISOString(),
      };
      setTemplates((prev) => [newTpl, ...prev]);
      return newTpl;
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
