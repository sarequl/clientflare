import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { DEAL_STATUSES, STAGE_KINDS } from '#/db/schema/deals'
import { newId } from '#/lib/ids'
import { requireRole, requireWorkspace } from '#/lib/session'
import { activityInsert, diffFields } from '#/features/activities/server'
import { replaceRecordTags, tagsForRecords } from '#/features/tags/server'
import { valuesForRecord, writeFieldValues } from '#/features/custom-fields/server'

const DEFAULT_STAGES = [
  { name: 'Lead', kind: 'open', probability: 10, color: 'gray' },
  { name: 'Qualified', kind: 'open', probability: 30, color: 'blue' },
  { name: 'Proposal', kind: 'open', probability: 60, color: 'purple' },
  { name: 'Negotiation', kind: 'open', probability: 80, color: 'orange' },
  { name: 'Won', kind: 'won', probability: 100, color: 'green' },
  { name: 'Lost', kind: 'lost', probability: 0, color: 'red' },
] as const

/** Every workspace gets one pipeline. Created lazily so existing workspaces get it too. */
export const ensureDefaultPipeline = createServerOnlyFn(async (workspaceId: string) => {
  const db = getDb()
  const existing = await db.query.pipelines.findFirst({ where: and(eq(schema.pipelines.workspaceId, workspaceId), eq(schema.pipelines.isDefault, true)) })
  if (existing) return existing.id
  const id = newId()
  await db.batch([
    db.insert(schema.pipelines).values({ id, workspaceId, name: 'Sales', isDefault: true, createdAt: new Date() }),
    db.insert(schema.stages).values(DEFAULT_STAGES.map((s, i) => ({ id: newId(), workspaceId, pipelineId: id, ...s, sortOrder: i }))),
  ])
  return id
})

const dealSelect = {
  id: schema.deals.id,
  title: schema.deals.title,
  valueMinor: schema.deals.valueMinor,
  currency: schema.deals.currency,
  expectedCloseOn: schema.deals.expectedCloseOn,
  stageId: schema.deals.stageId,
  status: schema.deals.status,
  sortOrder: schema.deals.sortOrder,
  contactId: schema.deals.contactId,
  companyId: schema.deals.companyId,
  ownerUserId: schema.deals.ownerUserId,
  updatedAt: schema.deals.updatedAt,
  closedAt: schema.deals.closedAt,
  contactName: sql<string | null>`(select c.first_name || coalesce(' ' || c.last_name, '') from contacts c where c.id = ${schema.deals.contactId})`,
  companyName: sql<string | null>`(select co.name from companies co where co.id = ${schema.deals.companyId})`,
  ownerName: sql<string | null>`(select u.name from user u where u.id = ${schema.deals.ownerUserId})`,
}

/** Kanban: stages with their deals. Closed deals are included under their won/lost stage unless `openOnly`. */
export const getBoard = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().trim().max(100).optional(), openOnly: z.boolean().default(false) }).optional())
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const pipelineId = await ensureDefaultPipeline(ctx.workspaceId)
    const db = getDb()
    const conds = [eq(schema.deals.pipelineId, pipelineId)]
    if (data?.openOnly) conds.push(eq(schema.deals.status, 'open'))
    if (data?.q) conds.push(or(like(schema.deals.title, `%${data.q}%`), like(dealSelect.contactName, `%${data.q}%`), like(dealSelect.companyName, `%${data.q}%`))!)
    const [stageRows, dealRows] = await Promise.all([
      db.query.stages.findMany({ where: eq(schema.stages.pipelineId, pipelineId), orderBy: [asc(schema.stages.sortOrder)] }),
      db.select(dealSelect).from(schema.deals).where(and(...conds)).orderBy(asc(schema.deals.sortOrder), desc(schema.deals.updatedAt)),
    ])
    const tags = await tagsForRecords('deal', dealRows.map((d) => d.id))
    return {
      pipelineId,
      stages: stageRows.map((s) => {
        const list = dealRows.filter((d) => d.stageId === s.id).map((d) => ({ ...d, tags: tags.get(d.id) ?? [] }))
        const totals: Record<string, number> = {}
        for (const d of list) totals[d.currency] = (totals[d.currency] ?? 0) + d.valueMinor
        return { ...s, deals: list, totals }
      }),
    }
  })

