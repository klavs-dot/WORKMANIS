"use client";

/**
 * AssetProvider — Sheets-backed with localStorage cache and
 * optimistic-UI writes.
 *
 * Public API intentionally unchanged from the previous localStorage-
 * only version: useAssets() returns { assets, addAsset, updateAsset,
 * deleteAsset, getByCategory }. Consumers (asset-modal, asset-tab,
 * aktivi page, notifications) don't know about the Sheets backend.
 *
 * Internals:
 *
 *   Hydration
 *     1. Mount → read cache from localStorage (instant render)
 *     2. When activeCompany changes to a real one → fetch from
 *        /api/assets?company_id=... in the background
 *     3. Replace state + cache with authoritative server data
 *
 *   Writes (optimistic)
 *     addAsset:
 *       - Generate temp id 'tmp-{random}'
 *       - Push to state immediately (UI updates before network)
 *       - POST /api/assets; on response, replace temp row with
 *         server row (now has real id from Sheets)
 *       - On error: remove temp row, log warning
 *     updateAsset:
 *       - Apply patch to state immediately
 *       - PATCH /api/assets/{id}; on error: revert
 *     deleteAsset:
 *       - Remove from state immediately
 *       - DELETE /api/assets/{id}; on error: put back
 *
 *   Cache
 *     Scoped per-company. Switching companies shows each one's
 *     assets from cache instantly, then reconciles via fetch.
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
// Types
// ============================================================

export type AssetCategory = "domeni" | "automasinas" | "citi";
export type AssetStatus = "aktivs" | "neaktivs" | "pardots" | "apkalposana";
export type AssetNoteColor = "sarkana" | "zala" | "pelēka";

export interface Asset {
  id: string;
  category: AssetCategory;
  name: string;
  comment: string;
  status: AssetStatus;
  note: string;
  noteColor: AssetNoteColor;
  /** ISO YYYY-MM-DD — if set and ≤ today, asset gets an attention flag */
  reminderDate?: string;
  createdAt: string;
  /** Tracked internally for optimistic locking on updates/deletes */
  updatedAt?: string;
}

interface AssetStore {
  assets: Asset[];
  addAsset: (data: Omit<Asset, "id" | "createdAt" | "updatedAt">) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  getByCategory: (category: AssetCategory) => Asset[];
  /** True while a background fetch is in flight */
  loading: boolean;
}

// ============================================================
// Cache
// ============================================================

const CACHE_PREFIX = "workmanis:assets-cache:";

function readCache(companyId: string): Asset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as Asset[];
  } catch {
    return [];
  }
}

function writeCache(companyId: string, assets: Asset[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + companyId, JSON.stringify(assets));
  } catch {
    // ignore quota errors
  }
}

// ============================================================
// API shape
// ============================================================

interface ApiAsset {
  id: string;
  category: string;
  name: string;
  comment: string;
  status: string;
  note: string;
  noteColor: string;
  reminderDate: string | undefined;
  createdAt: string;
  updatedAt: string;
}

function apiToAsset(a: ApiAsset): Asset {
  return {
    id: a.id,
    category: (a.category as AssetCategory) ?? "citi",
    name: a.name ?? "",
    comment: a.comment ?? "",
    status: (a.status as AssetStatus) ?? "aktivs",
    note: a.note ?? "",
    noteColor: (a.noteColor as AssetNoteColor) ?? "pelēka",
    reminderDate: a.reminderDate,
    createdAt: a.createdAt ?? "",
    updatedAt: a.updatedAt ?? "",
  };
}

// ============================================================
// Provider
// ============================================================

const AssetContext = createContext<AssetStore | undefined>(undefined);

