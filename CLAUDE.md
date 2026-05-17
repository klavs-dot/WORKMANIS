# CLAUDE.md

Project-specific guidance for Claude Code agents working on WORKMANIS.

## What this app is

A multi-company accounting / ERP / warehouse-management web app for
Latvian SMBs. Data lives in the user's own Google Drive (per-company
sheets + folders) — no central database. Built on Next.js 15 App
Router with React 19 + TypeScript + Tailwind. UI is Latvian-only.

## Auth model (canonical — confirmed by user 2026-05-18)

Three roles, two sign-in paths:

1. **Owner** — Google OAuth. Today the owner provider asks for
   `drive.file + spreadsheets` scopes; the intent per the user is that
   owner login is "identity-only" and per-company OAuth carries the
   storage scopes. The current code still uses owner-scoped Drive
   access for the per-owner `account-master` sheet. Treat the seam as
   "owner Drive scope is currently load-bearing for setup + external
   user management; changing it requires also moving account-master
   reads to the service-account path."

2. **Per-company OAuth** — separate flow at `/api/companies/oauth/*`.
   Each company has its own connected Gmail. Scopes: `drive.file
   spreadsheets gmail.readonly userinfo.email`. The company's data
   sheet + Drive folders live in THAT Gmail's Drive, not the owner's.

3. **External users** — accountant + warehouse_manager. Owner adds
   them by email + generated password in
   `02_external_users` (a tab inside the owner's account-master
   sheet). They sign in via Credentials provider; auth.ts validates
   via `validateExternalUserLogin` which uses a service account to
   read the master sheet (via `OWNER_SHEET_REGISTRY` env var mapping
   ownerEmail → masterSheetId).

External users have NO `session.accessToken`. Anything they need to
read goes through the service-account path:
- `src/lib/service-account.ts` — service-account Sheets client
- `/api/companies/list` already branches on role for service-account fallback
- `/api/companies/requisites` GET also branches

Pages they CAN'T currently use end-to-end need this same branching.

Middleware gating (`src/middleware.ts`):
- `warehouse_manager` → only `/noliktava`, `/demo-produkcija`,
  `/gatava-produkcija` pages + matching APIs
- `accountant` → everything except owner-only paths
- `owner` → everything

## Data layer

**Per-company sheet** (one `.gsheet` per company in that company's
Drive). Tabs defined in `src/lib/sheets-schema.ts`:
- `01_requisites`, `02_clients`, `03_distributors`, `04_partners`,
  `05_assets`, `06_online_links`, `10_employees`, `20_orders`,
  `30_invoices_out`, `31_invoices_in`, `32_invoice_templates`,
  `33_salaries`, `34_taxes`, `35_payments`, `36_demo_units`,
  `39_bank_statements`, `40_documents`, `50_documents`,
  `60_email_imports`, `99_audit_log`.