export const listDeals = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        q: z.string().trim().max(100).optional(),
        status: z.enum(DEAL_STATUSES).optional(),
        stageId: z.string().optional(),
        contactId: z.string().optional(),
        companyId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        sort: z.enum(['updated', 'value', 'close']).default('updated'),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const conds = [eq(schema.deals.workspaceId, ctx.workspaceId)]
    if (data?.q) conds.push(or(like(schema.deals.title, `%${data.q}%`), like(dealSelect.contactName, `%${data.q}%`), like(dealSelect.companyName, `%${data.q}%`))!)
    if (data?.status) conds.push(eq(schema.deals.status, data.status))
    if (data?.stageId) conds.push(eq(schema.deals.stageId, data.stageId))
    if (data?.contactId) conds.push(eq(schema.deals.contactId, data.contactId))
    if (data?.companyId) conds.push(eq(schema.deals.companyId, data.companyId))
    const where = and(...conds)
    const page = data?.page ?? 1
    const PAGE = 50
    const order = data?.sort === 'value' ? desc(schema.deals.valueMinor) : data?.sort === 'close' ? asc(schema.deals.expectedCloseOn) : desc(schema.deals.updatedAt)
    const [rows, [{ total }], stageRows] = await Promise.all([
      db.select(dealSelect).from(schema.deals).where(where).orderBy(order).limit(PAGE).offset((page - 1) * PAGE),
      db.select({ total: sql<number>`count(*)` }).from(schema.deals).where(where),
      db.query.stages.findMany({ where: eq(schema.stages.workspaceId, ctx.workspaceId), orderBy: [asc(schema.stages.sortOrder)] }),
    ])
    const stageById = new Map(stageRows.map((s) => [s.id, s]))
    const tags = await tagsForRecords('deal', rows.map((d) => d.id))
    return {
      rows: rows.map((d) => ({ ...d, stageName: stageById.get(d.stageId)?.name ?? '', stageColor: stageById.get(d.stageId)?.color ?? 'gray', tags: tags.get(d.id) ?? [] })),
      total: total ?? 0,
      page,
      pageSize: PAGE,
      stages: stageRows,
    }
  })

export const getDeal = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const deal = await getDb().query.deals.findFirst({
      where: and(eq(schema.deals.id, data.id), eq(schema.deals.workspaceId, ctx.workspaceId)),
      with: {
        stage: true,
        contact: { columns: { id: true, firstName: true, lastName: true, email: true } },
        company: { columns: { id: true, name: true } },
        owner: { columns: { id: true, name: true } },
      },
    })
    if (!deal) return null
    const [tags, fieldValues, stageRows] = await Promise.all([
      tagsForRecords('deal', [deal.id]),
      valuesForRecord(deal.id),
      getDb().query.stages.findMany({ where: eq(schema.stages.pipelineId, deal.pipelineId), orderBy: [asc(schema.stages.sortOrder)] }),
    ])
    return { ...deal, tags: tags.get(deal.id) ?? [], fieldValues, stages: stageRows }
  })

const dealInput = z.object({
  title: z.string().trim().min(1).max(160),
  valueMinor: z.number().int().min(0).default(0),
  currency: z.string().regex(/^[A-Z]{3}$/),
  expectedCloseOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  stageId: z.string().optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  notes: z.string().trim().max(5000).optional(),
  tagIds: z.array(z.string()).optional(),
  fieldValues: z.record(z.string(), z.string().nullable()).optional(),
})

async function stageInWorkspace(stageId: string, workspaceId: string) {
  const s = await getDb().query.stages.findFirst({ where: and(eq(schema.stages.id, stageId), eq(schema.stages.workspaceId, workspaceId)) })
  if (!s) throw new Error('Stage not found')
  return s
}

export const createDeal = createServerFn({ method: 'POST' })
  .validator(dealInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const pipelineId = await ensureDefaultPipeline(ctx.workspaceId)
    const stage = data.stageId
      ? await stageInWorkspace(data.stageId, ctx.workspaceId)
      : (await db.query.stages.findFirst({ where: eq(schema.stages.pipelineId, pipelineId), orderBy: [asc(schema.stages.sortOrder)] }))!
    const [{ n }] = await db.select({ n: sql<number>`coalesce(min(sort_order), 0)` }).from(schema.deals).where(eq(schema.deals.stageId, stage.id))
    const now = new Date()
    const id = newId()
    const status = stage.kind === 'open' ? 'open' : stage.kind
    await db.batch([
      db.insert(schema.deals).values({
        id,
        workspaceId: ctx.workspaceId,
        pipelineId,
        stageId: stage.id,
        title: data.title,
        valueMinor: data.valueMinor,
        currency: data.currency,
        expectedCloseOn: data.expectedCloseOn ?? null,
        contactId: data.contactId ?? null,
        companyId: data.companyId ?? null,
        ownerUserId: data.ownerUserId ?? ctx.user.id,
        status,
        closedAt: status === 'open' ? null : now,
        sortOrder: (n ?? 0) - 1,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      }),
      activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: id, kind: 'created', body: `Created in ${stage.name}` }),
    ])
    if (data.tagIds) await replaceRecordTags(ctx.workspaceId, 'deal', id, data.tagIds)
    if (data.fieldValues) await writeFieldValues(ctx.workspaceId, 'deal', id, data.fieldValues)
    return { id }
  })

