# Clientflare

Self-hosted CRM for freelancers on Cloudflare Workers. Plan: `docs/roadmap.md`. Finance assumptions: `docs/finance-phase1-assumptions.md`. Licence: AGPL-3.0. `worker-configuration.d.ts` is generated (`pnpm cf-typegen`) and committed so the deploy button needs no typegen step.

## Stack (locked)

One Worker. TanStack Start (React 19, Vite, Tailwind v4), Drizzle on D1, R2 for files, Better Auth, Resend for system mail. pnpm.

## Commands

```sh
pnpm dev              # http://localhost:3000, local D1 + R2
pnpm build && pnpm typecheck   # typecheck needs routeTree.gen.ts, so build first
pnpm db:generate      # new migration from src/db/schema → ./drizzle
pnpm db:migrate       # apply to local D1 (rm -rf .wrangler/state for a clean DB)
pnpm auth:generate    # regenerate src/db/schema/auth.ts after changing Better Auth plugins
pnpm cf-typegen       # regenerate worker-configuration.d.ts after wrangler.jsonc changes
pnpm test             # node --test over tests/*.test.ts (pure modules only, no Workers runtime)
```

Secrets go in `.dev.vars` (copy from `.dev.vars.example`). Without `RESEND_API_KEY`, emails print to the terminal.

## Conventions

- **Workspaces are Better Auth organizations.** `organization` = workspace, `member` = membership, roles owner/admin/member. `session.activeOrganizationId` is the current workspace. Don't build a parallel workspaces table.
- **Every business table has `workspace_id`.** Personal finance tables (`set_aside_rules`, `allocations`, `payouts`) have `user_id` instead and are private to that user.
- **Money is integer minor units** with a `currency` column on every row. Use `parseMoney` / `formatMoney` / `shareBp` from `src/lib/money.ts`. Percents are basis points (2000 = 20%).
- **Ids** come from `newId()` in `src/lib/ids.ts` (time-ordered UUID). Better Auth uses it too via `advanced.database.generateId`.
- **Bearer tokens**: `requireSession` checks `Authorization: Bearer cf_…` before cookies and builds a synthetic session for the token owner in the token's workspace. Anything that must work over MCP (every server function a tool calls) has to avoid Better Auth's cookie-only `auth.api.*` calls; read membership from D1 instead (`requireRole`, `getAppContext` already do).
- **Server functions** live in `src/features/<module>/server.ts`, use `.validator(zodSchema)`, and gate with `requireSession` / `requireWorkspace` / `requireRole` from `src/lib/session.ts`. Those helpers are wrapped in `createServerOnlyFn`; keep it that way or the client bundle breaks on import protection.
- **D1 has no interactive transactions.** Use `db.batch([...])` for multi-statement writes.
- **Bindings** come from `import { env } from 'cloudflare:workers'`. Never construct auth or db at module top level; use `getAuth()` / `getDb()`.
- **Passwords** are PBKDF2 via WebCrypto (`src/lib/password.ts`), not Better Auth's scrypt default. Scrypt is pure JS on Workers and exceeds the free-tier CPU budget. Don't switch it back.
- **UI**: no component library. Shared pieces in `src/components/`. No native `confirm`/`alert`; use `ConfirmDialog` from `Modal.tsx`. Route search params validated with zod. After mutations call `router.invalidate()`.
- **Dates** stored as `YYYY-MM-DD` text, timestamps as `timestamp_ms` integers.

## Modules (src/features)

finance (incomes, expenses, set-asides, payouts; `recordIncome` is the shared writer), workspaces, contacts, companies, tags, custom-fields, activities (timeline; `activityInsert` returns a statement for batching, `diffFields` builds the `updated` meta), csv, deals (default pipeline is created lazily by `ensureDefaultPipeline`; `moveDeal` owns status + ordering), tasks (`runTaskReminders` runs from the hourly cron in `src/server.ts`, 08:00 workspace-local, one digest per user per day), files (R2; upload/download are raw routes under `src/routes/api/files/`), invoices (draft → sent assigns the number; paid calls `recordIncome`; "PDF" is the print view of `/i/:token`), portal (contact magic links, `cf_portal` cookie, hashed tokens, `portalSessionFromHeaders`), search (LIKE across four tables), api-tokens (personal `cf_` bearer tokens, SHA-256 stored, one workspace each), mcp (`createMcpServer` registers tools that call the other modules' server functions; route is `src/routes/api/mcp.ts`, stateless streamable HTTP; probe it with `node scripts/mcp-probe.mjs <token>` against `pnpm dev`).

Polymorphic records: tags, custom fields, activities and files key on `(recordType, recordId)` with no FK, so each module's delete fn cleans them up in a batch. Pure logic that the UI also needs lives in `src/lib/` (`money`, `invoice-math`, `csv`) so it stays out of the server bundle.

## Gotchas

- pnpm on this machine enforces a minimum release age. Don't `pnpm add x@latest` the day a release lands; pin a day back. `allowBuilds` lives in `pnpm-workspace.yaml`.
- A `typeof getAuth` (or any server-only symbol) inside a type alias in a file the client imports keeps that import alive in the client bundle and breaks the build on `cloudflare:workers`. Derive types from server functions instead (`typeof getSession`).
- `wrangler types` only sees secrets when `.dev.vars` exists. `src/env.d.ts` declares them so types never vanish.
- `wrangler.jsonc` has no D1 `database_id` on purpose: wrangler provisions D1/R2 by name on first deploy, and the deploy button does the same.
- `APP_URL` is optional and not in `wrangler.jsonc` (set it in the dashboard if ever needed). `appOrigin()` in `src/lib/origin.ts` returns it, or the current request's origin (AsyncLocalStorage set in `src/server.ts`). Cron has no request, so it uses `workspace_settings.app_origin`, which `getAppContext` keeps current.

## Roadmap pointer

v1 (Phase 1 + Phase 2) is complete. Repo: github.com/sarequl/clientflare. See the roadmap in `docs/roadmap.md`.
