# Open-source Cloudflare CRM: product plan

Oct 19, 2026 · @Sarequl Basar

A free, self-hosted CRM for indie hackers, freelancers and small agencies that anyone can deploy to their own Cloudflare account in one click. The finance module has its own detailed spec: CRM Finance Module: Income, Expenses & Set-Asides

## Product

The CRM covers the whole client lifecycle for a small service business, from lead to paid invoice, and runs free on the user's own Cloudflare account.

**Who it's for:** indie hackers, freelancers and small agencies (1 to about 15 people). First real user: the author, for personal freelance work.

**What the market shows:** paid freelancer tools win by joining the steps into one flow, not by having more features. HoneyBook, Bonsai and Moxie all sell the chain lead → proposal → contract → invoice → payment, plus a client portal ([Dupple](https://dupple.com/learn/best-crm-for-freelancers), [Agiled](https://agiled.app/blog/best-crm-for-freelancers)). The leading open-source CRM, Twenty, is strong on flexible data (custom objects, kanban and table views, roles, workflows, email and calendar sync, API) but is a sales CRM, not a freelancer business tool, and does not run on Cloudflare ([Twenty](https://github.com/twentyhq/twenty), [heise](https://heise.de/-10461613)).

**Principles:**

- **Free and self-hosted:** one-click deploy to the user's Cloudflare account; fits the Workers free tier for a solo user. Data stays in their D1.
- **One connected flow:** a won deal becomes a project, an invoice, then income, without re-entering anything.
- **Small by default:** strong defaults, few settings. Optional modules (finance set-asides, portal) are switched on per install.
- **Workspaces from day one:** one install, several businesses; personal data (like giving funds) stays private to its owner.
- **Open data:** CSV import and export, a public API and webhooks from early on, so nobody is locked in.

## Modules

v1 is the confirmed scope plus invoices and the finance module, because those make the lead-to-paid flow work. Everything else is listed so it isn't forgotten.

| Module | v1 | Later |
| --- | --- | --- |
| Auth, team and workspaces | Email + password and magic link; invite teammates; roles owner / admin / member; multiple workspaces per install | Google / GitHub login, 2FA, custom roles, audit log |
| Contacts and companies | People and companies, link people to companies, tags, notes, custom fields (text, number, date, select), CSV import and export | Duplicate detection and merge, enrichment from domain |
| Deals pipeline | Kanban and table views, custom stages, value and currency, expected close date, won / lost with reason | Multiple pipelines, forecasting, deal products and line items |
| Activity timeline | Auto-logged changes plus manual notes, calls and meetings on every contact, company and deal | Emails and calendar events shown in the timeline (v2) |
| Tasks and follow-ups | Due date, assignee, link to contact or deal, "Today" and "Overdue" views, email reminders | Recurring tasks, follow-up sequences |
| Files | Upload to R2, attach to contacts, deals and invoices | Previews, versioning, share to portal per file |
| Client portal | Invite-only, magic-link login; client sees their files, invoices and shared notes | Custom portal domain and branding, approvals, comments, pay invoice online |
| Invoices | Line items, tax, PDF, statuses draft / sent / paid / void; paid creates income | Quotes → invoice, recurring invoices, payment links (Stripe, Lemon Squeezy), reminders for overdue |
| Finance | Income, expenses, set-aside rules, payouts (see Finance module tab) | Profit basis, imports, zakat calculator |
| Dashboard | Pipeline value by stage, income this month, tasks due, overdue invoices | Custom reports, charts over time |
| Search | Global quick search across contacts, companies, deals (D1 full-text) | Saved filters and views |
| Deploy and settings | Deploy-to-Cloudflare button, setup wizard, base currency, timezone, pipeline stages | Update channel, backups to R2 |
| Proposals and contracts | Not in v1 | Proposal templates, e-signature, signed proposal → invoice |
| Projects and time tracking | Not in v1 | Won deal → project, tasks, time entries → invoice lines |
| Email | Not in v1 (only system emails) | v2: Gmail / Outlook sync first; native Cloudflare email after |
| Scheduling and forms | Not in v1 | Booking links; embeddable lead form that creates contact + deal |
| Automation | Not in v1 | Trigger → action rules (deal won → create invoice draft, etc.) |
| API and integrations | Not in v1 | Public REST API with tokens, outgoing webhooks, MCP server for AI agents |
| AI | Not in v1 | Contact and deal summaries, draft follow-ups (Workers AI) |
| Mobile | Responsive PWA | Native apps |

## Architecture

&#91;embedded content: system architecture · 3 entry points, 1 Worker, 4 Cloudflare services\]

Team, clients and later outside services all go through one Worker. Only that Worker touches D1, R2, Queues and Email, so a fresh install is a single deploy.

## Core data model

Every business table carries `workspace_id`; personal finance tables (set-aside rules, payouts) carry `user_id` instead. Drizzle schema on D1, money as integers in minor units.

| Entity | Belongs to | Links to |
| --- | --- | --- |
| `users` | install | memberships, set-aside rules, payouts |
| `workspaces` | install | everything below |
| `memberships` | workspace | user, role |
| `companies` | workspace | contacts, deals, invoices |
| `contacts` | workspace | company, deals, portal access |
| `custom_fields` / `field_values` | workspace | any record type |
| `pipelines` / `stages` | workspace | deals |
| `deals` | workspace | contact, company, stage, owner |
| `activities` | workspace | contact, company or deal (polymorphic target) |
| `tasks` | workspace | assignee, contact or deal |
| `files` | workspace | R2 key, any record type |
| `invoices` / `invoice_lines` | workspace | company or contact, deal; creates `incomes` when paid |
| `portal_invites` / `portal_sessions` | workspace | contact |
| `incomes`, `expenses` | workspace | client, invoice (optional) |
| `set_aside_rules`, `allocations`, `payouts` | user | incomes (see Finance module tab) |

## Roadmap

Built in this order so the tool is useful for personal work from the first phase. Tick items off as they ship.

**Phase 1: Foundation + Finance**

- [x] Repo, Workers + D1 + R2 setup, Drizzle migrations, deploy button
- [x] Auth (email + password, magic link), workspaces, memberships, roles
- [x] Finance module: incomes, expenses, set-aside rules, allocations, payouts, quick-add PWA

**Phase 2: Core CRM (rest of v1)**

- [x] Contacts and companies, tags, custom fields, CSV import and export
- [x] Deals pipeline (kanban + table), stages, won / lost
- [x] Activity timeline and notes
- [x] Tasks and follow-ups with email reminders
- [x] Files on R2
- [x] Invoices (PDF, statuses), paid invoice → income
- [x] Client portal (invite-only, magic link)
- [x] Dashboard and global search
- [ ] Setup wizard and public OSS release

**Phase 3: v1.x**

- [ ] Public REST API, API tokens, outgoing webhooks
- [ ] Payment links and payment webhooks (Stripe, Lemon Squeezy, Paddle)
- [ ] Quotes → invoice, recurring invoices, overdue reminders
- [ ] Projects and time tracking
- [ ] Google / GitHub login, 2FA

**Phase 4: v2 (email)**

- [ ] Gmail / Outlook sync into the timeline
- [ ] Native Cloudflare email (Email Routing / Sending) as an optional extra
- [ ] Email forwarding import for income (Cloudflare Email Workers)

**Later**

- [ ] Proposals and contracts with e-signature
- [ ] Booking links and embeddable lead forms
- [ ] Automation rules (trigger → action)
- [ ] Multiple pipelines, forecasting, custom reports
- [ ] Branded portal domain, approvals, online invoice payment in portal
- [ ] Finance: profit basis, SMS forwarding import (undecided), zakat calculator
- [ ] AI summaries and drafts (Workers AI), MCP server
- [ ] Native mobile apps, backups to R2, audit log, custom roles

## Open questions

- [x] **Auth:** Better Auth on D1, organization plugin = workspaces.
- [x] **Frontend:** TanStack Start served from the same Worker.
- [x] **System email:** Resend for v1, one function to swap later.
- [x] **Licence:** AGPL-3.0.
- [x] **Tenancy:** one D1 per install, workspaces as rows.
- [x] **Base currency:** per workspace, plus a personal base currency per user.
- [ ] **Product name and repo name.** ("Clientflare" is the working name.)
