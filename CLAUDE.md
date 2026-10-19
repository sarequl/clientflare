# Clientflare

Self-hosted CRM for freelancers on Cloudflare Workers. Plan: `docs/CRM plan.md`. Finance assumptions: `docs/finance-phase1-assumptions.md`. Licence: AGPL-3.0.

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
```

Secrets go in `.dev.vars` (copy from `.dev.vars.example`). Without `RESEND_API_KEY`, emails print to the terminal.

## Conventions

- **Workspaces are Better Auth organizations.** `organization` = workspace, `member` = membership, roles owner/admin/member. `session.activeOrganizationId` is the current workspace. Don't build a parallel workspaces table.
- **Every business table has `workspace_id`.** Personal finance tables (`set_aside_rules`, `allocations`, `payouts`) have `user_id` instead and are private to that user.
- **Money is integer minor units** with a `currency` column on every row. Use `parseMoney` / `formatMoney` / `shareBp` from `src/lib/money.ts`. Percents are basis points (2000 = 20%).
- **Ids** come from `newId()` in `src/lib/ids.ts` (time-ordered UUID). Better Auth uses it too via `advanced.database.generateId`.
- **Server functions** live in `src/features/<module>/server.ts`, use `.validator(zodSchema)`, and gate with `requireSession` / `requireWorkspace` / `requireRole` from `src/lib/session.ts`. Those helpers are wrapped in `createServerOnlyFn`; keep it that way or the client bundle breaks on import protection.
- **D1 has no interactive transactions.** Use `db.batch([...])` for multi-statement writes.
- **Bindings** come from `import { env } from 'cloudflare:workers'`. Never construct auth or db at module top level; use `getAuth()` / `getDb()`.
- **Passwords** are PBKDF2 via WebCrypto (`src/lib/password.ts`), not Better Auth's scrypt default. Scrypt is pure JS on Workers and exceeds the free-tier CPU budget. Don't switch it back.
- **UI**: no component library. Shared pieces in `src/components/`. No native `confirm`/`alert`; use `ConfirmDialog` from `Modal.tsx`. Route search params validated with zod. After mutations call `router.invalidate()`.
- **Dates** stored as `YYYY-MM-DD` text, timestamps as `timestamp_ms` integers.

## Gotchas

- pnpm on this machine enforces a minimum release age. Don't `pnpm add x@latest` the day a release lands; pin a day back. `onlyBuiltDependencies` lives in `pnpm-workspace.yaml`.
- `wrangler types` only sees secrets when `.dev.vars` exists. `src/env.d.ts` declares them so types never vanish.
- Deploy button needs a public GitHub repo and default resource names in `wrangler.jsonc`; Cloudflare provisions D1/R2 and rewrites the ids.

## Roadmap pointer

Phase 1 (auth, workspaces, finance) is done. Phase 2 is contacts, deals, activities, tasks, files, invoices, portal, dashboard, search. Keep the "paid invoice → income" link in mind when touching `incomes.invoice_id`.
