# Overnight progress 2026-05-17 → 2026-05-18

The user went to sleep with the instruction to continue improving
everything visible. Below is a recap of what landed, what was found,
and what's left.

## Commits landed (newest first)

| Commit | What |
|--------|------|
| `f373925` | a11y: meaningful alt text on warehouse item images |
| `67a5dfc` | foundation: getOwnerSettingViaServiceAccount helper |
| `20d3951` | ux: skeleton state for /noliktavas-atbildigie |
| `e85e3ff` | cleanup: remove BillPilot-era unused types + status badges |
| `88f28a9` | docs + ci + schema-cleanup + external-user honesty |
| `91e6130` | mobile polish: toast safe-area, dialog gutters, package rename |
| `b309aa4` | polish: error boundary + 404 + viewport + readme + lint |

## What was confirmed working

- **TypeScript:** 0 errors (`npm run typecheck`)
- **ESLint:** 0 errors, 0 warnings (`npm run lint`)
- **Build:** passes (`npx next build`), bundle sizes look healthy
- **CI:** new GitHub Actions workflow runs typecheck + lint on push/PR

## Findings from the three audits

### Sheets schema audit
- 0 critical issues, 9 medium, 6 low
- 6 stale tabs flagged with `// DEFERRED` comments
  (`21_contracts`, `22_bank_accounts`, `23_compliance`,
  `32_pn_akti`, `33_delivery_notes`, `38_accounting_meta`)
- Boolean encoding standardised on `04_warehouse_employees.active`
  → `"TRUE"/"FALSE"` (matches majority of schema)
- Money fields all use `*_cents` integer — clean
- All snake_case — clean
- Universal audit columns (`id`, `created_at`, `updated_at`,
  `deleted_at`) auto-prepended via `provisioning.ts` — no missing
- Verdict: production-ready

### Middleware role audit (BIGGEST FINDING)
- 🚨 **accountant + warehouse_manager are half-built shells**
- They can sign in, see /parskats shell, but every per-company /
  warehouse data endpoint returns 401 because route handlers
  require `session.accessToken` (only owner has it via Google OAuth)
- Only `/api/companies/list` and `/api/companies/requisites` GET
  currently branch on role + use service account
- Documented in `docs/EXTERNAL_USERS_GAP.md` with two architectural
  options (share-with-service-account vs. server-held bot OAuth)
- Added `<ExternalUserBanner />` so the UX is honest until the
  refactor lands ("datu ielāde notiek caur owner pārlūku, ja redzi
  tukšus sarakstus, sazinies ar uzņēmuma īpašnieku")
- Added `getOwnerSettingViaServiceAccount` foundation helper +
  `WAREHOUSE_SHEET_SETTING_KEY` constant to `service-account.ts`
  so the data-storage primitive is ready when the route refactor
  lands

### Integration audit (already reported earlier in the evening)
- No new findings overnight

## What the user needs to decide

1. **The big one — external user data access:** see
   `docs/EXTERNAL_USERS_GAP.md`. Choose between Option A
   (share-with-service-account at provisioning time, + repair endpoint
   for existing sheets) and Option B (server-held bot OAuth).
   Recommendation: Option A — it follows the existing pattern from
   `/api/companies/list` and avoids holding owner refresh tokens
   server-side.

2. **Owner Google OAuth scope:** the user described the owner login
   as "identity-only" (no Drive/Sheets), but the current code asks
   for `drive.file + spreadsheets`. The owner's Drive scope is
   load-bearing because account-master + warehouse sheet live in
   owner's Drive. To match the described model literally, those
   would need to move to a service-account-shared pattern. Lower
   priority than the external-user gap.

3. **3 "Drīzumā" tabs in /gramatvedibai** (Ceļa zīmes, Līgumi, Citi):
   user previously said leave as placeholders. No change overnight.

## What's intentionally untouched

- `warehouse-routes.ts` / `store-routes.ts` / `company-clients.ts`
  refactors. These are the actual external-user fix but they need
  the user available to test the OAuth side effects + service
  account sharing — too risky for unattended overnight work.
- Settings page (1700-line) split. Big refactor, deferred.
- react-hook-form + zod migration for forms. Big refactor, deferred.
- ZIP export real implementation. Needs design decision (which
  formats? per-period? per-category? PDF + CSV + JSON?).

## Files added overnight

- `CLAUDE.md` — guidance file for future Claude Code agents
- `docs/EXTERNAL_USERS_GAP.md` — the external-user architectural gap
- `docs/OVERNIGHT_2026-05-18.md` — this file
- `.github/workflows/ci.yml` — typecheck + lint on push/PR
- `src/app/error.tsx` — global error boundary
- `src/app/not-found.tsx` — localised 404
- `src/components/layout/external-user-banner.tsx` — honest banner
  for accountant / warehouse_manager sessions

## Files removed

- `src/app/demo/_old-demo-units.tsx.bak` (14.6 KB dead code)
- `src/components/business/status-badge.tsx` (98 lines, unused)
- ~95 lines of BillPilot-era types from `src/lib/types.ts`
