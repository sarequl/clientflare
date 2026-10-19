import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { shareBp } from '#/lib/money'
import { requireSession, requireWorkspace } from '#/lib/session'

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const CURRENCY = z.string().regex(/^[A-Z]{3}$/)
const MINOR = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const monthRange = (month?: string) => {
  const m = month ?? new Date().toISOString().slice(0, 7)
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(Date.UTC(y!, mo!, 0)).getUTCDate()
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` }
}

// ── Incomes ────────────────────────────────────────────────────────────────

export const listIncomes = createServerFn({ method: 'GET' })
  .validator(z.object({ month: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const { from, to } = monthRange(data?.month)
    const rows = await getDb().query.incomes.findMany({
      where: and(eq(schema.incomes.workspaceId, ctx.workspaceId), gte(schema.incomes.receivedOn, from), lte(schema.incomes.receivedOn, to)),
      orderBy: [desc(schema.incomes.receivedOn), desc(schema.incomes.createdAt)],
      with: { allocations: { with: { rule: { columns: { name: true } } } } },
    })
    return rows.map((r) => ({
      ...r,
      // Only the recorder sees their own allocations. Personal data stays personal.
      allocations: r.userId === ctx.user.id ? r.allocations.map((a) => ({ id: a.id, name: a.rule.name, amountMinor: a.amountMinor })) : [],
    }))
  })

const incomeInput = z.object({
  amountMinor: MINOR,
  currency: CURRENCY,
  receivedOn: ISO_DATE,
  clientName: z.string().trim().max(120).optional(),
  source: z.string().trim().max(80).optional(),
  note: z.string().trim().max(2000).optional(),
  /** When false, record the income without running set-aside rules. */
  applySetAsides: z.boolean().default(true),
})

/**
 * Record an income and, in the same batch, allocate it across the recorder's
 * active set-aside rules. Percent is snapshotted so editing a rule later does
 * not rewrite history.
 */
export const createIncome = createServerFn({ method: 'POST' })
  .validator(incomeInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const now = new Date()
    const incomeId = newId()
    const rules = data.applySetAsides
      ? await db.query.setAsideRules.findMany({
          where: and(eq(schema.setAsideRules.userId, ctx.user.id), eq(schema.setAsideRules.active, true)),
          orderBy: [schema.setAsideRules.sortOrder],
        })
      : []

    const incomeRow = {
      id: incomeId,
      workspaceId: ctx.workspaceId,
      userId: ctx.user.id,
      amountMinor: data.amountMinor,
      currency: data.currency,
      receivedOn: data.receivedOn,
      clientName: data.clientName || null,
      source: data.source || null,
      note: data.note || null,
      createdAt: now,
      updatedAt: now,
    }
    const allocationRows = rules.map((r) => ({
      id: newId(),
      userId: ctx.user.id,
      incomeId,
      ruleId: r.id,
      percentBp: r.percentBp,
      amountMinor: shareBp(data.amountMinor, r.percentBp),
      currency: data.currency,
      createdAt: now,
    }))

    // D1 has no interactive transactions. batch() is atomic.
    const incomeInsert = db.insert(schema.incomes).values(incomeRow)
    if (allocationRows.length) {
      await db.batch([incomeInsert, db.insert(schema.allocations).values(allocationRows)])
    } else {
      await incomeInsert
    }
    return { id: incomeId, allocations: allocationRows.map((a) => ({ ruleId: a.ruleId, amountMinor: a.amountMinor })) }
  })

export const updateIncome = createServerFn({ method: 'POST' })
  .validator(incomeInput.omit({ applySetAsides: true }).extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const existing = await db.query.incomes.findFirst({ where: and(eq(schema.incomes.id, data.id), eq(schema.incomes.workspaceId, ctx.workspaceId)) })
    if (!existing) throw new Error('Not found')
    const { id, ...rest } = data
    const incomeUpdate = db
      .update(schema.incomes)
      .set({ ...rest, clientName: rest.clientName || null, source: rest.source || null, note: rest.note || null, updatedAt: new Date() })
      .where(eq(schema.incomes.id, id))
    if (existing.amountMinor !== data.amountMinor || existing.currency !== data.currency) {
      // Re-scale existing allocations with their snapshotted percent when the amount changes.
      const allocUpdate = db
        .update(schema.allocations)
        .set({ amountMinor: sql`cast(round(${data.amountMinor} * percent_bp / 10000.0) as integer)`, currency: data.currency })
        .where(eq(schema.allocations.incomeId, id))
      await db.batch([incomeUpdate, allocUpdate])
    } else {
      await incomeUpdate
    }
    return { ok: true }
  })

export const deleteIncome = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb().delete(schema.incomes).where(and(eq(schema.incomes.id, data.id), eq(schema.incomes.workspaceId, ctx.workspaceId)))
    return { ok: true } // allocations cascade
  })

// ── Expenses ───────────────────────────────────────────────────────────────

export const listExpenses = createServerFn({ method: 'GET' })
  .validator(z.object({ month: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const { from, to } = monthRange(data?.month)
    return getDb().query.expenses.findMany({
      where: and(eq(schema.expenses.workspaceId, ctx.workspaceId), gte(schema.expenses.spentOn, from), lte(schema.expenses.spentOn, to)),
      orderBy: [desc(schema.expenses.spentOn), desc(schema.expenses.createdAt)],
    })
  })

const expenseInput = z.object({
  amountMinor: MINOR,
  currency: CURRENCY,
  spentOn: ISO_DATE,
  category: z.string().trim().max(60).optional(),
  vendor: z.string().trim().max(120).optional(),
  note: z.string().trim().max(2000).optional(),
})

export const createExpense = createServerFn({ method: 'POST' })
  .validator(expenseInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const now = new Date()
    const id = newId()
    await getDb().insert(schema.expenses).values({
      id,
      workspaceId: ctx.workspaceId,
      userId: ctx.user.id,
      ...data,
      category: data.category || null,
      vendor: data.vendor || null,
      note: data.note || null,
      createdAt: now,
      updatedAt: now,
    })
    return { id }
  })

export const updateExpense = createServerFn({ method: 'POST' })
  .validator(expenseInput.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const { id, ...rest } = data
    await getDb()
      .update(schema.expenses)
      .set({ ...rest, category: rest.category || null, vendor: rest.vendor || null, note: rest.note || null, updatedAt: new Date() })
      .where(and(eq(schema.expenses.id, id), eq(schema.expenses.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })

export const deleteExpense = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb().delete(schema.expenses).where(and(eq(schema.expenses.id, data.id), eq(schema.expenses.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })

// ── Set-aside rules (personal) ─────────────────────────────────────────────

/** Rules with their running balance: allocated minus paid out, grouped by currency. */
export const listSetAsides = createServerFn({ method: 'GET' }).handler(async () => {
  const { user } = await requireSession()
  const db = getDb()
  const rules = await db.query.setAsideRules.findMany({
    where: eq(schema.setAsideRules.userId, user.id),
    orderBy: [schema.setAsideRules.sortOrder, schema.setAsideRules.createdAt],
  })
  if (!rules.length) return []
  const ids = rules.map((r) => r.id)
  const [alloc, paid] = await Promise.all([
    db
      .select({ ruleId: schema.allocations.ruleId, currency: schema.allocations.currency, total: sql<number>`sum(${schema.allocations.amountMinor})` })
      .from(schema.allocations)
      .where(inArray(schema.allocations.ruleId, ids))
      .groupBy(schema.allocations.ruleId, schema.allocations.currency),
    db
      .select({ ruleId: schema.payouts.ruleId, currency: schema.payouts.currency, total: sql<number>`sum(${schema.payouts.amountMinor})` })
      .from(schema.payouts)
      .where(inArray(schema.payouts.ruleId, ids))
      .groupBy(schema.payouts.ruleId, schema.payouts.currency),
  ])
  return rules.map((r) => {
    const balances: Record<string, { allocated: number; paidOut: number; balance: number }> = {}
    for (const a of alloc.filter((x) => x.ruleId === r.id)) {
      balances[a.currency] = { allocated: a.total, paidOut: 0, balance: a.total }
    }
    for (const p of paid.filter((x) => x.ruleId === r.id)) {
      const b = (balances[p.currency] ??= { allocated: 0, paidOut: 0, balance: 0 })
      b.paidOut = p.total
      b.balance = b.allocated - p.total
    }
    return { ...r, balances }
  })
})

const ruleInput = z.object({
  name: z.string().trim().min(1).max(60),
  /** Basis points: 2000 = 20%. */
  percentBp: z.number().int().min(1).max(10_000),
  active: z.boolean().default(true),
})

export const createSetAside = createServerFn({ method: 'POST' })
  .validator(ruleInput)
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    const db = getDb()
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(percent_bp), 0)` })
      .from(schema.setAsideRules)
      .where(and(eq(schema.setAsideRules.userId, user.id), eq(schema.setAsideRules.active, true)))
    if (data.active && (total ?? 0) + data.percentBp > 10_000) throw new Error('Active rules would exceed 100%')
    const now = new Date()
    const id = newId()
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.setAsideRules).where(eq(schema.setAsideRules.userId, user.id))
    await db.insert(schema.setAsideRules).values({ id, userId: user.id, ...data, sortOrder: n ?? 0, createdAt: now, updatedAt: now })
    return { id }
  })

