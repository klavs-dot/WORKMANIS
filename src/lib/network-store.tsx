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
    tester: "NMPD",
    location: "Liepāja, galvenais birojs · izstāžu zāle",
    comment:
      "Lietots klientu prezentācijām un NATO pārstāvju vizītēm. Pilna funkcionalitāte.",
    createdAt: "2026-02-20T10:00:00Z",
  },
  {
    id: "demo-2",
    name: "Mosphera Demo #2",
    tester: "Policija",
    location: "Rīga · Deutsche Bank biroja rīcībā (tests)",
    comment:
      "Divu nedēļu izmēģinājums 3. stāva drošības apsardzes vajadzībām.",
    createdAt: "2026-04-02T10:00:00Z",
  },
  {
    id: "demo-3",
    name: "Wolftrike Demo · Liepāja",
    tester: "Drift Arena apmeklētāji",
    location: "Drift Arena Liepāja",
    comment: "Sezonāls — redzams apmeklētājiem, ļauj veikt izmēģinājumus.",
    createdAt: "2026-03-10T10:00:00Z",
  },
  {
    id: "demo-4",
    name: "UGV Prototips #1",
    tester: "Armija (NBS)",
    location: "Rūpnīcas cehs · nopietnā stadijā",
    comment:
      "Militārā UGV testēšanas posms. Nav publiski demonstrējams.",
    createdAt: "2026-03-28T10:00:00Z",
  },
];

const seedContacts: BusinessContact[] = [
  // --- Ražotāji ---
  {
    id: "bc-1",
    category: "razotaji",
    name: "WP Suspension GmbH",
    countryCode: "AT",
    address: "Munderfing 5350, Austrija",
    contactPerson: "Florian Mayer",
    email: "florian.mayer@wp-group.com",
    phone: "+43 7744 891 0",
    comment: "Amortizatori nākamās paaudzes Mosphera platformai.",
    createdAt: "2026-03-14T10:00:00Z",
  },
  {
    id: "bc-2",
    category: "razotaji",
    name: "Brembo S.p.A.",
    countryCode: "IT",
    address: "Viale Europa 2, Stezzano (BG), Itālija",
    contactPerson: "OEM sales",
    email: "oem@brembo.com",
    phone: "+39 035 605 2000",
    comment: "Bremžu sistēmu ražotājs — OEM piegādes Mosphera.",
    createdAt: "2026-03-15T10:00:00Z",
  },

  // --- Piegādātāji ---
  {
    id: "bc-3",
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
    id: "bc-4",
    category: "piegadataji",
    name: "SIA Nerosta Metāli",
    countryCode: "LV",
    address: "Ganību dambis 25, Rīga, LV-1005",
    contactPerson: "Artūrs Ozols",
    email: "arturs@nerostametali.lv",
    phone: "+371 2644 8899",
    comment: "Alumīnija un tērauda izejvielas rāmju ražošanai.",
    createdAt: "2026-03-14T11:00:00Z",
  },

  // --- Pakalpojumi ---
  {
    id: "bc-5",
    category: "pakalpojumi",
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
    id: "bc-6",
    category: "pakalpojumi",
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
    id: "bc-7",
    category: "pakalpojumi",
    name: "ALTUM finanšu institūcija",
    countryCode: "LV",
    address: "Doma laukums 4, Rīga, LV-1050",
    contactPerson: "Mārtiņš Vītols",
    email: "martins.vitols@altum.lv",
    phone: "+371 6700 4444",
    comment: "Finansējuma partneris inovāciju projektiem.",
    createdAt: "2026-03-11T10:00:00Z",
  },
  {
    id: "bc-8",
    category: "pakalpojumi",
    name: "AS Liepājas Tehniskais Serviss",
    countryCode: "LV",
    address: "Kapsēdes iela 2, Liepāja, LV-3414",
    contactPerson: "Jānis Kalniņš",
    email: "serviss@liepajatech.lv",
    phone: "+371 2645 7788",
    comment: "Drift Arena iekārtu profilaktiskā apkope.",
    createdAt: "2026-03-16T10:00:00Z",
  },

  // --- Loģistika ---
  {
    id: "bc-9",
    category: "logistika",
    name: "DSV Solutions Latvia",
    countryCode: "LV",
    address: "Rūpniecības iela 3, Rīga, LV-1045",
    contactPerson: "Agris Bērziņš",
    email: "agris.berzins@dsv.com",
    phone: "+371 6700 1234",
    comment: "Starptautiskā kravu pārvadāšana un muitas formalitātes.",
    createdAt: "2026-03-18T10:00:00Z",
  },
  {
    id: "bc-10",
    category: "logistika",
    name: "Kuehne+Nagel",
    countryCode: "DE",
    address: "Großer Grasbrook 11-13, Hamburg, Vācija",
    contactPerson: "Stefan Berger",
    email: "stefan.berger@kuehne-nagel.com",
    phone: "+49 40 30333 0",
    comment: "Eiropas un starptautiskā jūras loģistika.",
    createdAt: "2026-03-19T10:00:00Z",
  },
];

const seedOnlineLinks: OnlineLink[] = [
  {
    id: "ol-1",
    productName: "Mosphera LiPo battery pack 72V",
    url: "https://www.aliexpress.com/item/example-lipo-72v",
    comment: "Testa partija rūpnīcas pilotprojektam.",
    createdAt: "2026-03-25T10:00:00Z",
  },
  {
    id: "ol-2",
    productName: "Wolftrike drift trike frame jig",
    url: "https://www.ebay.com/itm/example-drift-jig",
    comment: "Metināšanas turētājs rāmja ražošanai.",
    createdAt: "2026-03-26T10:00:00Z",
  },
  {
    id: "ol-3",
    productName: "Hub motor 10-inch 3000W",
    url: "https://www.alibaba.com/product/example-hub-motor",
    comment: "Alternatīvs piegādātājs, ja TDCM piegāde aizkavējas.",
    createdAt: "2026-03-27T10:00:00Z",
  },
];

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
