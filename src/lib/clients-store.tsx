"use client";

/**
 * ClientsProvider — Sheets-backed with localStorage cache and
 * optimistic-UI writes. Same architecture as AssetProvider.
 *
 * Public API UNCHANGED from pre-Phase-4:
 *   useClients() returns { clients, templates, addClient,
 *     updateClient, deleteClient, searchClients, getClient,
 *     addNote, updateNote, deleteNote, addTemplate,
 *     updateTemplate, deleteTemplate, templatesForClient }
 *
 * Scope of this migration:
 *   - `clients` → Sheets (10_clients tab)
 *   - `templates` → STILL localStorage (will migrate with
 *     billing-store since 34_invoice_templates is a billing
 *     table, not a clients table)
 *   - `notes` per-client → serialized JSON inside the client row's
 *     `notes` column. Note mutations (addNote, updateNote,
 *     deleteNote) work by cloning the client row, patching its
 *     notes array, and submitting a regular PATCH with the new
 *     notes. Server stores it serialized.
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
import type {
  Client,
  InvoiceTemplate,
  ProductLine,
} from "./billing-types";

// ============================================================
// Store interface (unchanged from V3)
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

  addTemplate: (
    data: Omit<InvoiceTemplate, "id" | "createdAt">
  ) => InvoiceTemplate;
  updateTemplate: (id: string, patch: Partial<InvoiceTemplate>) => void;
  deleteTemplate: (id: string) => void;
  templatesForClient: (clientId: string) => InvoiceTemplate[];

  /** True while background fetch is in flight */
  loading: boolean;
}

// ============================================================
// Cache + API types
// ============================================================

const CLIENTS_CACHE_PREFIX = "workmanis:clients-cache:";
const TEMPLATES_KEY = "workmanis:templates-store"; // still localStorage

function readClientsCache(companyId: string): Client[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CLIENTS_CACHE_PREFIX + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as Client[];
  } catch {
    return [];
  }
}

function writeClientsCache(companyId: string, clients: Client[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CLIENTS_CACHE_PREFIX + companyId,
      JSON.stringify(clients)
    );
  } catch {
    // ignore
  }
}

