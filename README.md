# WORKMANIS

Pilnvērtīgs vairāku-uzņēmumu komandcentrs grāmatvedības, lietvedības,
noliktavas un finanšu pārvaldībai. Glabā datus tieši lietotāja Google
Drive + Sheets, izmanto Claude API automātiskai dokumentu un maksājumu
klasifikācijai.

## Tehnoloģijas

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 3.4** ar pielāgotu graphite paleti
- **Radix UI** primitīvi + shadcn-stila komponentes
- **NextAuth v5** (Google OAuth + Credentials provider)
- **Google Sheets API** kā datu glabātuve
- **Google Drive API** failu glabāšanai
- **Anthropic Claude SDK** (Opus 4.7 + Sonnet 4.6 + Haiku 4.5) ar
  ephemeral prompt caching
- **bcryptjs** parolēm
- **Framer Motion** animācijām (godā `prefers-reduced-motion`)
- **Lucide** ikonas

## Funkcionalitāte

### Strādājošās lapas (16/19)

- **/** — uzņēmuma izvēle
- **/login** — Google OAuth pieslēgšanās (`ALLOWED_OWNER_EMAILS` allowlist)
- **/atbildigais**, **/gramatvediba** — ārējo lietotāju pieslēgšanās (Credentials provider)
- **/parskats** — biznesa pārskats (KPI)
- **/uznemumi** — uzņēmumu pārvaldība (CRUD + Google Drive struktūras provisioning)
- **/klienti**, **/partneri**, **/distributori** — kontaktu CRUD
- **/rekini** — rēķinu izrakstīšana + saņemšana + bankas darījumu sasaiste (7 tabs)
- **/aktivi** — uzņēmuma aktīvi (domēni, programmatūra, fizs aktīvi)
- **/darbinieki** — personāls (līgumi, OVP, bankas konti)
- **/noliktava**, **/demo**, **/gatava-produkcija** — noliktavas pārvaldība
- **/noliktavas-atbildigie** — `warehouse_manager` ārējo lietotāju vadība
- **/gramatvedibai** — eksporti, rīkojumi, ziņojumi
- **/iestatijumi** — sistēmas konfigurācija
- **/debug-log** — diagnostikas logs

### AI funkcijas

- **Rēķinu parsēšana** (PDF/image/text) — Opus 4.7 vision + Sonnet 4.6 fallback
- **Email skenēšana** — Haiku 4.5 triage → Opus 4.7 ekstrakcija
- **Maksājumu klasifikācija** — Sonnet 4.6 (kartes pirkumi: fiziski vs internetā)
- **Orphan transakciju klasifikācija** — Sonnet 4.6 + Haiku 4.5 (counterparty matching)
- Visiem AI izsaukumiem **prompt caching** ieslēgts (5-min ephemeral)

### Drošības režīms

- Owner-only API endpoints ar `session.role === "owner"` pārbaudēm
- Middleware lapas + API gating pēc role
- bcrypt paroles (cost 10) + timing-oracle hardening
- OAuth refresh-token AES-256-GCM šifrēšana
- HMAC + gzip OAuth state tokens (`v2` formāts)
- PII redact audit logos

## Uzsākšana

### Lokālā dev

```bash
npm install
vercel env pull  # pull env vars from Vercel project
npm run dev
```

Atveriet [http://localhost:3000](http://localhost:3000).

### Nepieciešamie env mainīgie

| Mainīgais | Apraksts | Nepieciešams |
|-----------|----------|--------------|
| `AUTH_SECRET` | NextAuth JWT signing + AES key derivation | ✅ |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client | ✅ |
| `ANTHROPIC_API_KEY` | Claude API piekļuve | ✅ AI funkcijām |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | base64 service account JSON | ✅ ārējiem lietotājiem |
| `OWNER_SHEET_REGISTRY` | JSON `{ownerEmail: sheetId}` | ✅ ārējiem lietotājiem |
| `ALLOWED_OWNER_EMAILS` | komatā atdalīts allowlist | ⚪ optional, fail-open |

## Deploy

Projekts ir savienots ar Vercel — push uz `main` automātiski deployo.

```bash
git add .
git commit -m "..."
git push origin main
```

## Arhitektūra

- **Data layer**: Google Sheets kā DB (per-company `*.gsheet`); service-account `account-master` ārējiem lietotājiem
- **File storage**: Google Drive (per-company folder + invoices/payments/exports apakšmapes)
- **State management**: React Context providers (`*-store.tsx`) ar optimistic UI + localStorage cache + Sheets sync
- **Auth**: NextAuth v5 ar diviem providers — Google OAuth (owner) + Credentials (accountant/warehouse_manager)
- **Middleware**: edge-runtime safe role-based page un API gating

## Licence

Privāts projekts. Visas tiesības paturētas.