export const updateSetAside = createServerFn({ method: 'POST' })
  .validator(ruleInput.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    const db = getDb()
    const { id, ...rest } = data
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(percent_bp), 0)` })
      .from(schema.setAsideRules)
      .where(and(eq(schema.setAsideRules.userId, user.id), eq(schema.setAsideRules.active, true), sql`${schema.setAsideRules.id} != ${id}`))
    if (rest.active && (total ?? 0) + rest.percentBp > 10_000) throw new Error('Active rules would exceed 100%')
    await db.update(schema.setAsideRules).set({ ...rest, updatedAt: new Date() }).where(and(eq(schema.setAsideRules.id, id), eq(schema.setAsideRules.userId, user.id)))
    return { ok: true }
  })

export const deleteSetAside = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    await getDb().delete(schema.setAsideRules).where(and(eq(schema.setAsideRules.id, data.id), eq(schema.setAsideRules.userId, user.id)))
    return { ok: true }
  })

// ── Payouts (personal) ─────────────────────────────────────────────────────

export const listPayouts = createServerFn({ method: 'GET' })
  .validator(z.object({ ruleId: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    return getDb().query.payouts.findMany({
      where: data?.ruleId ? and(eq(schema.payouts.userId, user.id), eq(schema.payouts.ruleId, data.ruleId)) : eq(schema.payouts.userId, user.id),
      orderBy: [desc(schema.payouts.paidOn), desc(schema.payouts.createdAt)],
      with: { rule: { columns: { name: true } } },
    })
  })

export const createPayout = createServerFn({ method: 'POST' })
  .validator(z.object({ ruleId: z.string(), amountMinor: MINOR, currency: CURRENCY, paidOn: ISO_DATE, note: z.string().trim().max(2000).optional() }))
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    const db = getDb()
    const rule = await db.query.setAsideRules.findFirst({ where: and(eq(schema.setAsideRules.id, data.ruleId), eq(schema.setAsideRules.userId, user.id)) })
    if (!rule) throw new Error('Not found')
    const id = newId()
    await db.insert(schema.payouts).values({ id, userId: user.id, ...data, note: data.note || null, createdAt: new Date() })
    return { id }
  })

export const deletePayout = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    await getDb().delete(schema.payouts).where(and(eq(schema.payouts.id, data.id), eq(schema.payouts.userId, user.id)))
    return { ok: true }
  })

// ── Dashboard summary ──────────────────────────────────────────────────────

export const getFinanceSummary = createServerFn({ method: 'GET' })
  .validator(z.object({ month: z.string().optional() }).optional())
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const { from, to } = monthRange(data?.month)
    const db = getDb()
    const [income, expense] = await Promise.all([
      db
        .select({ currency: schema.incomes.currency, total: sql<number>`sum(${schema.incomes.amountMinor})`, count: sql<number>`count(*)` })
        .from(schema.incomes)
        .where(and(eq(schema.incomes.workspaceId, ctx.workspaceId), gte(schema.incomes.receivedOn, from), lte(schema.incomes.receivedOn, to)))
        .groupBy(schema.incomes.currency),
      db
        .select({ currency: schema.expenses.currency, total: sql<number>`sum(${schema.expenses.amountMinor})`, count: sql<number>`count(*)` })
        .from(schema.expenses)
        .where(and(eq(schema.expenses.workspaceId, ctx.workspaceId), gte(schema.expenses.spentOn, from), lte(schema.expenses.spentOn, to)))
        .groupBy(schema.expenses.currency),
    ])
    return { month: from.slice(0, 7), income, expense }
  })
