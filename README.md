# BillPilot

Premium Apple-iedvesmots UI prototips abonementu, rēķinu un maksājumu pārvaldībai vairāku uzņēmumu kontekstā.

Šis ir **tikai dizaina prototips** — backend, autentifikācija un reālas integrācijas vēl nav ieviestas.

## Tehnoloģijas

- **Next.js 15** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS 3.4** ar pielāgotu graphite paleti
- **shadcn/ui** primitives (uz Radix UI)
- **Framer Motion** smalkām animācijām
- **Lucide** ikonas

## Uzsākšana

```bash
npm install
npm run dev
```

Atveriet [http://localhost:3000](http://localhost:3000).

## Struktūra

```
src/
├── app/
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Dizaina tokeni
│   ├── page.tsx              # Pārskats (dashboard)
│   ├── rekini/page.tsx       # Rēķini + detail drawer
│   ├── abonementi/page.tsx   # Abonementi (grid + tabula)
│   ├── maksajumi/page.tsx    # Maksājumi + summary panelis
│   ├── piegadatji/page.tsx   # Piegādātāji + detail drawer
│   ├── uznemumi/page.tsx     # Uzņēmumu kartītes
│   ├── parskati/page.tsx     # Analītikas grafiki
│   └── iestatijumi/page.tsx  # Iestatījumi (7 sadaļas)
├── components/
│   ├── layout/               # Sidebar, Topbar, AppShell
│   ├── business/             # StatusBadge, KPICard, u.c.
│   └── ui/                   # shadcn primitives
└── lib/
    ├── utils.ts              # cn, formatCurrency, formatDate
    ├── types.ts              # TypeScript tipi
    └── mock/                 # Dummy dati (latviski)
```

## Dizaina sistēma

- **Krāsas**: primāri balts + graphite skala (50–900). Akcentiem mierīgi zaļi/dzintara/sarkani statusiem.
- **Tipogrāfija**: system sans (SF Pro Display uz macOS/iOS) ar `letter-spacing: -0.028em` lielām virsrakstiem.
- **Ēnas**: 5 līmeņi (`soft-xs` līdz `soft-xl`) ar mazu opacity, lai paliktu smalks.
- **Border-radius**: 0.75rem default, 1rem kartēm, 1.25rem modāļiem.
- **Animācijas**: tikai `fade-up` ar `cubic-bezier(0.22, 1, 0.36, 1)`, staggered ar 0.05s delay.

## Deploy uz Vercel

```bash
# No projekta saknes
git init
git add .
git commit -m "feat: BillPilot UI prototype"
git remote add origin https://github.com/klavs-dot/WORKMANIS.git
git branch -M main
git push -u origin main
```

Pēc tam Vercel:
1. `vercel.com/new` → Import `WORKMANIS`
2. Framework: Next.js (automātiski)
3. Deploy

## Zināmie ierobežojumi

- Visi dati ir mock (`src/lib/mock/*`)
- Filtri un sort darbojas tikai klienta pusē
- Nav autentifikācijas
- Formas neveic nekādas reālas darbības
- "Eksportēt SEPA", "Pievienot rēķinu" u.c. pogas ir tikai vizuāli placeholderi

## Licence

Privāts projekts. Visas tiesības paturētas.
