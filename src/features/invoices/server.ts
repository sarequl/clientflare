import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { INVOICE_STATUSES } from '#/db/schema/invoices'
import { newId } from '#/lib/ids'
import { requireRole, requireWorkspace } from '#/lib/session'
import { activityInsert } from '#/features/activities/server'
import { recordIncome } from '#/features/finance/server'
import { computeTotals } from '#/lib/invoice-math'
import { HEX_COLOR, INVOICE_TEMPLATE_IDS, resolveTemplateId } from '#/lib/invoice-templates'

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const CURRENCY = z.string().regex(/^[A-Z]{3}$/)

const lineInput = z.object({
  description: z.string().trim().min(1).max(500),
  /** thousandths: 1500 = 1.5 */
  quantityMilli: z.number().int().min(0).max(1_000_000_000),
  unitMinor: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
})

export { computeTotals }

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const randomToken = () => {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

const invoiceSelect = {
  id: schema.invoices.id,
  number: schema.invoices.number,
  status: schema.invoices.status,
  billTo: schema.invoices.billTo,
  currency: schema.invoices.currency,
  issuedOn: schema.invoices.issuedOn,
  dueOn: schema.invoices.dueOn,
  totalMinor: schema.invoices.totalMinor,
  paidOn: schema.invoices.paidOn,
  contactId: schema.invoices.contactId,
  companyId: schema.invoices.companyId,
  dealId: schema.invoices.dealId,
  updatedAt: schema.invoices.updatedAt,
}

export const listInvoices = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        q: z.string().trim().max(100).optional(),
        status: z.enum([...INVOICE_STATUSES, 'overdue']).optional(),
        contactId: z.string().optional(),
        companyId: z.string().optional(),
        dealId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        today: ISO_DATE.optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const today = data?.today ?? new Date().toISOString().slice(0, 10)
    const conds = [eq(schema.invoices.workspaceId, ctx.workspaceId)]
    if (data?.q) conds.push(or(like(schema.invoices.number, `%${data.q}%`), like(schema.invoices.billTo, `%${data.q}%`))!)
    if (data?.status === 'overdue') conds.push(eq(schema.invoices.status, 'sent'), sql`${schema.invoices.dueOn} < ${today}`)
    else if (data?.status) conds.push(eq(schema.invoices.status, data.status))
    if (data?.contactId) conds.push(eq(schema.invoices.contactId, data.contactId))
    if (data?.companyId) conds.push(eq(schema.invoices.companyId, data.companyId))
    if (data?.dealId) conds.push(eq(schema.invoices.dealId, data.dealId))
    const where = and(...conds)
    const PAGE = 50
    const page = data?.page ?? 1
    const [rows, [{ total }]] = await Promise.all([
      db.select(invoiceSelect).from(schema.invoices).where(where).orderBy(desc(schema.invoices.issuedOn), desc(schema.invoices.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
      db.select({ total: sql<number>`count(*)` }).from(schema.invoices).where(where),
    ])
    return { rows: rows.map((r) => ({ ...r, overdue: r.status === 'sent' && !!r.dueOn && r.dueOn < today })), total: total ?? 0, page, pageSize: PAGE, today }
  })

export const getInvoiceStats = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const today = new Date().toISOString().slice(0, 10)
  const rows = await getDb()
    .select({
      currency: schema.invoices.currency,
      outstanding: sql<number>`sum(case when status = 'sent' then total_minor else 0 end)`,
      overdue: sql<number>`sum(case when status = 'sent' and due_on < ${today} then total_minor else 0 end)`,
      overdueCount: sql<number>`sum(case when status = 'sent' and due_on < ${today} then 1 else 0 end)`,
      draftCount: sql<number>`sum(case when status = 'draft' then 1 else 0 end)`,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.workspaceId, ctx.workspaceId))
    .groupBy(schema.invoices.currency)
  return rows.filter((r) => r.currency)
})

