import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { requireWorkspace } from '#/lib/session'
import { activityInsert, diffFields } from '#/features/activities/server'
import { replaceRecordTags, tagsForRecords } from '#/features/tags/server'
import { valuesForRecord, valuesForRecords, writeFieldValues } from '#/features/custom-fields/server'
import { deleteRecordFiles } from '#/features/files/server'

const PAGE = 50

export const listCompanies = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().trim().max(100).optional(), tagId: z.string().optional(), page: z.number().int().min(1).default(1), sort: z.enum(['name', 'updated']).default('name') }).optional())
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const q = data?.q
    const conds = [eq(schema.companies.workspaceId, ctx.workspaceId)]
    if (q) conds.push(or(like(schema.companies.name, `%${q}%`), like(schema.companies.domain, `%${q}%`))!)
    if (data?.tagId) {
      conds.push(
        inArray(
          schema.companies.id,
          db.select({ id: schema.taggings.recordId }).from(schema.taggings).where(and(eq(schema.taggings.tagId, data.tagId), eq(schema.taggings.recordType, 'company'))),
        ),
      )
    }
    const where = and(...conds)
    const page = data?.page ?? 1
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: schema.companies.id,
          name: schema.companies.name,
          domain: schema.companies.domain,
          phone: schema.companies.phone,
          updatedAt: schema.companies.updatedAt,
          contactCount: sql<number>`(select count(*) from contacts c where c.company_id = ${schema.companies.id})`,
        })
        .from(schema.companies)
        .where(where)
        .orderBy(data?.sort === 'updated' ? desc(schema.companies.updatedAt) : asc(schema.companies.name))
        .limit(PAGE)
        .offset((page - 1) * PAGE),
      db.select({ total: sql<number>`count(*)` }).from(schema.companies).where(where),
    ])
    const tags = await tagsForRecords('company', rows.map((r) => r.id))
    return { rows: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })), total: total ?? 0, page, pageSize: PAGE }
  })

/** Lightweight list for pickers. */
export const searchCompanies = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().trim().max(100).default('') }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    return getDb()
      .select({ id: schema.companies.id, name: schema.companies.name })
      .from(schema.companies)
      .where(and(eq(schema.companies.workspaceId, ctx.workspaceId), data.q ? like(schema.companies.name, `%${data.q}%`) : undefined))
      .orderBy(asc(schema.companies.name))
      .limit(20)
  })

export const getCompany = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const company = await db.query.companies.findFirst({
      where: and(eq(schema.companies.id, data.id), eq(schema.companies.workspaceId, ctx.workspaceId)),
      with: { owner: { columns: { id: true, name: true } }, contacts: { orderBy: [asc(schema.contacts.firstName)] } },
    })
    if (!company) return null
    const [tags, fieldValues] = await Promise.all([tagsForRecords('company', [company.id]), valuesForRecord(company.id)])
    return { ...company, tags: tags.get(company.id) ?? [], fieldValues }
  })

const companyInput = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().max(120).optional(),
  website: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  ownerUserId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  fieldValues: z.record(z.string(), z.string().nullable()).optional(),
})

const nullBlank = (s: string | undefined) => (s && s.length ? s : null)

export const createCompany = createServerFn({ method: 'POST' })
  .validator(companyInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const now = new Date()
    const id = newId()
    await db.batch([
      db.insert(schema.companies).values({
        id,
        workspaceId: ctx.workspaceId,
        name: data.name,
        domain: nullBlank(data.domain),
        website: nullBlank(data.website),
        phone: nullBlank(data.phone),
        address: nullBlank(data.address),
        notes: nullBlank(data.notes),
        ownerUserId: data.ownerUserId ?? ctx.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'company', targetId: id, kind: 'created' }),
    ])
    if (data.tagIds) await replaceRecordTags(ctx.workspaceId, 'company', id, data.tagIds)
    if (data.fieldValues) await writeFieldValues(ctx.workspaceId, 'company', id, data.fieldValues)
    return { id }
  })

export const updateCompany = createServerFn({ method: 'POST' })
  .validator(companyInput.partial().extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const before = await db.query.companies.findFirst({ where: and(eq(schema.companies.id, data.id), eq(schema.companies.workspaceId, ctx.workspaceId)) })
    if (!before) throw new Error('Not found')
    const patch: Partial<typeof before> = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.domain !== undefined) patch.domain = nullBlank(data.domain)
    if (data.website !== undefined) patch.website = nullBlank(data.website)
    if (data.phone !== undefined) patch.phone = nullBlank(data.phone)
    if (data.address !== undefined) patch.address = nullBlank(data.address)
    if (data.notes !== undefined) patch.notes = nullBlank(data.notes)
    if (data.ownerUserId !== undefined) patch.ownerUserId = data.ownerUserId
    const diff = diffFields(before, patch, ['name', 'domain', 'website', 'phone', 'address', 'ownerUserId'])
    const stmts = [db.update(schema.companies).set({ ...patch, updatedAt: new Date() }).where(eq(schema.companies.id, data.id))]
    if (diff) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'company', targetId: data.id, kind: 'updated', meta: diff }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    if (data.tagIds) {
      const changed = await replaceRecordTags(ctx.workspaceId, 'company', data.id, data.tagIds)
      if (changed) await activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'company', targetId: data.id, kind: 'updated', meta: { tags: [changed.before, changed.after] } })
    }
    if (data.fieldValues) await writeFieldValues(ctx.workspaceId, 'company', data.id, data.fieldValues)
    return { ok: true }
  })

export const deleteCompany = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    await deleteRecordFiles(ctx.workspaceId, 'company', data.id)
    await db.batch([
      db.delete(schema.companies).where(and(eq(schema.companies.id, data.id), eq(schema.companies.workspaceId, ctx.workspaceId))),
      db.delete(schema.taggings).where(and(eq(schema.taggings.recordType, 'company'), eq(schema.taggings.recordId, data.id))),
      db.delete(schema.fieldValues).where(eq(schema.fieldValues.recordId, data.id)),
      db.delete(schema.activities).where(and(eq(schema.activities.targetType, 'company'), eq(schema.activities.targetId, data.id))),
    ])
    return { ok: true }
  })

export { valuesForRecords }