function readTemplates(): InvoiceTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as InvoiceTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeTemplates(templates: InvoiceTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

interface ApiClient {
  id: string;
  type: string;
  name: string;
  regNumber: string | undefined;
  vatNumber: string | undefined;
  legalAddress: string | undefined;
  bankAccount: string | undefined;
  country: string;
  countryCode: string;
  keywords: string[];
  status: string;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    updatedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

function apiToClient(a: ApiClient): Client {
  return {
    id: a.id,
    type: a.type as Client["type"],
    name: a.name,
    regNumber: a.regNumber,
    vatNumber: a.vatNumber,
    legalAddress: a.legalAddress,
    bankAccount: a.bankAccount,
    country: a.country,
    countryCode: a.countryCode,
    keywords: a.keywords,
    status: a.status as Client["status"],
    notes: a.notes,
    createdAt: a.createdAt,
  };
}

// ============================================================
// Provider
// ============================================================

const uid = () => Math.random().toString(36).slice(2, 10);

const ClientsContext = createContext<ClientTemplatesStore | undefined>(
  undefined
);

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Per-client updatedAt tracking for optimistic locking
  const updatedAtByIdRef = useRef<Map<string, string>>(new Map());

  const lastCompanyIdRef = useRef<string | null>(null);

  // Load templates from localStorage on mount (not per-company; will
  // move to per-company when billing-store migrates)
  useEffect(() => {
    setTemplates(readTemplates());
  }, []);

  useEffect(() => {
    writeTemplates(templates);
  }, [templates]);

  const fetchClients = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clients?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`List clients failed: ${res.status}`);
      }
      const data = (await res.json()) as {
        clients: (ApiClient & { updatedAt: string })[];
      };
      // Update updatedAt map
      const newMap = new Map<string, string>();
      for (const c of data.clients) {
        newMap.set(c.id, c.updatedAt);
      }
      updatedAtByIdRef.current = newMap;

      const fresh = data.clients.map(apiToClient);
      setClients(fresh);
      writeClientsCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch clients failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setClients([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    const cached = readClientsCache(companyId);
    setClients(cached);

    void fetchClients(companyId);
  }, [activeCompany, fetchClients]);

  // ============================================================
  // Client mutations
  // ============================================================

  const addClient: ClientTemplatesStore["addClient"] = (data) => {
    const companyId = activeCompany?.id;
    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const optimistic: Client = {
      ...data,
      id: tempId,
      createdAt: now,
      notes: [],
    };

    if (!companyId) {
      console.warn("addClient called without active company");
      return optimistic;
    }

    setClients((prev) => {
      const next = [optimistic, ...prev];
      writeClientsCache(companyId, next);
      return next;
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/clients?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: data.type,
              name: data.name,
              reg_number: data.regNumber ?? "",
              vat_number: data.vatNumber ?? "",
              country_code: data.countryCode,
              address: data.legalAddress ?? "",
              iban: data.bankAccount ?? "",
              keywords: data.keywords,
              notes: [],
            }),
          }
        );
        if (!res.ok) throw new Error(`POST failed: ${res.status}`);
        const body = (await res.json()) as { client: ApiClient };
        const server = apiToClient(body.client);
        updatedAtByIdRef.current.set(server.id, body.client.updatedAt);

        setClients((prev) => {
          const next = prev.map((c) => (c.id === tempId ? server : c));
          writeClientsCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("addClient sync failed:", err);
        setClients((prev) => {
          const next = prev.filter((c) => c.id !== tempId);
          writeClientsCache(companyId, next);
          return next;
        });
      }
    })();

    return optimistic;
  };

  const syncUpdate = (
    companyId: string,
    id: string,
    previous: Client,
    patch: Partial<Client>,
    notesOverride?: Client["notes"]
  ) => {
    if (id.startsWith("tmp-")) return;
    const expectedUpdatedAt =
      updatedAtByIdRef.current.get(id) ?? previous.createdAt;

    const apiBody: Record<string, unknown> = {
      expected_updated_at: expectedUpdatedAt,
    };
    if (patch.type !== undefined) apiBody.type = patch.type;
    if (patch.name !== undefined) apiBody.name = patch.name;
    if (patch.regNumber !== undefined) apiBody.reg_number = patch.regNumber;
    if (patch.vatNumber !== undefined) apiBody.vat_number = patch.vatNumber;
    if (patch.countryCode !== undefined)
      apiBody.country_code = patch.countryCode;
    if (patch.legalAddress !== undefined)
      apiBody.address = patch.legalAddress;
    if (patch.bankAccount !== undefined) apiBody.iban = patch.bankAccount;
    if (patch.keywords !== undefined) apiBody.keywords = patch.keywords;
    if (notesOverride !== undefined) apiBody.notes = notesOverride;

    void (async () => {
      try {
        const res = await fetch(
          `/api/clients/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiBody),
          }
        );
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
        const body = (await res.json()) as { client: ApiClient };
        const server = apiToClient(body.client);
        updatedAtByIdRef.current.set(server.id, body.client.updatedAt);

        setClients((prev) => {
          const next = prev.map((c) => (c.id === id ? server : c));
          writeClientsCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("updateClient sync failed:", err);
        setClients((prev) => {
          const next = prev.map((c) => (c.id === id ? previous : c));
          writeClientsCache(companyId, next);
          return next;
        });
      }
    })();
  };

  const updateClient: ClientTemplatesStore["updateClient"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Client | undefined;
    setClients((prev) => {
      previous = prev.find((c) => c.id === id);
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      writeClientsCache(companyId, next);
      return next;
    });

    if (!previous) return;
    syncUpdate(companyId, id, previous, patch);
  };

  const deleteClient: ClientTemplatesStore["deleteClient"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let removed: Client | undefined;
    setClients((prev) => {
      removed = prev.find((c) => c.id === id);
      const next = prev.filter((c) => c.id !== id);
      writeClientsCache(companyId, next);
      return next;
    });

    if (!removed) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtByIdRef.current.get(id) ?? removed.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/clients/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      } catch (err) {
        console.error("deleteClient sync failed:", err);
        if (removed) {
          const restored = removed;
          setClients((prev) => {
            const next = [restored, ...prev];
            writeClientsCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  // ============================================================
  // Notes mutations — PATCH the parent client with new notes array
  // ============================================================

  const addNote: ClientTemplatesStore["addNote"] = (clientId, body) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Client | undefined;
    const newNote = {
      id: uid(),
      body,
      createdAt: new Date().toISOString(),
    };

    setClients((prev) => {
      previous = prev.find((c) => c.id === clientId);
      const next = prev.map((c) =>
        c.id === clientId ? { ...c, notes: [newNote, ...c.notes] } : c
      );
      writeClientsCache(companyId, next);
      return next;
    });

    if (!previous) return;
    syncUpdate(
      companyId,
      clientId,
      previous,
      {},
      [newNote, ...previous.notes]
    );
  };

  const updateNote: ClientTemplatesStore["updateNote"] = (
    clientId,
    noteId,
    body
  ) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Client | undefined;
    let newNotes: Client["notes"] = [];
    setClients((prev) => {
      previous = prev.find((c) => c.id === clientId);
      if (previous) {
        newNotes = previous.notes.map((n) =>
          n.id === noteId
            ? { ...n, body, updatedAt: new Date().toISOString() }
            : n
        );
      }
      const next = prev.map((c) =>
        c.id === clientId ? { ...c, notes: newNotes } : c
      );
      writeClientsCache(companyId, next);
      return next;
    });

    if (!previous) return;
    syncUpdate(companyId, clientId, previous, {}, newNotes);
  };

  const deleteNote: ClientTemplatesStore["deleteNote"] = (clientId, noteId) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Client | undefined;
    let newNotes: Client["notes"] = [];
    setClients((prev) => {
      previous = prev.find((c) => c.id === clientId);
      if (previous) {
        newNotes = previous.notes.filter((n) => n.id !== noteId);
      }
      const next = prev.map((c) =>
        c.id === clientId ? { ...c, notes: newNotes } : c
      );
      writeClientsCache(companyId, next);
      return next;
    });

    if (!previous) return;
    syncUpdate(companyId, clientId, previous, {}, newNotes);
  };

  // ============================================================
  // Template mutations — STILL localStorage
  // ============================================================

  const addTemplate: ClientTemplatesStore["addTemplate"] = (data) => {
    const newTpl: InvoiceTemplate = {
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
    };
    setTemplates((prev) => [newTpl, ...prev]);
    return newTpl;
  };

  const updateTemplate: ClientTemplatesStore["updateTemplate"] = (
    id,
    patch
  ) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  };

  const deleteTemplate: ClientTemplatesStore["deleteTemplate"] = (id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const templatesForClient: ClientTemplatesStore["templatesForClient"] = (
    clientId
  ) => templates.filter((t) => t.clientId === clientId);

  // ============================================================
  // Search + lookup
  // ============================================================

  const searchClients: ClientTemplatesStore["searchClients"] = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.regNumber?.toLowerCase().includes(q)) return true;
      if (c.vatNumber?.toLowerCase().includes(q)) return true;
      if (c.keywords.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  };

  const getClient: ClientTemplatesStore["getClient"] = (id) =>
    clients.find((c) => c.id === id);

  const store: ClientTemplatesStore = {
    clients,
    templates,
    addClient,
    updateClient,
    deleteClient,
    searchClients,
    getClient,
    addNote,
    updateNote,
    deleteNote,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    templatesForClient,
    loading,
  };

  return (
    <ClientsContext.Provider value={store}>
      {children}
    </ClientsContext.Provider>
  );
}

export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) throw new Error("useClients must be used inside ClientsProvider");
  return ctx;
}

// ============================================================
// Product line helper (unchanged)
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