async function loadInvoice(id: string, workspaceId: string) {
  const inv = await getDb().query.invoices.findFirst({
    where: and(eq(schema.invoices.id, id), eq(schema.invoices.workspaceId, workspaceId)),
    with: {
      lines: { orderBy: [asc(schema.invoiceLines.sortOrder)] },
      contact: { columns: { id: true, firstName: true, lastName: true, email: true } },
      company: { columns: { id: true, name: true } },
      deal: { columns: { id: true, title: true } },
    },
  })
  return inv ?? null
}

/** Invoice plus the workspace's business details for rendering. */
export const getInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const [inv, settings, org] = await Promise.all([
      loadInvoice(data.id, ctx.workspaceId),
      db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) }),
      db.query.organization.findFirst({ where: eq(schema.organization.id, ctx.workspaceId), columns: { name: true } }),
    ])
    if (!inv) return null
    return { invoice: inv, business: businessBlock(settings, org?.name ?? '') }
  })

function businessBlock(s: typeof schema.workspaceSettings.$inferSelect | undefined, fallbackName: string) {
  return {
    name: s?.businessName ?? fallbackName,
    address: s?.businessAddress ?? null,
    email: s?.businessEmail ?? null,
    taxId: s?.taxId ?? null,
    footer: s?.invoiceFooter ?? null,
    template: resolveTemplateId(s?.invoiceTemplate),
    accent: s?.invoiceAccent ?? null,
  }
}

/** Public, token-only view used by the share link and the client portal. */
export const getPublicInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(20).max(80) }))
  .handler(async ({ data }) => {
    const db = getDb()
    const inv = await db.query.invoices.findFirst({
      where: eq(schema.invoices.publicToken, data.token),
      with: { lines: { orderBy: [asc(schema.invoiceLines.sortOrder)] } },
    })
    if (!inv || inv.status === 'draft') return null
    const [settings, org] = await Promise.all([
      db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, inv.workspaceId) }),
      db.query.organization.findFirst({ where: eq(schema.organization.id, inv.workspaceId), columns: { name: true } }),
    ])
    // Only what the document needs. No workspace, user or income ids leave the server.
    const { id, number, status, billTo, currency, issuedOn, dueOn, taxRateBp, subtotalMinor, taxMinor, totalMinor, notes, footer, paidOn, publicToken, lines } = inv
    return {
      invoice: { id, number, status, billTo, currency, issuedOn, dueOn, taxRateBp, subtotalMinor, taxMinor, totalMinor, notes, footer, paidOn, publicToken, lines: lines.map((l) => ({ id: l.id, description: l.description, quantityMilli: l.quantityMilli, unitMinor: l.unitMinor, amountMinor: l.amountMinor, sortOrder: l.sortOrder })) },
      business: businessBlock(settings, org?.name ?? ''),
    }
  })

const invoiceInput = z.object({
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  billTo: z.string().trim().max(1000).optional(),
  currency: CURRENCY.optional(),
  issuedOn: ISO_DATE.optional(),
  dueOn: ISO_DATE.nullable().optional(),
  taxRateBp: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().trim().max(5000).optional(),
  footer: z.string().trim().max(2000).optional(),
  lines: z.array(lineInput).max(200).optional(),
})

/** Build a default bill-to block from company/contact. */
async function defaultBillTo(workspaceId: string, contactId?: string | null, companyId?: string | null) {
  const db = getDb()
  const parts: string[] = []
  if (companyId) {
    const c = await db.query.companies.findFirst({ where: and(eq(schema.companies.id, companyId), eq(schema.companies.workspaceId, workspaceId)) })
    if (c) parts.push(c.name, ...(c.address ? [c.address] : []))
  }
  if (contactId) {
    const p = await db.query.contacts.findFirst({ where: and(eq(schema.contacts.id, contactId), eq(schema.contacts.workspaceId, workspaceId)) })
    if (p) {
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ')
      parts.unshift(name)
      if (p.email) parts.push(p.email)
    }
  }
  return parts.join('\n')
}

