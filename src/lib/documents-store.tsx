"use client";

/**
 * DocumentsProvider — Sheets-backed with localStorage cache and
 * optimistic-UI writes. Same pattern as AssetProvider and
 * ClientsProvider.
 *
 * Public API UNCHANGED from pre-Phase-4:
 *   useDocuments() returns { documents, addDocument, updateDocument,
 *     deleteDocument, getDocument }
 *
 * Row representation: sender and recipient party objects are
 * flattened into dedicated columns server-side (sender_kind,
 * sender_id, sender_name, sender_address + same for recipient).
 * The store rehydrates them into nested objects for consumers.
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

// ============================================================
// Types (unchanged from V3)
// ============================================================

export type DocumentType = "iesniegums" | "paskaidrojums" | "zinojums";

export type PartyKind = "company" | "client" | "employee" | "manual";

export interface DocumentParty {
  kind: PartyKind;
  refId?: string;
  displayName: string;
  addressLine?: string;
}

export type DocumentLanguage = "lv" | "en";

export interface BusinessDocument {
  id: string;
  type: DocumentType;
  title: string;
  documentDate: string;
  language: DocumentLanguage;
  sender: DocumentParty;
  recipient: DocumentParty;
  body: string;
  hasPhysicalSignature: boolean;
  pdfFileName?: string;
  pdfGeneratedAt?: string;
  createdAt: string;
  /** Tracked internally for optimistic locking */
  updatedAt?: string;
}

// ============================================================
// Helpers (display)
// ============================================================

export function documentTypeLabel(
  t: DocumentType,
  lang: DocumentLanguage = "lv"
): string {
  if (lang === "en") {
    switch (t) {
      case "iesniegums":
        return "Application";
      case "paskaidrojums":
        return "Statement";
      case "zinojums":
        return "Notice";
    }
  }
  switch (t) {
    case "iesniegums":
      return "Iesniegums";
    case "paskaidrojums":
      return "Paskaidrojums";
    case "zinojums":
      return "Ziņojums";
  }
}

export function languageLabel(lang: DocumentLanguage): string {
  return lang === "lv" ? "Latviski" : "English";
}

// ============================================================
// Store
// ============================================================

interface DocumentsStore {
  documents: BusinessDocument[];
  addDocument: (data: Omit<BusinessDocument, "id" | "createdAt">) => string;
  updateDocument: (id: string, patch: Partial<BusinessDocument>) => void;
  deleteDocument: (id: string) => void;
  getDocument: (id: string) => BusinessDocument | undefined;
  loading: boolean;
}

// ============================================================
// Cache + API
// ============================================================

const CACHE_PREFIX = "workmanis:documents-cache:";

function readCache(companyId: string): BusinessDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as BusinessDocument[];
  } catch {
    return [];
  }
}

function writeCache(companyId: string, docs: BusinessDocument[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + companyId, JSON.stringify(docs));
  } catch {
    // ignore
  }
}

interface ApiDocument {
  id: string;
  type: string;
  title: string;
  documentDate: string;
  language: string;
  sender: {
    kind: string;
    refId?: string;
    displayName: string;
    addressLine?: string;
  };
  recipient: {
    kind: string;
    refId?: string;
    displayName: string;
    addressLine?: string;
  };
  body: string;
  hasPhysicalSignature: boolean;
  createdAt: string;
  updatedAt: string;
}