export const updateDeal = createServerFn({ method: 'POST' })
  .validator(dealInput.partial().extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const before = await db.query.deals.findFirst({ where: and(eq(schema.deals.id, data.id), eq(schema.deals.workspaceId, ctx.workspaceId)) })
    if (!before) throw new Error('Not found')
    const patch: Partial<typeof before> = {}
    if (data.title !== undefined) patch.title = data.title
    if (data.valueMinor !== undefined) patch.valueMinor = data.valueMinor
    if (data.currency !== undefined) patch.currency = data.currency
    if (data.expectedCloseOn !== undefined) patch.expectedCloseOn = data.expectedCloseOn
    if (data.contactId !== undefined) patch.contactId = data.contactId
    if (data.companyId !== undefined) patch.companyId = data.companyId
    if (data.ownerUserId !== undefined) patch.ownerUserId = data.ownerUserId
    if (data.notes !== undefined) patch.notes = data.notes || null
    const diff = diffFields(before, patch, ['title', 'valueMinor', 'currency', 'expectedCloseOn', 'contactId', 'companyId', 'ownerUserId'])
    const stmts = [db.update(schema.deals).set({ ...patch, updatedAt: new Date() }).where(eq(schema.deals.id, data.id))]
    if (diff) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: data.id, kind: 'updated', meta: diff }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    if (data.tagIds) {
      const changed = await replaceRecordTags(ctx.workspaceId, 'deal', data.id, data.tagIds)
      if (changed) await activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: data.id, kind: 'updated', meta: { tags: [changed.before, changed.after] } })
    }
    if (data.fieldValues) await writeFieldValues(ctx.workspaceId, 'deal', data.id, data.fieldValues)
    if (data.stageId && data.stageId !== before.stageId) await moveDeal({ data: { id: data.id, stageId: data.stageId } })
    return { ok: true }
  })

/**
 * Move a deal to a stage (and optionally a position). Moving into a won/lost stage
 * closes the deal; moving back into an open stage reopens it.
 */
export const moveDeal = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), stageId: z.string(), index: z.number().int().min(0).optional(), lostReason: z.string().trim().max(500).optional() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const deal = await db.query.deals.findFirst({ where: and(eq(schema.deals.id, data.id), eq(schema.deals.workspaceId, ctx.workspaceId)) })
    if (!deal) throw new Error('Not found')
    const stage = await stageInWorkspace(data.stageId, ctx.workspaceId)
    const from = await db.query.stages.findFirst({ where: eq(schema.stages.id, deal.stageId) })
    const siblings = (await db.select({ id: schema.deals.id }).from(schema.deals).where(and(eq(schema.deals.stageId, stage.id), sql`${schema.deals.id} != ${deal.id}`)).orderBy(asc(schema.deals.sortOrder), desc(schema.deals.updatedAt))).map((d) => d.id)
    const idx = Math.min(data.index ?? 0, siblings.length)
    siblings.splice(idx, 0, deal.id)
    const now = new Date()
    const status = stage.kind === 'open' ? 'open' : stage.kind
    const stmts = siblings.map((id, i) => db.update(schema.deals).set({ sortOrder: i }).where(eq(schema.deals.id, id)))
    stmts.push(
      db
        .update(schema.deals)
        .set({
          stageId: stage.id,
          status,
          closedAt: status === 'open' ? null : (deal.closedAt ?? now),
          lostReason: status === 'lost' ? (data.lostReason ?? deal.lostReason) : null,
          updatedAt: now,
        })
        .where(eq(schema.deals.id, deal.id)),
    )
    if (stage.id !== deal.stageId) {
      const body = status === 'won' ? 'Marked won' : status === 'lost' ? `Marked lost${data.lostReason ? `: ${data.lostReason}` : ''}` : `Moved from ${from?.name ?? '?'} to ${stage.name}`
      stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'deal', targetId: deal.id, kind: 'system', body, meta: { stage: [from?.name ?? null, stage.name] } }) as never)
    }
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { ok: true, status }
  })