export const createInvoice = createServerFn({ method: 'POST' })
  .validator(invoiceInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const settings = await db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) })
    const now = new Date()
    const issuedOn = data.issuedOn ?? now.toISOString().slice(0, 10)
    const taxRateBp = data.taxRateBp ?? settings?.defaultTaxRateBp ?? 0
    const lines = data.lines ?? []
    const t = computeTotals(lines, taxRateBp)
    const id = newId()
    let deal: { title: string; valueMinor: number; currency: string; contactId: string | null; companyId: string | null } | undefined
    if (data.dealId) {
      deal = (await db.query.deals.findFirst({ where: and(eq(schema.deals.id, data.dealId), eq(schema.deals.workspaceId, ctx.workspaceId)) })) ?? undefined
    }
    const contactId = data.contactId ?? deal?.contactId ?? null
    const companyId = data.companyId ?? deal?.companyId ?? null
    const billTo = data.billTo ?? (await defaultBillTo(ctx.workspaceId, contactId, companyId))
    const stmts = [
      db.insert(schema.invoices).values({
        id,
        workspaceId: ctx.workspaceId,
        status: 'draft',
        contactId,
        companyId,
        dealId: data.dealId ?? null,
        billTo,
        currency: data.currency ?? deal?.currency ?? settings?.baseCurrency ?? 'USD',
        issuedOn,
        dueOn: data.dueOn === undefined ? addDays(issuedOn, settings?.defaultPaymentTermsDays ?? 14) : data.dueOn,
        taxRateBp,
        subtotalMinor: t.subtotalMinor,
        taxMinor: t.taxMinor,
        totalMinor: t.totalMinor,
        notes: data.notes || null,
        footer: data.footer ?? settings?.invoiceFooter ?? null,
        publicToken: randomToken(),
        createdByUserId: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]
    // A deal with no lines becomes one line for the deal value.
    const seedLines = lines.length ? lines : deal ? [{ description: deal.title, quantityMilli: 1000, unitMinor: deal.valueMinor }] : []
    if (seedLines.length) {
      const seeded = computeTotals(seedLines, taxRateBp)
      stmts.push(db.insert(schema.invoiceLines).values(seedLines.map((l, i) => ({ id: newId(), invoiceId: id, ...l, amountMinor: seeded.lineAmounts[i]!, sortOrder: i }))) as never)
      if (!lines.length) stmts.push(db.update(schema.invoices).set({ subtotalMinor: seeded.subtotalMinor, taxMinor: seeded.taxMinor, totalMinor: seeded.totalMinor }).where(eq(schema.invoices.id, id)) as never)
    }
    if (data.dealId) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: data.dealId, kind: 'system', body: 'Invoice drafted' }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { id }
  })

/** Only drafts are fully editable. Sent invoices accept notes/footer/dueOn changes only. */
export const updateInvoice = createServerFn({ method: 'POST' })
  .validator(invoiceInput.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    if (inv.status === 'paid' || inv.status === 'void') throw new Error(`A ${inv.status} invoice cannot be edited`)
    const now = new Date()
    if (inv.status === 'sent') {
      await db
        .update(schema.invoices)
        .set({ notes: data.notes === undefined ? inv.notes : data.notes || null, footer: data.footer === undefined ? inv.footer : data.footer || null, dueOn: data.dueOn === undefined ? inv.dueOn : data.dueOn, updatedAt: now })
        .where(eq(schema.invoices.id, inv.id))
      return { ok: true }
    }
    const lines = data.lines ?? inv.lines.map((l) => ({ description: l.description, quantityMilli: l.quantityMilli, unitMinor: l.unitMinor }))
    const taxRateBp = data.taxRateBp ?? inv.taxRateBp
    const t = computeTotals(lines, taxRateBp)
    const stmts = [
      db
        .update(schema.invoices)
        .set({
          contactId: data.contactId === undefined ? inv.contactId : data.contactId,
          companyId: data.companyId === undefined ? inv.companyId : data.companyId,
          dealId: data.dealId === undefined ? inv.dealId : data.dealId,
          billTo: data.billTo ?? inv.billTo,
          currency: data.currency ?? inv.currency,
          issuedOn: data.issuedOn ?? inv.issuedOn,
          dueOn: data.dueOn === undefined ? inv.dueOn : data.dueOn,
          taxRateBp,
          subtotalMinor: t.subtotalMinor,
          taxMinor: t.taxMinor,
          totalMinor: t.totalMinor,
          notes: data.notes === undefined ? inv.notes : data.notes || null,
          footer: data.footer === undefined ? inv.footer : data.footer || null,
          updatedAt: now,
        })
        .where(eq(schema.invoices.id, inv.id)),
    ]
    if (data.lines) {
      stmts.push(db.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id)) as never)
      if (lines.length) stmts.push(db.insert(schema.invoiceLines).values(lines.map((l, i) => ({ id: newId(), invoiceId: inv.id, ...l, amountMinor: t.lineAmounts[i]!, sortOrder: i }))) as never)
    }
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { ok: true }
  })

