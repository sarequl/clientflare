import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { FIELD_KINDS, RECORD_TYPES, type RecordType } from '#/db/schema/crm'
import { newId } from '#/lib/ids'
import { requireRole, requireWorkspace } from '#/lib/session'
import { uniqueAs } from '#/lib/db-errors'

export const listFields = createServerFn({ method: 'GET' })
  .validator(z.object({ recordType: z.enum(RECORD_TYPES) }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    return getDb().query.customFields.findMany({
      where: and(eq(schema.customFields.workspaceId, ctx.workspaceId), eq(schema.customFields.recordType, data.recordType)),
      orderBy: [schema.customFields.sortOrder, schema.customFields.createdAt],
    })
  })

const fieldInput = z
  .object({
    recordType: z.enum(RECORD_TYPES),
    name: z.string().trim().min(1).max(60),
    kind: z.enum(FIELD_KINDS),
    options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  })
  .refine((f) => f.kind !== 'select' || (f.options && f.options.length > 0), { message: 'Select fields need at least one option', path: ['options'] })

export const createField = createServerFn({ method: 'POST' })
  .validator(fieldInput)
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const db = getDb()
    const existing = await db.query.customFields.findMany({ where: and(eq(schema.customFields.workspaceId, ctx.workspaceId), eq(schema.customFields.recordType, data.recordType)), columns: { id: true } })
    const id = newId()
    await db.insert(schema.customFields).values({
      id,
      workspaceId: ctx.workspaceId,
      recordType: data.recordType,
      name: data.name,
      kind: data.kind,
      options: data.kind === 'select' ? data.options! : null,
      sortOrder: existing.length,
      createdAt: new Date(),
    }).catch(uniqueAs('A field with that name already exists'))
    return { id }
  })

/** Kind is immutable after creation; values would stop parsing. */
export const updateField = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), name: z.string().trim().min(1).max(60), options: z.array(z.string().trim().min(1).max(60)).max(50).optional(), sortOrder: z.number().int().min(0).optional() }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const db = getDb()
    const field = await db.query.customFields.findFirst({ where: and(eq(schema.customFields.id, data.id), eq(schema.customFields.workspaceId, ctx.workspaceId)) })
    if (!field) throw new Error('Not found')
    await db
      .update(schema.customFields)
      .set({ name: data.name, options: field.kind === 'select' ? (data.options ?? field.options) : null, sortOrder: data.sortOrder ?? field.sortOrder })
      .where(eq(schema.customFields.id, data.id))
      .catch(uniqueAs('A field with that name already exists'))
    return { ok: true }
  })

export const deleteField = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    await getDb().delete(schema.customFields).where(and(eq(schema.customFields.id, data.id), eq(schema.customFields.workspaceId, ctx.workspaceId)))
    return { ok: true } // values cascade
  })

export type FieldValueInput = Record<string, string | null>

/** Validate values against field kinds. Returns cleaned { fieldId: value } with blanks removed. */
export const cleanFieldValues = createServerOnlyFn(async (workspaceId: string, recordType: RecordType, values: FieldValueInput) => {
  const ids = Object.keys(values)
  if (!ids.length) return {} as Record<string, string>
  const fields = await getDb().query.customFields.findMany({
    where: and(eq(schema.customFields.workspaceId, workspaceId), eq(schema.customFields.recordType, recordType), inArray(schema.customFields.id, ids)),
  })
  const out: Record<string, string> = {}
  for (const f of fields) {
    const raw = values[f.id]
    if (raw == null || raw.trim() === '') continue
    const v = raw.trim()
    if (f.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) throw new Error(`${f.name}: not a number`)
    if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f.name}: use YYYY-MM-DD`)
    if (f.kind === 'select' && !(f.options ?? []).includes(v)) throw new Error(`${f.name}: not an option`)
    out[f.id] = v
  }
  return out
})

/** Write cleaned values. Missing keys are left alone; explicit null/blank in `values` clears. */
export const writeFieldValues = createServerOnlyFn(async (workspaceId: string, recordType: RecordType, recordId: string, values: FieldValueInput) => {
  const db = getDb()
  const cleaned = await cleanFieldValues(workspaceId, recordType, values)
  const touched = Object.keys(values)
  if (!touched.length) return
  const stmts = [db.delete(schema.fieldValues).where(and(eq(schema.fieldValues.recordId, recordId), inArray(schema.fieldValues.fieldId, touched)))]
  const rows = Object.entries(cleaned).map(([fieldId, value]) => ({ fieldId, recordId, value }))
  if (rows.length) stmts.push(db.insert(schema.fieldValues).values(rows) as never)
  await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
})

/** Same rules as cleanFieldValues, but loads the field list once for many rows. */
export const makeFieldCleaner = createServerOnlyFn(async (workspaceId: string, recordType: RecordType, fieldIds: string[]) => {
  const fields = fieldIds.length
    ? await getDb().query.customFields.findMany({ where: and(eq(schema.customFields.workspaceId, workspaceId), eq(schema.customFields.recordType, recordType), inArray(schema.customFields.id, fieldIds)) })
    : []
  return (values: FieldValueInput) => {
    const out: Record<string, string> = {}
    for (const f of fields) {
      const raw = values[f.id]
      if (raw == null || raw.trim() === '') continue
      const v = raw.trim()
      if (f.kind === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) throw new Error(`${f.name}: not a number`)
      if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f.name}: use YYYY-MM-DD`)
      if (f.kind === 'select' && !(f.options ?? []).includes(v)) throw new Error(`${f.name}: not an option`)
      out[f.id] = v
    }
    return out
  }
})

export const valuesForRecord = createServerOnlyFn(async (recordId: string) => {
  const rows = await getDb().query.fieldValues.findMany({ where: eq(schema.fieldValues.recordId, recordId) })
  return Object.fromEntries(rows.map((r) => [r.fieldId, r.value])) as Record<string, string>
})

export const valuesForRecords = createServerOnlyFn(async (recordIds: string[]) => {
  const out = new Map<string, Record<string, string>>()
  if (!recordIds.length) return out
  const rows = await getDb().query.fieldValues.findMany({ where: inArray(schema.fieldValues.recordId, recordIds) })
  for (const r of rows) {
    const m = out.get(r.recordId) ?? {}
    m[r.fieldId] = r.value
    out.set(r.recordId, m)
  }
  return out
})