export function AssetProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  const lastCompanyIdRef = useRef<string | null>(null);

  const fetchFromServer = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/assets?company_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`List assets failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as { assets: ApiAsset[] };
      const fresh = data.assets.map(apiToAsset);
      setAssets(fresh);
      writeCache(companyId, fresh);
    } catch (err) {
      console.error("Fetch assets failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setAssets([]);
      lastCompanyIdRef.current = null;
      return;
    }

    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    const cached = readCache(companyId);
    setAssets(cached);

    void fetchFromServer(companyId);
  }, [activeCompany, fetchFromServer]);

  // ========== Mutations ==========

  const addAsset: AssetStore["addAsset"] = (data) => {
    const companyId = activeCompany?.id;
    if (!companyId) {
      console.warn("addAsset called without active company; ignoring");
      return;
    }

    const tempId = `tmp-${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const optimistic: Asset = {
      ...data,
      id: tempId,
      createdAt: now,
      updatedAt: now,
    };

    setAssets((prev) => {
      const next = [optimistic, ...prev];
      writeCache(companyId, next);
      return next;
    });

    void (async () => {
      try {
        const res = await fetch(
          `/api/assets?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: data.category,
              name: data.name,
              comment: data.comment,
              status: data.status,
              note: data.note,
              note_color: data.noteColor,
              reminder_date: data.reminderDate ?? "",
            }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`POST failed: ${res.status} ${text}`);
        }
        const body = (await res.json()) as { asset: ApiAsset };
        const serverAsset = apiToAsset(body.asset);

        setAssets((prev) => {
          const next = prev.map((a) => (a.id === tempId ? serverAsset : a));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("addAsset server sync failed:", err);
        setAssets((prev) => {
          const next = prev.filter((a) => a.id !== tempId);
          writeCache(companyId, next);
          return next;
        });
      }
    })();
  };

  const updateAsset: AssetStore["updateAsset"] = (id, patch) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let previous: Asset | undefined;
    setAssets((prev) => {
      previous = prev.find((a) => a.id === id);
      const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
      writeCache(companyId, next);
      return next;
    });

    if (!previous) return;

    // Skip server sync for optimistic rows — addAsset response will
    // eventually replace them with real IDs. Local edits hang on
    // until then.
    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt = previous.updatedAt ?? previous.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/assets/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expected_updated_at: expectedUpdatedAt,
              ...(patch.category !== undefined && { category: patch.category }),
              ...(patch.name !== undefined && { name: patch.name }),
              ...(patch.comment !== undefined && { comment: patch.comment }),
              ...(patch.status !== undefined && { status: patch.status }),
              ...(patch.note !== undefined && { note: patch.note }),
              ...(patch.noteColor !== undefined && {
                note_color: patch.noteColor,
              }),
              ...(patch.reminderDate !== undefined && {
                reminder_date: patch.reminderDate ?? "",
              }),
            }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`PATCH failed: ${res.status} ${text}`);
        }
        const body = (await res.json()) as { asset: ApiAsset };
        const serverAsset = apiToAsset(body.asset);
        setAssets((prev) => {
          const next = prev.map((a) => (a.id === id ? serverAsset : a));
          writeCache(companyId, next);
          return next;
        });
      } catch (err) {
        console.error("updateAsset server sync failed:", err);
        if (previous) {
          const prevAsset = previous;
          setAssets((prev) => {
            const next = prev.map((a) => (a.id === id ? prevAsset : a));
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const deleteAsset: AssetStore["deleteAsset"] = (id) => {
    const companyId = activeCompany?.id;
    if (!companyId) return;

    let removed: Asset | undefined;
    setAssets((prev) => {
      removed = prev.find((a) => a.id === id);
      const next = prev.filter((a) => a.id !== id);
      writeCache(companyId, next);
      return next;
    });

    if (!removed) return;

    if (id.startsWith("tmp-")) return;

    const expectedUpdatedAt = removed.updatedAt ?? removed.createdAt;

    void (async () => {
      try {
        const res = await fetch(
          `/api/assets/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`DELETE failed: ${res.status} ${text}`);
        }
      } catch (err) {
        console.error("deleteAsset server sync failed:", err);
        if (removed) {
          const restored = removed;
          setAssets((prev) => {
            const next = [restored, ...prev];
            writeCache(companyId, next);
            return next;
          });
        }
      }
    })();
  };

  const getByCategory: AssetStore["getByCategory"] = (category) =>
    assets.filter((a) => a.category === category);

  const store: AssetStore = {
    assets,
    addAsset,
    updateAsset,
    deleteAsset,
    getByCategory,
    loading,
  };

  return (
    <AssetContext.Provider value={store}>{children}</AssetContext.Provider>
  );
}

export function useAssets() {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssets must be used inside AssetProvider");
  return ctx;
}

// ============= Display helpers (unchanged from old store) =============

export const statusLabels: Record<AssetStatus, string> = {
  aktivs: "Aktīvs",
  neaktivs: "Neaktīvs",
  pardots: "Pārdots",
  apkalposana: "Apkalpošanā",
};

export const noteColorLabels: Record<AssetNoteColor, string> = {
  sarkana: "Sarkana",
  zala: "Zaļa",
  pelēka: "Pelēka",
};

export function displayNote(note: string, color: AssetNoteColor): string {
  if (note.trim().length > 0) return note;
  return noteColorLabels[color];
}

export const noteColorClasses: Record<
  AssetNoteColor,
  { bg: string; text: string; border: string; dot: string }
> = {
  sarkana: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-100",
    dot: "bg-red-500",
  },
  zala: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-100",
    dot: "bg-emerald-500",
  },
  pelēka: {
    bg: "bg-graphite-100",
    text: "text-graphite-700",
    border: "border-graphite-200",
    dot: "bg-graphite-400",
  },
};

export const statusVariants: Record<
  AssetStatus,
  "success" | "muted" | "info" | "warning"
> = {
  aktivs: "success",
  neaktivs: "muted",
  pardots: "info",
  apkalposana: "warning",
};