/** draft → sent. Assigns the number. Does not email anything; the share link is what you send. */
export const markInvoiceSent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), sentOn: ISO_DATE.optional() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    if (inv.status !== 'draft') throw new Error('Only drafts can be marked sent')
    if (!inv.lines.length) throw new Error('Add at least one line first')
    const settings = await db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) })
    const n = settings?.nextInvoiceNumber ?? 1
    const number = inv.number ?? `${settings?.invoicePrefix ?? 'INV-'}${String(n).padStart(4, '0')}`
    const now = new Date()
    const stmts = [db.update(schema.invoices).set({ status: 'sent', number, sentAt: now, updatedAt: now }).where(eq(schema.invoices.id, inv.id))]
    if (!inv.number) {
      stmts.push(
        db
          .insert(schema.workspaceSettings)
          .values({ organizationId: ctx.workspaceId, nextInvoiceNumber: n + 1, updatedAt: now })
          .onConflictDoUpdate({ target: schema.workspaceSettings.organizationId, set: { nextInvoiceNumber: n + 1, updatedAt: now } }) as never,
      )
    }
    if (inv.dealId) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: inv.dealId, kind: 'system', body: `Invoice ${number} sent` }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { number }
  })

/** sent → paid. Creates the income (with the marking user's set-asides) and links it. */
export const markInvoicePaid = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), paidOn: ISO_DATE, applySetAsides: z.boolean().default(true) }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    if (inv.status !== 'sent') throw new Error('Only sent invoices can be marked paid')
    const clientName = inv.company?.name ?? (inv.contact ? [inv.contact.firstName, inv.contact.lastName].filter(Boolean).join(' ') : null) ?? inv.billTo.split('\n')[0] ?? null
    const income = await recordIncome({
      workspaceId: ctx.workspaceId,
      userId: ctx.user.id,
      amountMinor: inv.totalMinor,
      currency: inv.currency,
      receivedOn: data.paidOn,
      clientName,
      source: 'Invoice',
      note: `Invoice ${inv.number}`,
      invoiceId: inv.id,
      applySetAsides: data.applySetAsides,
    })
    const now = new Date()
    const stmts = [db.update(schema.invoices).set({ status: 'paid', paidOn: data.paidOn, paidAt: now, incomeId: income.id, updatedAt: now }).where(eq(schema.invoices.id, inv.id))]
    if (inv.dealId) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: inv.dealId, kind: 'system', body: `Invoice ${inv.number} paid` }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { incomeId: income.id, allocations: income.allocations }
  })

/** paid → sent. Removes the linked income and its allocations. */
export const markInvoiceUnpaid = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    if (inv.status !== 'paid') throw new Error('Invoice is not paid')
    const stmts = [db.update(schema.invoices).set({ status: 'sent', paidOn: null, paidAt: null, incomeId: null, updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id))]
    if (inv.incomeId) stmts.push(db.delete(schema.incomes).where(eq(schema.incomes.id, inv.incomeId)) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { ok: true }
  })

