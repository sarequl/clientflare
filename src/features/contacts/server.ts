import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { requireWorkspace } from '#/lib/session'
import { activityInsert, diffFields } from '#/features/activities/server'
import { replaceRecordTags, tagsForRecords } from '#/features/tags/server'
import { valuesForRecord, writeFieldValues } from '#/features/custom-fields/server'
import { deleteRecordFiles } from '#/features/files/server'

const PAGE = 50

export const listContacts = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        q: z.string().trim().max(100).optional(),
        tagId: z.string().optional(),
        companyId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        sort: z.enum(['name', 'updated']).default('name'),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const conds = [eq(schema.contacts.workspaceId, ctx.workspaceId)]
    if (data?.q) {
      const p = `%${data.q}%`
      conds.push(or(like(schema.contacts.firstName, p), like(schema.contacts.lastName, p), like(schema.contacts.email, p), like(schema.contacts.phone, p), like(schema.companies.name, p))!)
    }
    if (data?.companyId) conds.push(eq(schema.contacts.companyId, data.companyId))
    if (data?.tagId) {
      conds.push(
        inArray(
          schema.contacts.id,
          db.select({ id: schema.taggings.recordId }).from(schema.taggings).where(and(eq(schema.taggings.tagId, data.tagId), eq(schema.taggings.recordType, 'contact'))),
        ),
      )
    }
    const where = and(...conds)
    const page = data?.page ?? 1
    const base = db
      .select({
        id: schema.contacts.id,
        firstName: schema.contacts.firstName,
        lastName: schema.contacts.lastName,
        email: schema.contacts.email,
        phone: schema.contacts.phone,
        jobTitle: schema.contacts.jobTitle,
        companyId: schema.contacts.companyId,
        companyName: schema.companies.name,
        updatedAt: schema.contacts.updatedAt,
      })
      .from(schema.contacts)
      .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(where)
    const [rows, [{ total }]] = await Promise.all([
      base
        .orderBy(...(data?.sort === 'updated' ? [desc(schema.contacts.updatedAt)] : [asc(schema.contacts.firstName), asc(schema.contacts.lastName)]))
        .limit(PAGE)
        .offset((page - 1) * PAGE),
      db.select({ total: sql<number>`count(*)` }).from(schema.contacts).leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId)).where(where),
    ])
    const tags = await tagsForRecords('contact', rows.map((r) => r.id))
    return { rows: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })), total: total ?? 0, page, pageSize: PAGE }
  })

export const searchContacts = createServerFn({ method: 'GET' })
  .validator(z.object({ q: z.string().trim().max(100).default('') }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const p = `%${data.q}%`
    return getDb()
      .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, email: schema.contacts.email })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.workspaceId, ctx.workspaceId), data.q ? or(like(schema.contacts.firstName, p), like(schema.contacts.lastName, p), like(schema.contacts.email, p)) : undefined))
      .orderBy(asc(schema.contacts.firstName))
      .limit(20)
  })

export const getContact = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const contact = await getDb().query.contacts.findFirst({
      where: and(eq(schema.contacts.id, data.id), eq(schema.contacts.workspaceId, ctx.workspaceId)),
      with: { company: { columns: { id: true, name: true } }, owner: { columns: { id: true, name: true } } },
    })
    if (!contact) return null
    const [tags, fieldValues] = await Promise.all([tagsForRecords('contact', [contact.id]), valuesForRecord(contact.id)])
    return { ...contact, tags: tags.get(contact.id) ?? [], fieldValues }
  })

const contactInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(200).or(z.literal('')).optional(),
  phone: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(5000).optional(),
  companyId: z.string().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  fieldValues: z.record(z.string(), z.string().nullable()).optional(),
})

const nullBlank = (s: string | undefined) => (s && s.length ? s : null)

async function assertCompanyInWorkspace(companyId: string | null | undefined, workspaceId: string) {
  if (!companyId) return
  const c = await getDb().query.companies.findFirst({ where: and(eq(schema.companies.id, companyId), eq(schema.companies.workspaceId, workspaceId)), columns: { id: true } })
  if (!c) throw new Error('Company not found')
}

export const createContact = createServerFn({ method: 'POST' })
  .validator(contactInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await assertCompanyInWorkspace(data.companyId, ctx.workspaceId)
    const db = getDb()
    const now = new Date()
    const id = newId()
    await db.batch([
      db.insert(schema.contacts).values({
        id,
        workspaceId: ctx.workspaceId,
        companyId: data.companyId ?? null,
        firstName: data.firstName,
        lastName: nullBlank(data.lastName),
        email: nullBlank(data.email),
        phone: nullBlank(data.phone),
        jobTitle: nullBlank(data.jobTitle),
        notes: nullBlank(data.notes),
        ownerUserId: data.ownerUserId ?? ctx.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'contact', targetId: id, kind: 'created' }),
    ])
    if (data.tagIds) await replaceRecordTags(ctx.workspaceId, 'contact', id, data.tagIds)
    if (data.fieldValues) await writeFieldValues(ctx.workspaceId, 'contact', id, data.fieldValues)
    return { id }
  })

export const updateContact = createServerFn({ method: 'POST' })
  .validator(contactInput.partial().extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const before = await db.query.contacts.findFirst({ where: and(eq(schema.contacts.id, data.id), eq(schema.contacts.workspaceId, ctx.workspaceId)) })
    if (!before) throw new Error('Not found')
    if (data.companyId !== undefined) await assertCompanyInWorkspace(data.companyId, ctx.workspaceId)
    const patch: Partial<typeof before> = {}
    if (data.firstName !== undefined) patch.firstName = data.firstName
    if (data.lastName !== undefined) patch.lastName = nullBlank(data.lastName)
    if (data.email !== undefined) patch.email = nullBlank(data.email)
    if (data.phone !== undefined) patch.phone = nullBlank(data.phone)
    if (data.jobTitle !== undefined) patch.jobTitle = nullBlank(data.jobTitle)
    if (data.notes !== undefined) patch.notes = nullBlank(data.notes)
    if (data.companyId !== undefined) patch.companyId = data.companyId
    if (data.ownerUserId !== undefined) patch.ownerUserId = data.ownerUserId
    const diff = diffFields(before, patch, ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'companyId', 'ownerUserId'])
    const stmts = [db.update(schema.contacts).set({ ...patch, updatedAt: new Date() }).where(eq(schema.contacts.id, data.id))]
    if (diff) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'contact', targetId: data.id, kind: 'updated', meta: diff }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    if (data.tagIds) {
      const changed = await replaceRecordTags(ctx.workspaceId, 'contact', data.id, data.tagIds)
      if (changed) await activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'contact', targetId: data.id, kind: 'updated', meta: { tags: [changed.before, changed.after] } })
    }
    if (data.fieldValues) await writeFieldValues(ctx.workspaceId, 'contact', data.id, data.fieldValues)
    return { ok: true }
  })

export const deleteContact = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    await deleteRecordFiles(ctx.workspaceId, 'contact', data.id)
    await db.batch([
      db.delete(schema.contacts).where(and(eq(schema.contacts.id, data.id), eq(schema.contacts.workspaceId, ctx.workspaceId))),
      db.delete(schema.taggings).where(and(eq(schema.taggings.recordType, 'contact'), eq(schema.taggings.recordId, data.id))),
      db.delete(schema.fieldValues).where(eq(schema.fieldValues.recordId, data.id)),
      db.delete(schema.activities).where(and(eq(schema.activities.targetType, 'contact'), eq(schema.activities.targetId, data.id))),
    ])
    return { ok: true }
  })
