"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  BusinessContact,
  BusinessContactCategory,
  DemoProduct,
  DistributorAgent,
  OnlineLink,
} from "./network-types";

// ============================================================
// Seed data
// ============================================================

const seedDistributors: DistributorAgent[] = [];

const seedDemo: DemoProduct[] = [];

const seedContacts: BusinessContact[] = [];

const seedOnlineLinks: OnlineLink[] = [];

// ============================================================
// Store
// ============================================================

interface NetworkStore {
  distributors: DistributorAgent[];
  demoProducts: DemoProduct[];
  contacts: BusinessContact[];
  onlineLinks: OnlineLink[];

  addDistributor: (data: Omit<DistributorAgent, "id" | "createdAt">) => void;
  updateDistributor: (id: string, patch: Partial<DistributorAgent>) => void;
  deleteDistributor: (id: string) => void;
  getDistributor: (id: string) => DistributorAgent | undefined;

  addDemo: (data: Omit<DemoProduct, "id" | "createdAt">) => void;
  updateDemo: (id: string, patch: Partial<DemoProduct>) => void;
  deleteDemo: (id: string) => void;
  getDemo: (id: string) => DemoProduct | undefined;

  addContact: (data: Omit<BusinessContact, "id" | "createdAt">) => void;
  updateContact: (id: string, patch: Partial<BusinessContact>) => void;
  deleteContact: (id: string) => void;
  getContact: (id: string) => BusinessContact | undefined;
  contactsByCategory: (cat: BusinessContactCategory) => BusinessContact[];

  addOnlineLink: (data: Omit<OnlineLink, "id" | "createdAt">) => void;
  updateOnlineLink: (id: string, patch: Partial<OnlineLink>) => void;
  deleteOnlineLink: (id: string) => void;
}

const KEYS = {
  distributors: "workmanis:distributors",
  demo: "workmanis:demo-products",
  contacts: "workmanis:business-contacts",
  onlineLinks: "workmanis:online-links",
};

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

/** Migrate older BusinessContact records that used the legacy
 *  categories ('partneri' / 'servisi'). Map them to the new
 *  taxonomy so nothing disappears from the user's store. */
function readContacts(): BusinessContact[] {
  if (typeof window === "undefined") return seedContacts;
  try {
    const raw = localStorage.getItem(KEYS.contacts);
    if (!raw) return seedContacts;
    const parsed = JSON.parse(raw) as (BusinessContact & {
      category: string;
    })[];
    return parsed.map((c) => {
      let category = c.category as BusinessContactCategory;
      // Legacy remaps
      if ((c.category as string) === "partneri") category = "razotaji";
      if ((c.category as string) === "servisi") category = "pakalpojumi";
      return { ...c, category } as BusinessContact;
    });
  } catch {
    return seedContacts;
  }
}

/** Migrate older DemoProduct records that don't yet have `tester`. */
function readDemoProducts(): DemoProduct[] {
  if (typeof window === "undefined") return seedDemo;
  try {
    const raw = localStorage.getItem(KEYS.demo);
    if (!raw) return seedDemo;
    const parsed = JSON.parse(raw) as Partial<DemoProduct>[];
    return parsed.map((d) => ({
      id: d.id ?? Math.random().toString(36).slice(2, 10),
      name: d.name ?? "",
      tester: d.tester ?? "",
      location: d.location ?? "",
      comment: d.comment ?? "",
      createdAt: d.createdAt ?? new Date().toISOString(),
    }));
  } catch {
    return seedDemo;
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

const NetworkContext = createContext<NetworkStore | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [distributors, setDistributors] =
    useState<DistributorAgent[]>(seedDistributors);
  const [demoProducts, setDemoProducts] = useState<DemoProduct[]>(seedDemo);
  const [contacts, setContacts] = useState<BusinessContact[]>(seedContacts);
  const [onlineLinks, setOnlineLinks] =
    useState<OnlineLink[]>(seedOnlineLinks);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDistributors(readArray(KEYS.distributors, seedDistributors));
    setDemoProducts(readDemoProducts());
    setContacts(readContacts());
    setOnlineLinks(readArray(KEYS.onlineLinks, seedOnlineLinks));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeArray(KEYS.distributors, distributors);
  }, [distributors, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeArray(KEYS.demo, demoProducts);
  }, [demoProducts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeArray(KEYS.contacts, contacts);
  }, [contacts, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeArray(KEYS.onlineLinks, onlineLinks);
  }, [onlineLinks, hydrated]);

  const store: NetworkStore = {
    distributors,
    demoProducts,
    contacts,
    onlineLinks,

    addDistributor: (data) =>
      setDistributors((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]),
    updateDistributor: (id, patch) =>
      setDistributors((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      ),
    deleteDistributor: (id) =>
      setDistributors((prev) => prev.filter((d) => d.id !== id)),
    getDistributor: (id) => distributors.find((d) => d.id === id),

    addDemo: (data) =>
      setDemoProducts((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]),
    updateDemo: (id, patch) =>
      setDemoProducts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      ),
    deleteDemo: (id) =>
      setDemoProducts((prev) => prev.filter((d) => d.id !== id)),
    getDemo: (id) => demoProducts.find((d) => d.id === id),

    addContact: (data) =>
      setContacts((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]),
    updateContact: (id, patch) =>
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      ),
    deleteContact: (id) =>
      setContacts((prev) => prev.filter((c) => c.id !== id)),
    getContact: (id) => contacts.find((c) => c.id === id),
    contactsByCategory: (cat) => contacts.filter((c) => c.category === cat),

    addOnlineLink: (data) =>
      setOnlineLinks((prev) => [
        { ...data, id: uid(), createdAt: new Date().toISOString() },
        ...prev,
      ]),
    updateOnlineLink: (id, patch) =>
      setOnlineLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
      ),
    deleteOnlineLink: (id) =>
      setOnlineLinks((prev) => prev.filter((l) => l.id !== id)),
  };

  return (
    <NetworkContext.Provider value={store}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside NetworkProvider");
  return ctx;
}