/** draft|sent → void. Paid invoices must be un-paid first. */
export const voidInvoice = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    if (inv.status === 'paid') throw new Error('Mark the invoice unpaid before voiding it')
    await getDb().update(schema.invoices).set({ status: 'void', updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id))
    return { ok: true }
  })

/** Drafts can be deleted outright. Anything numbered should be voided instead. */
export const deleteInvoice = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    if (inv.status !== 'draft') throw new Error('Only drafts can be deleted. Void it instead.')
    await getDb().delete(schema.invoices).where(eq(schema.invoices.id, inv.id))
    return { ok: true }
  })

export const duplicateInvoice = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const inv = await loadInvoice(data.id, ctx.workspaceId)
    if (!inv) throw new Error('Not found')
    return createInvoice({
      data: {
        contactId: inv.contactId,
        companyId: inv.companyId,
        dealId: inv.dealId,
        billTo: inv.billTo,
        currency: inv.currency,
        taxRateBp: inv.taxRateBp,
        notes: inv.notes ?? undefined,
        footer: inv.footer ?? undefined,
        lines: inv.lines.map((l) => ({ description: l.description, quantityMilli: l.quantityMilli, unitMinor: l.unitMinor })),
      },
    })
  })

// ── Business / invoice settings ────────────────────────────────────────────

export const getInvoiceSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const s = await getDb().query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) })
  return {
    businessName: s?.businessName ?? '',
    businessAddress: s?.businessAddress ?? '',
    businessEmail: s?.businessEmail ?? '',
    taxId: s?.taxId ?? '',
    invoicePrefix: s?.invoicePrefix ?? 'INV-',
    nextInvoiceNumber: s?.nextInvoiceNumber ?? 1,
    defaultTaxRateBp: s?.defaultTaxRateBp ?? 0,
    defaultPaymentTermsDays: s?.defaultPaymentTermsDays ?? 14,
    invoiceFooter: s?.invoiceFooter ?? '',
    invoiceTemplate: resolveTemplateId(s?.invoiceTemplate),
    invoiceAccent: s?.invoiceAccent ?? null,
  }
})

export const updateInvoiceSettings = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      businessName: z.string().trim().max(120),
      businessAddress: z.string().trim().max(500),
      businessEmail: z.string().trim().email().or(z.literal('')),
      taxId: z.string().trim().max(60),
      invoicePrefix: z.string().trim().max(10),
      nextInvoiceNumber: z.number().int().min(1),
      defaultTaxRateBp: z.number().int().min(0).max(10_000),
      defaultPaymentTermsDays: z.number().int().min(0).max(365),
      invoiceFooter: z.string().trim().max(2000),
      // Optional so callers that don't show the design (the setup wizard) leave it alone.
      invoiceTemplate: z.enum(INVOICE_TEMPLATE_IDS).optional(),
      invoiceAccent: z.string().regex(HEX_COLOR).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const now = new Date()
    const set = {
      businessName: data.businessName || null,
      businessAddress: data.businessAddress || null,
      businessEmail: data.businessEmail || null,
      taxId: data.taxId || null,
      invoicePrefix: data.invoicePrefix,
      nextInvoiceNumber: data.nextInvoiceNumber,
      defaultTaxRateBp: data.defaultTaxRateBp,
      defaultPaymentTermsDays: data.defaultPaymentTermsDays,
      invoiceFooter: data.invoiceFooter || null,
      ...(data.invoiceTemplate !== undefined && { invoiceTemplate: data.invoiceTemplate }),
      ...(data.invoiceAccent !== undefined && { invoiceAccent: data.invoiceAccent?.toLowerCase() ?? null }),
      updatedAt: now,
    }
    await getDb()
      .insert(schema.workspaceSettings)
      .values({ organizationId: ctx.workspaceId, ...set })
      .onConflictDoUpdate({ target: schema.workspaceSettings.organizationId, set })
    return { ok: true }
  })