export const deleteDeal = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    await db.batch([
      db.delete(schema.deals).where(and(eq(schema.deals.id, data.id), eq(schema.deals.workspaceId, ctx.workspaceId))),
      db.delete(schema.taggings).where(and(eq(schema.taggings.recordType, 'deal'), eq(schema.taggings.recordId, data.id))),
      db.delete(schema.fieldValues).where(eq(schema.fieldValues.recordId, data.id)),
      db.delete(schema.activities).where(and(eq(schema.activities.targetType, 'deal'), eq(schema.activities.targetId, data.id))),
    ])
    return { ok: true }
  })

// ── Stages (settings) ──────────────────────────────────────────────────────

export const listStages = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const pipelineId = await ensureDefaultPipeline(ctx.workspaceId)
  return getDb().query.stages.findMany({ where: eq(schema.stages.pipelineId, pipelineId), orderBy: [asc(schema.stages.sortOrder)] })
})

const stageInput = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(STAGE_KINDS).default('open'), probability: z.number().int().min(0).max(100).default(0), color: z.string().max(20).default('gray') })

export const createStage = createServerFn({ method: 'POST' })
  .validator(stageInput)
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const pipelineId = await ensureDefaultPipeline(ctx.workspaceId)
    const db = getDb()
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.stages).where(eq(schema.stages.pipelineId, pipelineId))
    const id = newId()
    await db.insert(schema.stages).values({ id, workspaceId: ctx.workspaceId, pipelineId, ...data, sortOrder: n ?? 0 })
    return { id }
  })

export const updateStage = createServerFn({ method: 'POST' })
  .validator(stageInput.partial().extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const { id, ...rest } = data
    await getDb().update(schema.stages).set(rest).where(and(eq(schema.stages.id, id), eq(schema.stages.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })

export const reorderStages = createServerFn({ method: 'POST' })
  .validator(z.object({ ids: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const db = getDb()
    const stmts = data.ids.map((id, i) => db.update(schema.stages).set({ sortOrder: i }).where(and(eq(schema.stages.id, id), eq(schema.stages.workspaceId, ctx.workspaceId))))
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { ok: true }
  })

/** Deals in the stage move to `moveToStageId`. */
export const deleteStage = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), moveToStageId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    if (data.id === data.moveToStageId) throw new Error('Pick a different stage')
    const db = getDb()
    const target = await stageInWorkspace(data.moveToStageId, ctx.workspaceId)
    await stageInWorkspace(data.id, ctx.workspaceId)
    const status = target.kind === 'open' ? 'open' : target.kind
    await db.batch([
      db.update(schema.deals).set({ stageId: target.id, status, updatedAt: new Date() }).where(eq(schema.deals.stageId, data.id)),
      db.delete(schema.stages).where(eq(schema.stages.id, data.id)),
    ])
    return { ok: true }
  })

/** For dashboard: open pipeline value by stage and weighted total, per currency. */
export const getPipelineSummary = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const pipelineId = await ensureDefaultPipeline(ctx.workspaceId)
  const rows = await getDb()
    .select({ stageId: schema.stages.id, stageName: schema.stages.name, color: schema.stages.color, probability: schema.stages.probability, currency: schema.deals.currency, total: sql<number>`coalesce(sum(${schema.deals.valueMinor}), 0)`, count: sql<number>`count(${schema.deals.id})` })
    .from(schema.stages)
    .leftJoin(schema.deals, and(eq(schema.deals.stageId, schema.stages.id), eq(schema.deals.status, 'open')))
    .where(and(eq(schema.stages.pipelineId, pipelineId), eq(schema.stages.kind, 'open')))
    .groupBy(schema.stages.id, schema.deals.currency)
    .orderBy(asc(schema.stages.sortOrder))
  const wonLost = await getDb()
    .select({ status: schema.deals.status, currency: schema.deals.currency, total: sql<number>`sum(${schema.deals.valueMinor})`, count: sql<number>`count(*)` })
    .from(schema.deals)
    .where(and(eq(schema.deals.workspaceId, ctx.workspaceId), inArray(schema.deals.status, ['won', 'lost']), sql`${schema.deals.closedAt} >= ${Date.now() - 30 * 86_400_000}`))
    .groupBy(schema.deals.status, schema.deals.currency)
  return { byStage: rows.filter((r) => r.currency), last30Days: wonLost }
})
