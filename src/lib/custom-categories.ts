"use client";

/**
 * Tiny localStorage-backed store for user-defined categories on
 * Aktīvi and Noliktava pages. Each scope (e.g. 'aktivi',
 * 'noliktava') has its own list of {key, label, icon} entries
 * that the user has added.
 *
 * Why localStorage and not Sheets:
 *   - These pages already use localStorage as their primary
 *     data source (assets-store.tsx, warehouse-store.tsx).
 *   - Categories are intrinsically per-user UI preference, not
 *     business data — they don't need to be portable across
 *     accounts or backed up.
 *   - Sheets-backed categories would mean adding a new tab,
 *     migration, optimistic locking. Massive overhead for what
 *     is essentially a UI personalization feature.
 *
 * Standard tabs (Domēni, Automašīnas, Citi for Aktīvi; Krāsas,
 * Iepakojums, Citi for Noliktava) are NOT in this store —
 * they're hardcoded in the page component as the always-visible
 * baseline. Custom categories are appended after the standard
 * ones in the tab strip.
 *
 * Key choice: lowercased ASCII slug derived from the label,
 * with a numeric suffix on collision. Same as how AssetCategory
 * keys look ('domeni', 'automasinas', 'citi') so existing
 * filtering logic continues to work.
 */

import { useEffect, useState } from "react";

export interface CustomCategory {
  /** Stable slug used as filter key, never changes after creation */
  key: string;
  /** Display label, can be edited later (would be a future feature) */
  label: string;
  /** Lucide icon name, e.g. 'Building', 'Wrench' */
  iconName: string;
}

const STORAGE_PREFIX = "workmanis:custom-categories:";

function read(scope: string): CustomCategory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scope);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: ensure every entry has the required shape
    return parsed.filter(
      (c): c is CustomCategory =>
        c && typeof c.key === "string" && typeof c.label === "string"
    );
  } catch {
    return [];
  }
}

function write(scope: string, value: CustomCategory[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(value));
  } catch {
    // localStorage full or disabled — degrade gracefully (cat
    // exists in-memory until reload)
  }
}

/**
 * Generate a unique slug from the user's label. Stripped of
 * accents and non-alphanumerics; collision-resolved with a
 * numeric suffix.
 */
function slugify(label: string, existing: Set<string>): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!existing.has(base) && base.length > 0) return base;
  // Collision — try base_2, base_3, etc.
  for (let i = 2; i < 100; i++) {
    const candidate = `${base || "category"}_${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Pathological case — fall back to timestamp
  return `${base || "category"}_${Date.now()}`;
}

export function useCustomCategories(scope: string) {
  const [categories, setCategories] = useState<CustomCategory[]>([]);

  useEffect(() => {
    setCategories(read(scope));
  }, [scope]);

  const add = (label: string, iconName: string): CustomCategory => {
    const trimmed = label.trim();
    if (!trimmed) {
      throw new Error("Kategorijas nosaukums nedrīkst būt tukšs");
    }
    const existingKeys = new Set(categories.map((c) => c.key));
    const key = slugify(trimmed, existingKeys);
    const next: CustomCategory = { key, label: trimmed, iconName };
    const merged = [...categories, next];
    setCategories(merged);
    write(scope, merged);
    return next;
  };

  const remove = (key: string): void => {
    const merged = categories.filter((c) => c.key !== key);
    setCategories(merged);
    write(scope, merged);
  };

  return { categories, add, remove };
}
