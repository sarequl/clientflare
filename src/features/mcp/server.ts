import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getContact, createContact, listContacts, updateContact } from '#/features/contacts/server'
import { getCompany, createCompany, listCompanies } from '#/features/companies/server'
import { getDeal, createDeal, listDeals, listStages, moveDeal } from '#/features/deals/server'
import { createTask, listTasks, setTaskDone } from '#/features/tasks/server'
import { createInvoice, getInvoice, listInvoices } from '#/features/invoices/server'
import { addActivity, listActivities } from '#/features/activities/server'
import { globalSearch } from '#/features/search/server'
import { getFinanceSummary } from '#/features/finance/server'
import { getAppContext } from '#/features/workspaces/server'

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD')
const MONEY = z.number().int().describe('Integer minor units, e.g. 12500 = 125.00')

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const found = <T>(value: T | null | undefined, what: string): T => {
  if (value == null) throw new Error(`${what} not found in this workspace`)
  return value
}

/**
 * One MCP server per request. Every tool calls the same server functions the
 * UI uses, so validation, workspace scoping and timeline logging all apply.
 * The caller is whoever owns the bearer token (see src/lib/session.ts).
 */
export function createMcpServer() {
  const server = new McpServer({ name: 'clientflare', version: '1.0.0' })

  server.registerTool(
    'whoami',
    { description: 'The user and workspace this token acts as, with the workspace currency and timezone.' },
    async () => json(await getAppContext()),
  )

  server.registerTool(
    'search',
    {
      description: 'Search contacts, companies, deals and invoices by name, email or invoice number. Use this first to find ids.',
      inputSchema: { q: z.string().min(1).max(100) },
    },
    async ({ q }) => json(await globalSearch({ data: { q } })),
  )

  server.registerTool(
    'list_contacts',
    { description: 'Contacts in the workspace, newest first. Filter with q (name/email) or companyId.', inputSchema: { q: z.string().max(100).optional(), companyId: z.string().optional(), page: z.number().int().min(1).optional() } },
    async (args) => json(await listContacts({ data: args })),
  )
  server.registerTool(
    'get_contact',
    { description: 'A contact with company, owner, tags, custom fields, plus its timeline.', inputSchema: { id: z.string() } },
    async ({ id }) => {
      const contact = found(await getContact({ data: { id } }), 'Contact')
      return json({ contact, timeline: await listActivities({ data: { targetType: 'contact', targetId: id } }) })
    },
  )
  server.registerTool(
    'create_contact',
    {
      description: 'Create a contact. companyId must come from list_companies/search or create_company.',
      inputSchema: {
        firstName: z.string().min(1).max(80),
        lastName: z.string().max(80).optional(),
        email: z.string().email().max(200).optional(),
        phone: z.string().max(40).optional(),
        jobTitle: z.string().max(80).optional(),
        notes: z.string().max(5000).optional(),
        companyId: z.string().optional(),
      },
    },
    async (args) => {
      const { id } = await createContact({ data: args })
      return json(await getContact({ data: { id } }))
    },
  )
  server.registerTool(
    'update_contact',
    {
      description: 'Update fields on a contact. Only the fields given are changed.',
      inputSchema: {
        id: z.string(),
        firstName: z.string().min(1).max(80).optional(),
        lastName: z.string().max(80).optional(),
        email: z.string().email().max(200).optional(),
        phone: z.string().max(40).optional(),
        jobTitle: z.string().max(80).optional(),
        notes: z.string().max(5000).optional(),
        companyId: z.string().nullable().optional(),
      },
    },
    async (args) => {
      await updateContact({ data: args })
      return json(await getContact({ data: { id: args.id } }))
    },
  )

  server.registerTool(
    'list_companies',
    { description: 'Companies in the workspace. Filter with q.', inputSchema: { q: z.string().max(100).optional(), page: z.number().int().min(1).optional() } },
    async (args) => json(await listCompanies({ data: args })),
  )
  server.registerTool(
    'get_company',
    { description: 'A company with its contacts, tags, custom fields and timeline.', inputSchema: { id: z.string() } },
    async ({ id }) => {
      const company = found(await getCompany({ data: { id } }), 'Company')
      return json({ company, timeline: await listActivities({ data: { targetType: 'company', targetId: id } }) })
    },
  )
  server.registerTool(
    'create_company',
    {
      description: 'Create a company.',
      inputSchema: { name: z.string().min(1).max(120), domain: z.string().max(120).optional(), website: z.string().max(200).optional(), phone: z.string().max(40).optional(), address: z.string().max(500).optional(), notes: z.string().max(5000).optional() },
    },
    async (args) => {
      const { id } = await createCompany({ data: args })
      return json(await getCompany({ data: { id } }))
    },
  )

  server.registerTool(
    'list_stages',
    { description: 'Pipeline stages in order, with ids. Needed for move_deal and create_deal.' },
    async () => json(await listStages()),
  )
  server.registerTool(
    'list_deals',
    {
      description: 'Deals. Filter by status (open/won/lost), stageId, contactId, companyId or q. Values are integer minor units.',
      inputSchema: { q: z.string().max(100).optional(), status: z.enum(['open', 'won', 'lost']).optional(), stageId: z.string().optional(), contactId: z.string().optional(), companyId: z.string().optional(), page: z.number().int().min(1).optional() },
    },
    async (args) => json(await listDeals({ data: args })),
  )
  server.registerTool(
    'get_deal',
    { description: 'A deal with stage, contact, company, tags and timeline.', inputSchema: { id: z.string() } },
    async ({ id }) => {
      const deal = found(await getDeal({ data: { id } }), 'Deal')
      return json({ deal, timeline: await listActivities({ data: { targetType: 'deal', targetId: id } }) })
    },
  )
  server.registerTool(
    'create_deal',
    {
      description: 'Create a deal in the first open stage unless stageId is given. currency defaults to the workspace currency (see whoami).',
      inputSchema: {
        title: z.string().min(1).max(160),
        valueMinor: MONEY.min(0).optional(),
        currency: z.string().regex(/^[A-Z]{3}$/).optional(),
        expectedCloseOn: ISO_DATE.optional(),
        stageId: z.string().optional(),
        contactId: z.string().optional(),
        companyId: z.string().optional(),
        notes: z.string().max(5000).optional(),
      },
    },
    async (args) => {
      const currency = args.currency ?? (await getAppContext()).workspace.baseCurrency
      const { id } = await createDeal({ data: { ...args, currency, valueMinor: args.valueMinor ?? 0 } })
      return json(await getDeal({ data: { id } }))
    },
  )
  server.registerTool(
    'move_deal',
    {
      description: 'Move a deal to another stage. Moving into a won/lost stage closes it; give lostReason for lost.',
      inputSchema: { id: z.string(), stageId: z.string(), lostReason: z.string().max(500).optional() },
    },
    async (args) => {
      await moveDeal({ data: args })
      return json(await getDeal({ data: { id: args.id } }))
    },
  )

  server.registerTool(
    'list_tasks',
    {
      description: 'Tasks. view: today (due today or overdue), upcoming, all (every open task), done. mine limits to the caller.',
      inputSchema: { view: z.enum(['today', 'upcoming', 'all', 'done']).optional(), mine: z.boolean().optional(), contactId: z.string().optional(), companyId: z.string().optional(), dealId: z.string().optional() },
    },
    async (args) => json(await listTasks({ data: args })),
  )
  server.registerTool(
    'create_task',
    {
      description: 'Create a task, optionally linked to a contact, company or deal. Assigned to the caller unless assigneeUserId is given.',
      inputSchema: { title: z.string().min(1).max(200), description: z.string().max(5000).optional(), dueOn: ISO_DATE.optional(), assigneeUserId: z.string().optional(), contactId: z.string().optional(), companyId: z.string().optional(), dealId: z.string().optional() },
    },
    async (args) => {
      const assigneeUserId = args.assigneeUserId ?? (await getAppContext()).user.id
      const { id } = await createTask({ data: { ...args, assigneeUserId } })
      return json({ id, ...args, assigneeUserId, status: 'open' })
    },
  )
  server.registerTool(
    'complete_task',
    { description: 'Mark a task done (or reopen it with done=false).', inputSchema: { id: z.string(), done: z.boolean().optional() } },
    async ({ id, done }) => json(await setTaskDone({ data: { id, done: done ?? true } })),
  )

  server.registerTool(
    'log_activity',
    {
      description: 'Log a note, call, meeting or email on a contact, company or deal. Shows on its timeline attributed to the caller.',
      inputSchema: { targetType: z.enum(['contact', 'company', 'deal']), targetId: z.string(), kind: z.enum(['note', 'call', 'meeting', 'email']), body: z.string().min(1).max(10_000), occurredAt: z.string().datetime().optional() },
    },
    async (args) => json(await addActivity({ data: args })),
  )

  server.registerTool(
    'list_invoices',
    {
      description: 'Invoices. status: draft, sent, paid, void or overdue. Amounts are integer minor units.',
      inputSchema: { q: z.string().max(100).optional(), status: z.enum(['draft', 'sent', 'paid', 'void', 'overdue']).optional(), contactId: z.string().optional(), companyId: z.string().optional(), page: z.number().int().min(1).optional() },
    },
    async (args) => json(await listInvoices({ data: args })),
  )
  server.registerTool(
    'get_invoice',
    { description: 'An invoice with its lines and totals.', inputSchema: { id: z.string() } },
    async ({ id }) => json(found(await getInvoice({ data: { id } }), 'Invoice')),
  )
  server.registerTool(
    'create_invoice',
    {
      description: 'Create a DRAFT invoice. It is never sent or numbered from here; the user reviews and sends it in the app. Line quantities are thousandths (1000 = 1), unit prices are minor units.',
      inputSchema: {
        contactId: z.string().optional(),
        companyId: z.string().optional(),
        dealId: z.string().optional(),
        currency: z.string().regex(/^[A-Z]{3}$/).optional(),
        issuedOn: ISO_DATE.optional(),
        dueOn: ISO_DATE.optional(),
        taxRateBp: z.number().int().min(0).max(10_000).describe('Basis points, 2000 = 20%').optional(),
        notes: z.string().max(5000).optional(),
        lines: z.array(z.object({ description: z.string().min(1).max(500), quantityMilli: z.number().int().min(0), unitMinor: MONEY })).max(200).optional(),
      },
    },
    async (args) => {
      const { id } = await createInvoice({ data: args })
      return json(await getInvoice({ data: { id } }))
    },
  )

  server.registerTool(
    'finance_summary',
    { description: "The caller's personal finance summary for a month (YYYY-MM, default current): income, expenses, set-asides, payouts.", inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).optional() } },
    async (args) => json(await getFinanceSummary({ data: args })),
  )

  return server
}