function apiToDocument(a: ApiDocument): BusinessDocument {
  return {
    id: a.id,
    type: a.type as DocumentType,
    title: a.title,
    documentDate: a.documentDate,
    language: a.language as DocumentLanguage,
    sender: {
      kind: a.sender.kind as PartyKind,
      refId: a.sender.refId,
      displayName: a.sender.displayName,
      addressLine: a.sender.addressLine,
    },
    recipient: {
      kind: a.recipient.kind as PartyKind,
      refId: a.recipient.refId,
      displayName: a.recipient.displayName,
      addressLine: a.recipient.addressLine,
    },
    body: a.body,
    hasPhysicalSignature: a.hasPhysicalSignature,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);

const DocumentsContext = createContext<DocumentsStore | undefined>(undefined);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const lastCompanyIdRef = useRef<string | null>(null);

  const fetchDocuments = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/documents?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`List documents failed: ${res.status}`);
      }
      const data = (await res.json()) as { documents: ApiDocument[] };
      const fresh = data.documents.map(apiToDocument);
      setDocuments(fresh);
      writeCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch documents failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setDocuments([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    const cached = readCache(companyId);
    setDocuments(cached);

    void fetchDocuments(companyId);
  }, [activeCompany, fetchDocuments]);

  // ========== Mutations ==========

  const addDocument: DocumentsStore["addDocument"] = (data) => {
    const companyId = activeCompany?.id;
    const tempId = `tmp-${uid()}`;
    const now = new Date().toISOString();
    const optimistic: BusinessDocument = {
      ...data,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    if (!companyId) {
      console.warn("addDocument called without active company");
      return tempId;
    }

    setDocuments((prev) => {
      const next = [optimistic, ...prev];
      writeCache(companyId, next);
      return next;
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/documents?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: data.type,
              language: data.language,
              subject: data.title,
              body: data.body,
              issued_date: data.documentDate,
              sender: data.sender,
              recipient: data.recipient,
              has_physical_signature: data.hasPhysicalSignature,
            }),
          }
        );
        if (!res.ok) throw new Error(`POST failed: ${res.status}`);
        const body = (await res.json()) as { document: ApiDocument };
        const server = apiToDocument(body.document);

        setDocuments((prev) => {
          const next = prev.map((d) => (d.id === tempId ? server : d));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("addDocument sync failed:", err);
        setDocuments((prev) => {
          const next = prev.filter((d) => d.id !== tempId);
          writeCache(companyId, next);
          return next;
        });
      }
    })();

    return tempId;
  };

  const updateDocument: DocumentsStore["updateDocument"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: BusinessDocument | undefined;
    setDocuments((prev) => {
      previous = prev.find((d) => d.id === id);
      const next = prev.map((d) => (d.id === id ? { ...d, ...patch } : d));
      writeCache(companyId, next);
      return next;
    });

    if (!previous) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt = previous.updatedAt ?? previous.createdAt;

    const apiBody: Record<string, unknown> = {
      expected_updated_at: expectedUpdatedAt,
    };
    if (patch.type !== undefined) apiBody.kind = patch.type;
    if (patch.language !== undefined) apiBody.language = patch.language;
    if (patch.title !== undefined) apiBody.subject = patch.title;
    if (patch.body !== undefined) apiBody.body = patch.body;
    if (patch.documentDate !== undefined)
      apiBody.issued_date = patch.documentDate;
    if (patch.sender !== undefined) apiBody.sender = patch.sender;
    if (patch.recipient !== undefined) apiBody.recipient = patch.recipient;
    if (patch.hasPhysicalSignature !== undefined)
      apiBody.has_physical_signature = patch.hasPhysicalSignature;

    void (async () => {
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiBody),
          }
        );
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
        const body = (await res.json()) as { document: ApiDocument };
        const server = apiToDocument(body.document);
        setDocuments((prev) => {
          const next = prev.map((d) => (d.id === id ? server : d));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("updateDocument sync failed:", err);
        if (previous) {
          const prevDoc = previous;
          setDocuments((prev) => {
            const next = prev.map((d) => (d.id === id ? prevDoc : d));
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const deleteDocument: DocumentsStore["deleteDocument"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let removed: BusinessDocument | undefined;
    setDocuments((prev) => {
      removed = prev.find((d) => d.id === id);
      const next = prev.filter((d) => d.id !== id);
      writeCache(companyId, next);
      return next;
    });

    if (!removed) return;
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt = removed.updatedAt ?? removed.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      } catch (err) {
        console.error("deleteDocument sync failed:", err);
        if (removed) {
          const restored = removed;
          setDocuments((prev) => {
            const next = [restored, ...prev];
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const getDocument: DocumentsStore["getDocument"] = (id) =>
    documents.find((d) => d.id === id);

  const store: DocumentsStore = {
    documents,
    addDocument,
    updateDocument,
    deleteDocument,
    getDocument,
    loading,
  };

  return (
    <DocumentsContext.Provider value={store}>
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx)
    throw new Error("useDocuments must be used inside DocumentsProvider");
  return ctx;
}
