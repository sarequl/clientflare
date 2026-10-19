import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { requireWorkspace } from '#/lib/session'

/** Global quick search over contacts, companies, deals, invoices and tasks. LIKE-based; FTS later if needed. */
export const globalSearch = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const p = `%${data.q}%`
    const [contacts, companies, deals, invoices, tasks] = await Promise.all([
      db
        .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, email: schema.contacts.email, companyName: schema.companies.name })
        .from(schema.contacts)
        .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
        .where(and(eq(schema.contacts.workspaceId, ctx.workspaceId), or(like(schema.contacts.firstName, p), like(schema.contacts.lastName, p), like(schema.contacts.email, p), like(schema.contacts.phone, p), like(sql`${schema.contacts.firstName} || ' ' || coalesce(${schema.contacts.lastName}, '')`, p))))
        .orderBy(asc(schema.contacts.firstName))
        .limit(6),
      db
        .select({ id: schema.companies.id, name: schema.companies.name, domain: schema.companies.domain })
        .from(schema.companies)
        .where(and(eq(schema.companies.workspaceId, ctx.workspaceId), or(like(schema.companies.name, p), like(schema.companies.domain, p))))
        .orderBy(asc(schema.companies.name))
        .limit(6),
      db
        .select({ id: schema.deals.id, title: schema.deals.title, status: schema.deals.status, valueMinor: schema.deals.valueMinor, currency: schema.deals.currency })
        .from(schema.deals)
        .where(and(eq(schema.deals.workspaceId, ctx.workspaceId), like(schema.deals.title, p)))
        .orderBy(asc(schema.deals.title))
        .limit(6),
      db
        .select({ id: schema.invoices.id, number: schema.invoices.number, status: schema.invoices.status, billTo: schema.invoices.billTo, totalMinor: schema.invoices.totalMinor, currency: schema.invoices.currency })
        .from(schema.invoices)
        .where(and(eq(schema.invoices.workspaceId, ctx.workspaceId), or(like(schema.invoices.number, p), like(schema.invoices.billTo, p))))
        .orderBy(asc(schema.invoices.number))
        .limit(6),
      db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          status: schema.tasks.status,
          dueOn: schema.tasks.dueOn,
          contactId: schema.tasks.contactId,
          companyId: schema.tasks.companyId,
          dealId: schema.tasks.dealId,
        })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.workspaceId, ctx.workspaceId), like(schema.tasks.title, p)))
        .orderBy(asc(schema.tasks.status), asc(schema.tasks.title))
        .limit(6),
    ])
    return { contacts, companies, deals, invoices, tasks }
  })
