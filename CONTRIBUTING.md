# Contributing

Thanks for looking. Clientflare is small enough that one person can hold it in their head, and I'd like to keep it that way.

## Before you start

- **Bugs**: open an issue with steps to reproduce. A failing test in `tests/` is even better.
- **Features**: open an issue first for anything bigger than a few lines. The [roadmap](docs/roadmap.md) says what's planned; if it's on there, say you're taking it so nobody doubles up.
- **Small fixes** (typos, docs, obvious bugs): just send the PR.

## Running it

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate
pnpm seed:demo        # optional: a workspace full of sample data
pnpm dev              # http://localhost:3000
```

Before pushing: `pnpm build && pnpm typecheck && pnpm test`. CI runs the same three.

## How the code is laid out

[CLAUDE.md](./CLAUDE.md) is the map: module list, conventions (money in minor units, workspace scoping, server function gating), and the gotchas that will bite you on Workers. It's written for coding agents, which makes it a good onboarding doc for humans too.

The short version:

- Server functions live in `src/features/<module>/server.ts`, validate with zod, and gate with the helpers in `src/lib/session.ts`.
- Every business table has a `workspace_id`. Every query filters on it.
- Schema changes go through `pnpm db:generate`; commit the SQL in `drizzle/`.
- No component library. Shared UI is in `src/components/`.

## Pull requests

- One change per PR. Keep refactors separate from behaviour changes.
- Describe what changed and why in the description. Screenshots for anything visual.
- Keep the style of the surrounding code. No new dependencies without a reason in the PR.

## Licence

Clientflare is AGPL-3.0. By contributing you agree your contribution is licensed the same way.
