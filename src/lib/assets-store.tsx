"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
}

interface AssetStore {
  assets: Asset[];
  addAsset: (data: Omit<Asset, "id" | "createdAt">) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  getByCategory: (category: AssetCategory) => Asset[];
}

const STORAGE_KEY = "workmanis:assets-store";

const seedAssets: Asset[] = [];

function readAssets(): Asset[] {
  if (typeof window === "undefined") return seedAssets;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedAssets;
    const parsed = JSON.parse(raw) as Partial<Asset>[];
    // Migrate: ensure note field exists on older records
    return parsed.map((a) => ({
      id: a.id ?? Math.random().toString(36).slice(2, 10),
      category: (a.category ?? "citi") as AssetCategory,
      name: a.name ?? "",
      comment: a.comment ?? "",
      status: (a.status ?? "aktivs") as AssetStatus,
      note: a.note ?? "",
      noteColor: (a.noteColor ?? "pelēka") as AssetNoteColor,
      createdAt: a.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return seedAssets;
  }
}

function writeAssets(assets: Asset[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch {
    // ignore
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

const AssetContext = createContext<AssetStore | undefined>(undefined);

export function AssetProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>(seedAssets);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAssets(readAssets());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeAssets(assets);
  }, [assets, hydrated]);

  const store: AssetStore = {
    assets,
    addAsset: (data) => {
      setAssets((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]);
    },
    updateAsset: (id, patch) => {
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    deleteAsset: (id) => {
      setAssets((prev) => prev.filter((a) => a.id !== id));
    },
    getByCategory: (category) => assets.filter((a) => a.category === category),
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

// ============= Display helpers =============

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

/** Default short text used when user leaves the note empty. */
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
