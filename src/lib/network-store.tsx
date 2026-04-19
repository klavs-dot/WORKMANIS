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
} from "./network-types";

// ============================================================
// Seed data
// ============================================================

const seedDistributors: DistributorAgent[] = [
  {
    id: "dist-1",
    name: "Nordic Mobility OÜ",
    address: "Tallinna mnt 15, Tallinn, Igaunija",
    requisites:
      "Reg. nr. 12345678\nPVN nr. EE101234567\nIBAN EE382200221020145685\nSwedbank AS",
    countryCode: "EE",
    comment: "Mosphera ekskluzīvais distributors Igaunijā. Līgums līdz 2027.",
    createdAt: "2026-03-02T10:00:00Z",
  },
  {
    id: "dist-2",
    name: "Auto Baltic Partner UAB",
    address: "Savanorių pr. 123, Vilnius, Lietuva",
    requisites:
      "Reg. nr. 304567890\nPVN nr. LT100008765432\nIBAN LT121000011101001050",
    countryCode: "LT",
    comment: "Wolftrike reģionālais aģents Lietuvā, aktīvs kopš 2025.",
    createdAt: "2026-03-08T10:00:00Z",
  },
  {
    id: "dist-3",
    name: "UAE Field Agent",
    address: "Sheikh Zayed Road, Dubai, AAE",
    requisites:
      "Trade License No. DMCC-872-341\nVAT TRN 100234561700003\nEmirates NBD IBAN AE07 0331 2345 6789 0123 456",
    countryCode: "AE",
    comment: "Saruna ar NATO CoE Dubai 2026. izstādē. Potenciāls 50+ vienībām.",
    createdAt: "2026-03-15T10:00:00Z",
  },
];

const seedDemo: DemoProduct[] = [
  {
    id: "demo-1",
    name: "Mosphera Demo #1",
    location: "Liepāja, galvenais birojs · izstāžu zāle",
    comment:
      "Lietots klientu prezentācijām un NATO pārstāvju vizītēm. Pilna funkcionalitāte.",
    createdAt: "2026-02-20T10:00:00Z",
  },
  {
    id: "demo-2",
    name: "Mosphera Demo #2",
    location: "Rīga · Deutsche Bank biroja rīcībā (tests)",
    comment:
      "Divu nedēļu izmēģinājums 3. stāva drošības apsardzes vajadzībām.",
    createdAt: "2026-04-02T10:00:00Z",
  },
  {
    id: "demo-3",
    name: "Wolftrike Demo · Liepāja",
    location: "Drift Arena Liepāja",
    comment: "Sezonāls — redzams apmeklētājiem, ļauj veikt izmēģinājumus.",
    createdAt: "2026-03-10T10:00:00Z",
  },
  {
    id: "demo-4",
    name: "UGV Prototips #1",
    location: "Rūpnīcas cehs · nopietnā stadijā",
    comment:
      "Militārā UGV testēšanas posms. Nav publiski demonstrējams.",
    createdAt: "2026-03-28T10:00:00Z",
  },
];

const seedContacts: BusinessContact[] = [
  // --- Partneri ---
  {
    id: "bc-1",
    category: "partneri",
    name: "SIA Green Wire Media",
    countryCode: "LV",
    address: "Krišjāņa Valdemāra iela 32, Rīga, LV-1010",
    contactPerson: "Agnese Roze",
    email: "agnese@greenwire.lv",
    phone: "+371 2011 4455",
    comment: "Vizuālais saturs Mosphera & Wolftrike mārketingam.",
    createdAt: "2026-03-10T10:00:00Z",
  },
  {
    id: "bc-2",
    category: "partneri",
    name: "Latvijas Attīstības Finanšu Institūcija ALTUM",
    countryCode: "LV",
    address: "Doma laukums 4, Rīga, LV-1050",
    contactPerson: "Mārtiņš Vītols",
    email: "martins.vitols@altum.lv",
    phone: "+371 6700 4444",
    comment: "Finansējuma partneris inovāciju projektiem.",
    createdAt: "2026-03-11T10:00:00Z",
  },

  // --- Piegādātāji ---
  {
    id: "bc-3",
    category: "piegadataji",
    name: "SIA Tet",
    countryCode: "LV",
    address: "Dzirnavu iela 105, Rīga, LV-1011",
    contactPerson: "Klientu apkalpošana",
    email: "info@tet.lv",
    phone: "8000 8000",
    comment: "Biznesa internets, mobilie sakari un IPTV Liepājas objektā.",
    createdAt: "2026-03-12T10:00:00Z",
  },
  {
    id: "bc-4",
    category: "piegadataji",
    name: "UAB Auto Parts LT",
    countryCode: "LT",
    address: "Vilniaus g. 24, Vilnius, Lietuva",
    contactPerson: "Tomas Kazlauskas",
    email: "tomas@autoparts.lt",
    phone: "+370 5 278 9000",
    comment: "Mosphera hub motoru un transmisijas piegādātājs.",
    createdAt: "2026-03-13T10:00:00Z",
  },
  {
    id: "bc-5",
    category: "piegadataji",
    name: "WP Suspension GmbH",
    countryCode: "AT",
    address: "Munderfing 5350, Austrija",
    contactPerson: "Florian Mayer",
    email: "florian.mayer@wp-group.com",
    phone: "+43 7744 891 0",
    comment: "Amortizatori nākamās paaudzes Mosphera platformai.",
    createdAt: "2026-03-14T10:00:00Z",
  },

  // --- Servisi ---
  {
    id: "bc-6",
    category: "servisi",
    name: "Brembo Service Europe",
    countryCode: "IT",
    address: "Viale Europa 2, Stezzano (BG), Itālija",
    contactPerson: "Service Desk",
    email: "service@brembo.com",
    phone: "+39 035 605 1111",
    comment: "Bremžu sistēmu tehniskā atbalsta un garantijas serviss.",
    createdAt: "2026-03-15T10:00:00Z",
  },
  {
    id: "bc-7",
    category: "servisi",
    name: "AS Liepājas Tehniskais Serviss",
    countryCode: "LV",
    address: "Kapsēdes iela 2, Liepāja, LV-3414",
    contactPerson: "Jānis Kalniņš",
    email: "serviss@liepajatech.lv",
    phone: "+371 2645 7788",
    comment: "Drift Arena iekārtu profilaktiskā apkope.",
    createdAt: "2026-03-16T10:00:00Z",
  },
];

// ============================================================
// Store
// ============================================================

interface NetworkStore {
  distributors: DistributorAgent[];
  demoProducts: DemoProduct[];
  contacts: BusinessContact[];

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
}

const KEYS = {
  distributors: "workmanis:distributors",
  demo: "workmanis:demo-products",
  contacts: "workmanis:business-contacts",
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDistributors(readArray(KEYS.distributors, seedDistributors));
    setDemoProducts(readArray(KEYS.demo, seedDemo));
    setContacts(readArray(KEYS.contacts, seedContacts));
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

  const store: NetworkStore = {
    distributors,
    demoProducts,
    contacts,

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
