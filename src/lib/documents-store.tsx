"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ============================================================
// Types
// ============================================================

export type DocumentType = "iesniegums" | "paskaidrojums" | "zinojums";

export type PartyKind =
  | "company" // active company itself
  | "client" // from clients-store
  | "employee" // from employees-store
  | "manual"; // free-text (other person/organization)

export interface DocumentParty {
  kind: PartyKind;
  /** id from the source store (client.id, employee.id, company.id) — empty for manual */
  refId?: string;
  /** Display name as cached at creation time */
  displayName: string;
  /** Optional address / extra context line */
  addressLine?: string;
}

export type DocumentLanguage = "lv" | "en";

export interface BusinessDocument {
  id: string;
  type: DocumentType;
  title: string;
  documentDate: string; // ISO YYYY-MM-DD
  language: DocumentLanguage;
  sender: DocumentParty;
  recipient: DocumentParty;
  /** Long-form body text */
  body: string;
  /** true = printed and signed by hand → no e-signature footer needed */
  hasPhysicalSignature: boolean;
  /** Generated PDF reference (mock: filename) */
  pdfFileName?: string;
  pdfGeneratedAt?: string;
  createdAt: string;
}

// ============================================================
// Helpers
// ============================================================

export function documentTypeLabel(t: DocumentType, lang: DocumentLanguage = "lv"): string {
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
}

const KEY = "workmanis:documents";

function readDocuments(): BusinessDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BusinessDocument[];
  } catch {
    return [];
  }
}

function writeDocuments(list: BusinessDocument[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

const DocumentsContext = createContext<DocumentsStore | undefined>(undefined);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDocuments(readDocuments());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeDocuments(documents);
  }, [documents, hydrated]);

  const store: DocumentsStore = {
    documents,
    addDocument: (data) => {
      const id = uid();
      setDocuments((prev) => [
        { ...data, id, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      return id;
    },
    updateDocument: (id, patch) =>
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      ),
    deleteDocument: (id) =>
      setDocuments((prev) => prev.filter((d) => d.id !== id)),
    getDocument: (id) => documents.find((d) => d.id === id),
  };

  return (
    <DocumentsContext.Provider value={store}>
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error("useDocuments must be used inside DocumentsProvider");
  return ctx;
}
