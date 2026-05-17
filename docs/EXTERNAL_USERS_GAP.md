# External-user data-access gap

**Status:** Identified 2026-05-18 by middleware audit. Needs design
decision before the fix can land.

## What works today

- `accountant` + `warehouse_manager` can sign in via Credentials
  provider (`/atbildigais`, `/gramatvediba`).
- Middleware (`src/middleware.ts`) correctly gates pages and APIs by
  role: warehouse_manager → only `/noliktava`, `/demo-produkcija`,
  `/gatava-produkcija`; accountant → everything except owner-only
  paths.
- `/api/companies/list` branches on role and uses the service-account
  path to read the owner's account-master sheet.
- `/api/companies/requisites` GET also branches on role.

## What's broken

After login, **every other data-read endpoint returns 401 for
external users** because route handlers require `session.accessToken`,
which only the owner (Google OAuth) has.

Concretely:
- `src/lib/store-routes.ts:68, 122, 216, 306` — per-company CRUD
  (payments, clients, employees, invoices, etc.) all early-return 401
  when accessToken is missing.
- `src/lib/warehouse-routes.ts:46, 78, 136, 189` — warehouse CRUD
  (inventory, demo-production, finished-production, movements, plus
  warehouse_employees) all 401 the same way.
- `src/lib/company-clients.ts:91` — the per-company OAuth refresh /
  Drive resolver that backs `/api/clients`, `/api/invoices-in`, also
  throws on missing accessToken.
- `src/app/api/owner-info/route.ts:20`,
  `src/app/api/warehouse/images/route.ts` — same pattern.

**Net effect:** accountant logs in → /parskats shell loads → every
data fetch from BillingProvider, ClientsProvider, PaymentsProvider,
etc. returns 401 → app appears empty. Same for warehouse_manager on
/noliktava.

## Why the fix is non-trivial

External-user sessions carry `ownerEmail` (which owner registered
them) but no Google credentials. To fetch data on their behalf the
server must:

1. Map `ownerEmail` → owner's `accountMaster` sheet ID — already
   available via `OWNER_SHEET_REGISTRY` env var.
2. From `accountMaster`, look up the company sheet IDs (in
   `01_companies`) — already readable by the service account.
3. **Open each company's per-company .gsheet** — this is the blocker.
   The service account does NOT have access to those sheets today.
   Each per-company sheet was created via the OWNER's per-company
   OAuth and lives in the COMPANY's Gmail's Drive. The service
   account would need to be explicitly shared on every per-company
   sheet at creation time.

Similarly for the warehouse sheet — it lives in the owner's personal
Drive and was created via owner OAuth. Service account doesn't have
access unless owner explicitly shares.

## Two viable architectural fixes

### Option A — Share-with-service-account at provisioning time

When the owner creates a company (or the warehouse sheet), the
provisioning code automatically shares the sheet with the service
account email. Then:
- `store-routes.ts` branches on role; for non-owner, swap the Sheets
  client for a service-account-authenticated one.
- `warehouse-routes.ts` does the same.
- `company-clients.ts` adds a "read-only via service account" path.

Pros: Clean separation, follows existing pattern (`/api/companies/list`
already works this way).
Cons: Every existing company sheet needs a one-time re-share with
the service account. A migration / repair script is needed.

### Option B — Owner stores a long-lived bot OAuth token

Convert one of the owner's OAuth grants into a server-side persistent
credential that external users' sessions can use. This is what some
SaaS apps do — but it's a more complex security model (server holds
refresh tokens on behalf of users) and Google may eventually
deprecate it.

Pros: Works without re-sharing per-company sheets.
Cons: Centralised secret management, more surface area.

## Recommended next steps

1. **Decide between Option A and B** with the user.
2. If Option A: write a one-off repair endpoint that walks all
   companies in account-master and shares each company's sheet with
   the service account email. Run it once after deploy.
3. Refactor `store-routes.ts`, `warehouse-routes.ts`, and
   `company-clients.ts` to branch on `session.role`:
   - `role === "owner"` → existing OAuth-token path.
   - `role !== "owner"` → service-account path with the sheet ID
     resolved from `accountMaster`.
4. Add a missing-role test page or an admin-only "Test as accountant"
   shadow flow so the gap doesn't regress.

## Until the fix lands

External-user pages render empty. The user-facing copy is also misleading
because there's no "data unavailable for your role" toast — the page
just looks broken. Consider a temporary `<RoleAccessNotice />` banner on
external-user landing pages until the data path is wired.
