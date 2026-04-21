"use client";

/**
 * NetworkProvider — Sheets-backed, 4 entity types in parallel.
 *
 * Unlike single-entity stores (assets, clients, documents), this
 * one manages four distinct tables:
 *   - distributors   → 11_distributors
 *   - demoProducts   → 14_demo_units
 *   - contacts       → 15_partners
 *   - onlineLinks    → 13_online_links
 *
 * Each has its own cache key, its own fetch, and its own set of
 * mutations. But they share the same optimistic-UI pattern.
 *
 * Public API UNCHANGED. Existing consumers (partneri page, etc.)
 * don't need code changes.
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
  BusinessContact,
  BusinessContactCategory,
  DemoProduct,
  DistributorAgent,
  OnlineLink,
} from "./network-types";

// ============================================================
// Store interface (unchanged)
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

  loading: boolean;
}

// ============================================================
// Cache helpers (shared across entities)
// ============================================================

const CACHE_PREFIX_DIST = "workmanis:distributors-cache:";
const CACHE_PREFIX_DEMO = "workmanis:demo-cache:";
const CACHE_PREFIX_CONTACTS = "workmanis:contacts-cache:";
const CACHE_PREFIX_LINKS = "workmanis:online-links-cache:";

function readCache<T>(prefix: string, companyId: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(prefix + companyId);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function writeCache<T>(prefix: string, companyId: string, items: T[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(prefix + companyId, JSON.stringify(items));
  } catch {
    // ignore
  }
}

// ============================================================
// API shape types
// ============================================================

interface ApiDistributor {
  id: string;
  name: string;
  countryCode: string;
  address: string;
  requisites: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiDemo {
  id: string;
  name: string;
  tester: string;
  location: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiPartner {
  id: string;
  category: string;
  name: string;
  countryCode: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiLink {
  id: string;
  productName: string;
  url: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

// Server-side types are richer (they include updatedAt). We map
// them to the legacy client type shape which doesn't include it.

function apiToDistributor(a: ApiDistributor): DistributorAgent {
  return {
    id: a.id,
    name: a.name,
    address: a.address,
    requisites: a.requisites,
    countryCode: a.countryCode,
    comment: a.comment,
    createdAt: a.createdAt,
  };
}

function apiToDemo(a: ApiDemo): DemoProduct {
  return {
    id: a.id,
    name: a.name,
    tester: a.tester,
    location: a.location,
    comment: a.comment,
    createdAt: a.createdAt,
  };
}

function apiToContact(a: ApiPartner): BusinessContact {
  return {
    id: a.id,
    category: a.category as BusinessContactCategory,
    name: a.name,
    countryCode: a.countryCode,
    address: a.address,
    contactPerson: a.contactPerson,
    email: a.email,
    phone: a.phone,
    comment: a.comment,
    createdAt: a.createdAt,
  };
}

function apiToLink(a: ApiLink): OnlineLink {
  return {
    id: a.id,
    productName: a.productName,
    url: a.url,
    comment: a.comment,
    createdAt: a.createdAt,
  };
}

// ============================================================
// Provider
// ============================================================

const uid = () => Math.random().toString(36).slice(2, 10);

const NetworkContext = createContext<NetworkStore | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();

  const [distributors, setDistributors] = useState<DistributorAgent[]>([]);
  const [demoProducts, setDemoProducts] = useState<DemoProduct[]>([]);
  const [contacts, setContacts] = useState<BusinessContact[]>([]);
  const [onlineLinks, setOnlineLinks] = useState<OnlineLink[]>([]);
  const [loading, setLoading] = useState(false);

  // Per-entity updatedAt tracking for optimistic locking
  const updatedAtMapRef = useRef<Map<string, string>>(new Map());
  const lastCompanyIdRef = useRef<string | null>(null);

  const fetchAll = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
      const qs = `company_id=${encodeURIComponent(companyId)}`;
      const [distRes, demoRes, contactRes, linkRes] = await Promise.all([
        fetch(`/api/distributors?${qs}`, { cache: "no-store" }),
        fetch(`/api/demo-units?${qs}`, { cache: "no-store" }),
        fetch(`/api/partners?${qs}`, { cache: "no-store" }),
        fetch(`/api/online-links?${qs}`, { cache: "no-store" }),
      ]);

      const newUpdatedAt = new Map<string, string>();

      if (distRes.ok) {
        const data = (await distRes.json()) as {
          distributors: ApiDistributor[];
        };
        for (const d of data.distributors) newUpdatedAt.set(d.id, d.updatedAt);
        const mapped = data.distributors.map(apiToDistributor);
        setDistributors(mapped);
        writeCache(CACHE_PREFIX_DIST, companyId, mapped);
      }

      if (demoRes.ok) {
        const data = (await demoRes.json()) as { demoProducts: ApiDemo[] };
        for (const d of data.demoProducts) newUpdatedAt.set(d.id, d.updatedAt);
        const mapped = data.demoProducts.map(apiToDemo);
        setDemoProducts(mapped);
        writeCache(CACHE_PREFIX_DEMO, companyId, mapped);
      }

      if (contactRes.ok) {
        const data = (await contactRes.json()) as { partners: ApiPartner[] };
        for (const p of data.partners) newUpdatedAt.set(p.id, p.updatedAt);
        const mapped = data.partners.map(apiToContact);
        setContacts(mapped);
        writeCache(CACHE_PREFIX_CONTACTS, companyId, mapped);
      }

      if (linkRes.ok) {
        const data = (await linkRes.json()) as { onlineLinks: ApiLink[] };
        for (const l of data.onlineLinks) newUpdatedAt.set(l.id, l.updatedAt);
        const mapped = data.onlineLinks.map(apiToLink);
        setOnlineLinks(mapped);
        writeCache(CACHE_PREFIX_LINKS, companyId, mapped);
      }

      updatedAtMapRef.current = newUpdatedAt;
    } catch (err) {
      console.error("Fetch network failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const companyId = activeCompany?.id ?? null;
    if (!companyId) {
      setDistributors([]);
      setDemoProducts([]);
      setContacts([]);
      setOnlineLinks([]);
      lastCompanyIdRef.current = null;
      return;
    }
    if (companyId === lastCompanyIdRef.current) return;
    lastCompanyIdRef.current = companyId;

    setDistributors(readCache<DistributorAgent>(CACHE_PREFIX_DIST, companyId));
    setDemoProducts(readCache<DemoProduct>(CACHE_PREFIX_DEMO, companyId));
    setContacts(readCache<BusinessContact>(CACHE_PREFIX_CONTACTS, companyId));
    setOnlineLinks(readCache<OnlineLink>(CACHE_PREFIX_LINKS, companyId));

    void fetchAll(companyId);
  }, [activeCompany, fetchAll]);

  // ============================================================
  // Generic CRUD factory — one closure per entity type
  // ============================================================

  /**
   * Build a matching set of add/update/delete functions for a
   * given entity. This is the same optimistic-UI pattern from
   * assets-store, repeated four times — factoring it out reduces
   * ~300 lines of near-duplicate code down to the 4 arg calls
   * below.
   */
  function makeCrud<T extends { id: string; createdAt: string }, TApi>(config: {
    cachePrefix: string;
    apiPath: string;
    state: T[];
    setState: React.Dispatch<React.SetStateAction<T[]>>;
    toApiBody: (data: Partial<T>) => Record<string, unknown>;
    apiToLocal: (a: TApi) => T;
    responseKey: string; // 'distributor', 'demoProduct', etc.
    responseListKey: string; // optional, for GET reconciliation (unused)
  }) {
    void config.responseListKey;

    const add = (data: Omit<T, "id" | "createdAt">) => {
      const companyId = activeCompany?.id;
      if (!companyId) {
        console.warn(`${config.apiPath} add without active company`);
        return;
      }

      const tempId = `tmp-${uid()}`;
      const now = new Date().toISOString();
      const optimistic = { ...data, id: tempId, createdAt: now } as T;

      config.setState((prev) => {
        const next = [optimistic, ...prev];
        writeCache(config.cachePrefix, companyId, next);
        return next;
      });

      void (async () => {
        try {
          const res = await fetch(
            `${config.apiPath}?company_id=${encodeURIComponent(companyId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config.toApiBody(data as Partial<T>)),
            }
          );
          if (!res.ok) throw new Error(`POST failed: ${res.status}`);
          const json = (await res.json()) as Record<string, TApi>;
          const apiItem = json[config.responseKey];
          if (!apiItem) throw new Error("Server did not return item");
          const server = config.apiToLocal(apiItem);
          updatedAtMapRef.current.set(
            server.id,
            (apiItem as unknown as { updatedAt: string }).updatedAt
          );

          config.setState((prev) => {
            const next = prev.map((x) => (x.id === tempId ? server : x));
            writeCache(config.cachePrefix, companyId, next);
            return next;
          });
        } catch (err) {
          console.error(`${config.apiPath} add sync failed:`, err);
          config.setState((prev) => {
            const next = prev.filter((x) => x.id !== tempId);
            writeCache(config.cachePrefix, companyId, next);
            return next;
          });
        }
      })();
    };

    const update = (id: string, patch: Partial<T>) => {
      const companyId = activeCompany?.id;
      if (!companyId) return;

      let previous: T | undefined;
      config.setState((prev) => {
        previous = prev.find((x) => x.id === id);
        const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x));
        writeCache(config.cachePrefix, companyId, next);
        return next;
      });

      if (!previous) return;
      if (id.startsWith("tmp-")) return;

      const expectedUpdatedAt =
        updatedAtMapRef.current.get(id) ?? previous.createdAt;

      const apiBody = {
        expected_updated_at: expectedUpdatedAt,
        ...config.toApiBody(patch),
      };

      void (async () => {
        try {
          const res = await fetch(
            `${config.apiPath}/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(apiBody),
            }
          );
          if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
          const json = (await res.json()) as Record<string, TApi>;
          const apiItem = json[config.responseKey];
          if (!apiItem) return;
          const server = config.apiToLocal(apiItem);
          updatedAtMapRef.current.set(
            server.id,
            (apiItem as unknown as { updatedAt: string }).updatedAt
          );

          config.setState((prev) => {
            const next = prev.map((x) => (x.id === id ? server : x));
            writeCache(config.cachePrefix, companyId, next);
            return next;
          });
        } catch (err) {
          console.error(`${config.apiPath} update sync failed:`, err);
          if (previous) {
            const prev2 = previous;
            config.setState((prev) => {
              const next = prev.map((x) => (x.id === id ? prev2 : x));
              writeCache(config.cachePrefix, companyId, next);
              return next;
            });
          }
        }
      })();
    };

    const remove = (id: string) => {
      const companyId = activeCompany?.id;
      if (!companyId) return;

      let removed: T | undefined;
      config.setState((prev) => {
        removed = prev.find((x) => x.id === id);
        const next = prev.filter((x) => x.id !== id);
        writeCache(config.cachePrefix, companyId, next);
        return next;
      });

      if (!removed) return;
      if (id.startsWith("tmp-")) return;

      const expectedUpdatedAt =
        updatedAtMapRef.current.get(id) ?? removed.createdAt;

      void (async () => {
        try {
          const res = await fetch(
            `${config.apiPath}/${encodeURIComponent(id)}?company_id=${encodeURIComponent(companyId)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
            { method: "DELETE" }
          );
          if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
        } catch (err) {
          console.error(`${config.apiPath} delete sync failed:`, err);
          if (removed) {
            const restored = removed;
            config.setState((prev) => {
              const next = [restored, ...prev];
              writeCache(config.cachePrefix, companyId, next);
              return next;
            });
          }
        }
      })();
    };

    return { add, update, remove };
  }

  // ============================================================
  // Wire up CRUD for each entity
  // ============================================================

  const distCrud = makeCrud<DistributorAgent, ApiDistributor>({
    cachePrefix: CACHE_PREFIX_DIST,
    apiPath: "/api/distributors",
    state: distributors,
    setState: setDistributors,
    responseKey: "distributor",
    responseListKey: "distributors",
    apiToLocal: apiToDistributor,
    toApiBody: (data) => ({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.countryCode !== undefined && { country_code: data.countryCode }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.requisites !== undefined && { requisites: data.requisites }),
      ...(data.comment !== undefined && { comment: data.comment }),
    }),
  });

  const demoCrud = makeCrud<DemoProduct, ApiDemo>({
    cachePrefix: CACHE_PREFIX_DEMO,
    apiPath: "/api/demo-units",
    state: demoProducts,
    setState: setDemoProducts,
    responseKey: "demoProduct",
    responseListKey: "demoProducts",
    apiToLocal: apiToDemo,
    toApiBody: (data) => ({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.tester !== undefined && { tester: data.tester }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.comment !== undefined && { comment: data.comment }),
    }),
  });

  const contactCrud = makeCrud<BusinessContact, ApiPartner>({
    cachePrefix: CACHE_PREFIX_CONTACTS,
    apiPath: "/api/partners",
    state: contacts,
    setState: setContacts,
    responseKey: "partner",
    responseListKey: "partners",
    apiToLocal: apiToContact,
    toApiBody: (data) => ({
      ...(data.category !== undefined && { category: data.category }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.countryCode !== undefined && { country_code: data.countryCode }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.contactPerson !== undefined && {
        contact_person: data.contactPerson,
      }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.comment !== undefined && { comment: data.comment }),
    }),
  });

  const linkCrud = makeCrud<OnlineLink, ApiLink>({
    cachePrefix: CACHE_PREFIX_LINKS,
    apiPath: "/api/online-links",
    state: onlineLinks,
    setState: setOnlineLinks,
    responseKey: "onlineLink",
    responseListKey: "onlineLinks",
    apiToLocal: apiToLink,
    toApiBody: (data) => ({
      ...(data.productName !== undefined && { product_name: data.productName }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.comment !== undefined && { comment: data.comment }),
    }),
  });

  const store: NetworkStore = {
    distributors,
    demoProducts,
    contacts,
    onlineLinks,

    addDistributor: distCrud.add,
    updateDistributor: distCrud.update,
    deleteDistributor: distCrud.remove,
    getDistributor: (id) => distributors.find((d) => d.id === id),

    addDemo: demoCrud.add,
    updateDemo: demoCrud.update,
    deleteDemo: demoCrud.remove,
    getDemo: (id) => demoProducts.find((d) => d.id === id),

    addContact: contactCrud.add,
    updateContact: contactCrud.update,
    deleteContact: contactCrud.remove,
    getContact: (id) => contacts.find((c) => c.id === id),
    contactsByCategory: (cat) => contacts.filter((c) => c.category === cat),

    addOnlineLink: linkCrud.add,
    updateOnlineLink: linkCrud.update,
    deleteOnlineLink: linkCrud.remove,

    loading,
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
