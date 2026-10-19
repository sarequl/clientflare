import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { RECORD_TYPES, type RecordType } from '#/db/schema/crm'
import { newId } from '#/lib/ids'
import { requireWorkspace } from '#/lib/session'
import { uniqueAs } from '#/lib/db-errors'

export const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const

export const listTags = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  return getDb().query.tags.findMany({ where: eq(schema.tags.workspaceId, ctx.workspaceId), orderBy: [schema.tags.name] })
})

const tagInput = z.object({ name: z.string().trim().min(1).max(40), color: z.enum(TAG_COLORS).default('gray') })

export const createTag = createServerFn({ method: 'POST' })
  .validator(tagInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const id = newId()
    await getDb().insert(schema.tags).values({ id, workspaceId: ctx.workspaceId, ...data, createdAt: new Date() }).catch(uniqueAs('A tag with that name already exists'))
    return { id }
  })

export const updateTag = createServerFn({ method: 'POST' })
  .validator(tagInput.extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const { id, ...rest } = data
    await getDb().update(schema.tags).set(rest).where(and(eq(schema.tags.id, id), eq(schema.tags.workspaceId, ctx.workspaceId))).catch(uniqueAs('A tag with that name already exists'))
    return { ok: true }
  })

export const deleteTag = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb().delete(schema.tags).where(and(eq(schema.tags.id, data.id), eq(schema.tags.workspaceId, ctx.workspaceId)))
    return { ok: true } // taggings cascade
  })

/**
 * Replace the tag set on a record. Tag ids outside the workspace are ignored.
 * Returns { before, after } as comma-joined names when the set changed, else null.
 */
export const replaceRecordTags = createServerOnlyFn(async (workspaceId: string, recordType: RecordType, recordId: string, tagIds: string[]) => {
  const db = getDb()
  const [all, current] = await Promise.all([
    db.query.tags.findMany({ where: eq(schema.tags.workspaceId, workspaceId), columns: { id: true, name: true } }),
    db.query.taggings.findMany({ where: and(eq(schema.taggings.recordType, recordType), eq(schema.taggings.recordId, recordId)), columns: { tagId: true } }),
  ])
  const nameOf = new Map(all.map((t) => [t.id, t.name]))
  const valid = [...new Set(tagIds)].filter((id) => nameOf.has(id))
  const beforeIds = current.map((c) => c.tagId).sort()
  const afterIds = [...valid].sort()
  if (beforeIds.join() === afterIds.join()) return null
  const del = db.delete(schema.taggings).where(and(eq(schema.taggings.recordType, recordType), eq(schema.taggings.recordId, recordId)))
  if (valid.length) {
    await db.batch([del, db.insert(schema.taggings).values(valid.map((tagId) => ({ tagId, recordType, recordId })))])
  } else await del
  const names = (ids: string[]) => ids.map((id) => nameOf.get(id)).filter(Boolean).join(', ') || null
  return { before: names(beforeIds), after: names(afterIds) }
})

/** Map of recordId → tags, for list views. */
export const tagsForRecords = createServerOnlyFn(async (recordType: RecordType, recordIds: string[]) => {
  const out = new Map<string, { id: string; name: string; color: string }[]>()
  if (!recordIds.length) return out
  const rows = await getDb()
    .select({ recordId: schema.taggings.recordId, id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
    .from(schema.taggings)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.taggings.tagId))
    .where(and(eq(schema.taggings.recordType, recordType), inArray(schema.taggings.recordId, recordIds)))
  for (const r of rows) {
    const list = out.get(r.recordId) ?? []
    list.push({ id: r.id, name: r.name, color: r.color })
    out.set(r.recordId, list)
  }
  return out
})

export const setRecordTags = createServerFn({ method: 'POST' })
  .validator(z.object({ recordType: z.enum(RECORD_TYPES), recordId: z.string(), tagIds: z.array(z.string()) }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await replaceRecordTags(ctx.workspaceId, data.recordType, data.recordId, data.tagIds)
    return { ok: true }
  })