**Warehouse sheet** (one global "Workmanis_noliktava" .gsheet in the
owner's Drive — shared across all companies). Tabs in
`src/lib/warehouse-schema.ts`:
- `01_inventory`, `02_demo_production`, `03_finished_production`,
  `04_warehouse_employees`, `05_movements`, `99_audit_log`.

**Owner account-master sheet** (one per owner, in owner's Drive):
- `01_companies` (company registry), `02_external_users`,
  `03_company_oauth` (encrypted refresh tokens per company),
  `99_audit_log`.

## Sheets client patterns

`src/lib/sheets-client.ts` is the canonical wrapper. Always use:
- `client.list(tab)` — read all non-deleted rows
- `client.get(tab, id)` — read one
- `client.create(tab, fields)` — write new row (auto-generates `id`,
  `created_at`, `updated_at`)
- `client.update(tab, id, patch)` — optimistic-lock update (caller
  MUST pass `expected_updated_at` in the patch)
- `client.softDelete(tab, id, expectedUpdatedAt)` — sets
  `deleted_at`, doesn't remove the row

All writes append a row to `99_audit_log` automatically. Sheets API
rate-limit errors retry via `withRetry()` (2s/5s/10s backoff). Drive
calls use the same `withRetry` (imported from sheets-client) since
Drive shares Google's per-user quotas.

## Route helper pattern

To avoid copy-pasting CRUD scaffolding, two factories produce route
handlers:
- `makeListCreateHandlers` + `makeUpdateDeleteHandlers` in
  `src/lib/store-routes.ts` — for per-company tabs (requires
  `?company_id=X` query param + resolves company via OAuth tokens).
- `makeWarehouseListCreateHandlers` +
  `makeWarehouseUpdateDeleteHandlers` in `src/lib/warehouse-routes.ts`
  — for the global warehouse sheet (no company resolution).

Both factories build in `auth()`, body validation, error handling,
optimistic-lock 409s, and rowToApi mapping. Most CRUD route files are
~50 lines of config + a re-export of the factory result.

If a route needs an extra check (e.g. owner-role gating on
`/api/warehouse/employees`), wrap the factory's exports:
```ts
const handlers = makeWarehouseListCreateHandlers(...);
export async function POST(req: Request) {
  const forbidden = await requireOwner();
  if (forbidden) return forbidden;
  return handlers.POST(req);
}
```

## State management

Each domain has a Provider in `src/lib/*-store.tsx`. They follow this
pattern:
- Optimistic UI (mutate local state first, then sync to API)
- Re-fetch on company switch
- LocalStorage cache key prefixed with the company id
- `loading: boolean` exposed for skeleton states
- Errors surfaced via `pushToastGlobally`

Providers are nested in `src/app/layout.tsx`. **DO NOT add a new
provider** without checking whether an existing one already owns that
data — duplicate providers create stale-state bugs.

## UI conventions

- All copy is in Latvian. Don't add English strings without flagging.
- Money: `formatCurrency(amount)` from `src/lib/utils.ts` (EUR, lv-LV)
- Dates: `formatDate(iso)` from same file
- Use `useConfirm()` for destructive confirmations — never `window.confirm`
- Use `useToast()` for notifications — never `window.alert`
- Icon-only buttons MUST have `aria-label`
- Loading states use `<TableSkeleton rows columns />` or `<Skeleton />`
- Empty states use `<EmptyState />` from `src/components/business/empty-state.tsx`
- Native dialogs use `<Dialog>` from `src/components/ui/dialog.tsx`
- Animations respect `prefers-reduced-motion` via `<MotionConfig
  reducedMotion="user">` in the root provider tree

## AI (Anthropic Claude) usage

5 call sites:
- `src/lib/invoice-extraction.ts` — Sonnet 4.6
- `src/lib/email-scanner.ts` — Haiku 4.5 triage, Opus 4.7 extraction
- `src/lib/ai-payment-classifier.ts` — Sonnet 4.6
- `src/lib/ai-orphan-classifier.ts` — Sonnet 4.6
- `src/lib/orphan-classifier.ts` (counterparty triage) — Haiku 4.5

All five use `cache_control: { type: "ephemeral" }` on the system
prompt + tool schema for prompt caching. Latest models: Opus 4.7,
Sonnet 4.6, Haiku 4.5. If you upgrade, also remove the stale
"4.7 incompatible with tool_choice" comment.

## Common gotchas

- The package.json `name` is `"workmanis"` (was `"billpilot"` earlier).
- Owner-only mutating endpoints MUST have `if (session.role !==
  "owner") return 403` defence-in-depth alongside middleware gating.
- Don't use `window.location.reload()` for state refreshes unless you
  need every Provider to remount (rare — usually `router.refresh()`
  or store-level refresh is enough). The one place it's intentional
  is `/iestatijumi` JSON import (re-hydrating from localStorage).
- Vercel function timeouts: `maxDuration` is set per-route; bulk
  operations should track a soft deadline (e.g. `delete-all` returns
  `truncated: true` if it hits the wall, not silent partial success).
- The 99_audit_log writes are best-effort — if they fail the
  underlying operation should still succeed.

## Deploy

Vercel auto-deploys on push to `main`. No manual `vercel` command
needed. Required env vars are documented in README.md.
