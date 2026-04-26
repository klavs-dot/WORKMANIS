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
import { pushToastGlobally } from "@/lib/toast-context";
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
const TEMPLATES_CACHE_PREFIX = "workmanis:templates-cache:";

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

function readTemplatesCache(companyId: string): InvoiceTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_CACHE_PREFIX + companyId);
    return raw ? (JSON.parse(raw) as InvoiceTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeTemplatesCache(companyId: string, templates: InvoiceTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      TEMPLATES_CACHE_PREFIX + companyId,
      JSON.stringify(templates)
    );
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

interface ApiTemplate {
  id: string;
  keyword: string;
  clientId: string;
  language: string;
  content: unknown;
  reference: string | undefined;
  createdAt: string;
  updatedAt: string;
}

function apiToTemplate(a: ApiTemplate): InvoiceTemplate {
  return {
    id: a.id,
    keyword: a.keyword,
    clientId: a.clientId,
    language: a.language as InvoiceTemplate["language"],
    // Cast — server stores as JSON, we trust it's a valid InvoiceContent
    content: a.content as InvoiceTemplate["content"],
    reference: a.reference,
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

  // Per-row updatedAt tracking for optimistic locking.
  // Shared across clients AND templates — id prefixes are distinct
  // ('cli-' vs 'tem-' vs 'tmp-') so no collisions.
  const updatedAtByIdRef = useRef<Map<string, string>>(new Map());

  const lastCompanyIdRef = useRef<string | null>(null);

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
      for (const c of data.clients) {
        updatedAtByIdRef.current.set(c.id, c.updatedAt);
      }

      const fresh = data.clients.map(apiToClient);
      setClients(fresh);
      writeClientsCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch clients failed:", err);
      pushToastGlobally("error", "Neizdevās ielādēt klientus.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(
        `/api/invoice-templates?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`List templates failed: ${res.status}`);
      const data = (await res.json()) as { templates: ApiTemplate[] };
      for (const t of data.templates) {
        updatedAtByIdRef.current.set(t.id, t.updatedAt);
      }
      const fresh = data.templates.map(apiToTemplate);
      setTemplates(fresh);
      writeTemplatesCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch templates failed:", err);
      pushToastGlobally("error", "Neizdevās ielādēt rēķinu šablonus.");
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setClients([]);
      setTemplates([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    // Instant hydration from per-company cache
    setClients(readClientsCache(companyId));
    setTemplates(readTemplatesCache(companyId));

    // Background fetch from Sheets
    void fetchClients(companyId);
    void fetchTemplates(companyId);
  }, [activeCompany, fetchClients, fetchTemplates]);

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
        pushToastGlobally("error", "Klienta saglabāšana neizdevās.");
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
        pushToastGlobally("error", "Klienta izmaiņas nesaglabājās.");
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
        pushToastGlobally("error", "Klienta dzēšana neizdevās.");
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
  // Template mutations — Sheets-backed via /api/invoice-templates
  // ============================================================

  const addTemplate: ClientTemplatesStore["addTemplate"] = (data) => {
    const companyId = activeCompany?.id;
    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const optimistic: InvoiceTemplate = {
      ...data,
      id: tempId,
      createdAt: now,
    };

    setTemplates((prev) => {
      const next = [optimistic, ...prev];
      if (companyId) writeTemplatesCache(companyId, next);
      return next;
    });

    if (!companyId) {
      // No active company — caller will see optimistic item but
      // it won't persist. Still return so consumers don't break.
      return optimistic;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/invoice-templates?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: data.keyword,
              client_id: data.clientId,
              language: data.language,
              content: data.content,
              reference: data.reference ?? "",
            }),
          }
        );
        if (!res.ok) throw new Error(`POST failed: ${res.status}`);
        const body = (await res.json()) as { template: ApiTemplate };
        const server = apiToTemplate(body.template);
        updatedAtByIdRef.current.set(server.id, body.template.updatedAt);

        setTemplates((prev) => {
          const next = prev.map((t) => (t.id === tempId ? server : t));
          writeTemplatesCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("addTemplate sync failed:", err);
        pushToastGlobally("error", "Šablona saglabāšana neizdevās.");
        setTemplates((prev) => {
          const next = prev.filter((t) => t.id !== tempId);
          writeTemplatesCache(companyId, next);
          return next;
        });
      }
    })();

    return optimistic;
  };

  const updateTemplate: ClientTemplatesStore["updateTemplate"] = (
    id,
    patch
  ) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: InvoiceTemplate | undefined;
    setTemplates((prev) => {
      previous = prev.find((t) => t.id === id);
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      writeTemplatesCache(companyId, next);
      return next;
    });

    if (!previous) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtByIdRef.current.get(id) ?? previous.createdAt;

    const body: Record<string, unknown> = {
      expected_updated_at: expectedUpdatedAt,
    };
    if (patch.keyword !== undefined) body.keyword = patch.keyword;
    if (patch.clientId !== undefined) body.client_id = patch.clientId;
    if (patch.language !== undefined) body.language = patch.language;
    if (patch.reference !== undefined) body.reference = patch.reference ?? "";
    if (patch.content !== undefined) body.content = patch.content;

    void (async () => {
      try {
        const res = await fetch(
          `/api/invoice-templates/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
        const json = (await res.json()) as { template: ApiTemplate };
        const server = apiToTemplate(json.template);
        updatedAtByIdRef.current.set(server.id, json.template.updatedAt);
        setTemplates((prev) => {
          const next = prev.map((t) => (t.id === id ? server : t));
          writeTemplatesCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("updateTemplate sync failed:", err);
        pushToastGlobally("error", "Šablona izmaiņas nesaglabājās.");
        if (previous) {
          const prev2 = previous;
          setTemplates((prev) => {
            const next = prev.map((t) => (t.id === id ? prev2 : t));
            writeTemplatesCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const deleteTemplate: ClientTemplatesStore["deleteTemplate"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let removed: InvoiceTemplate | undefined;
    setTemplates((prev) => {
      removed = prev.find((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      writeTemplatesCache(companyId, next);
      return next;
    });

    if (!removed) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt =
      updatedAtByIdRef.current.get(id) ?? removed.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/invoice-templates/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      } catch (err) {
        console.error("deleteTemplate sync failed:", err);
        pushToastGlobally("error", "Šablona dzēšana neizdevās.");
        if (removed) {
          const restored = removed;
          setTemplates((prev) => {
            const next = [restored, ...prev];
            writeTemplatesCache(companyId, next);
            return next;
          });
        }
      }
    })();
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
