import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { ACTIVITY_KINDS, RECORD_TYPES, type ActivityKind, type ActivityMeta, type RecordType } from '#/db/schema/crm'
import { newId } from '#/lib/ids'
import { requireWorkspace } from '#/lib/session'

type LogArgs = {
  workspaceId: string
  userId: string | null
  targetType: RecordType
  targetId: string
  kind: ActivityKind
  body?: string | null
  meta?: ActivityMeta | null
  occurredAt?: Date
}

/** Build an insert statement for an activity. Callers add it to a batch or await it. */
export const activityInsert = createServerOnlyFn((a: LogArgs) => {
  const now = new Date()
  return getDb()
    .insert(schema.activities)
    .values({
      id: newId(),
      workspaceId: a.workspaceId,
      userId: a.userId,
      targetType: a.targetType,
      targetId: a.targetId,
      kind: a.kind,
      body: a.body ?? null,
      meta: a.meta ?? null,
      occurredAt: a.occurredAt ?? now,
      createdAt: now,
    })
})

/** { field: [before, after] } for every changed key, or null when nothing changed. */
export const diffFields = createServerOnlyFn(
  <T extends Record<string, unknown>>(before: T, after: Partial<T>, keys: (keyof T & string)[]) => {
    const out: ActivityMeta = {}
    const prim = (v: unknown): string | number | null => (v == null ? null : typeof v === 'number' ? v : String(v))
    for (const k of keys) {
      if (!(k in after)) continue
      const a = prim(before[k])
      const b = prim(after[k])
      if (a !== b) out[k] = [a, b]
    }
    return Object.keys(out).length ? out : null
  },
)

export const listActivities = createServerFn({ method: 'GET' })
  .validator(z.object({ targetType: z.enum(RECORD_TYPES), targetId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    return getDb().query.activities.findMany({
      where: and(eq(schema.activities.workspaceId, ctx.workspaceId), eq(schema.activities.targetType, data.targetType), eq(schema.activities.targetId, data.targetId)),
      orderBy: [desc(schema.activities.occurredAt), desc(schema.activities.createdAt)],
      with: { user: { columns: { id: true, name: true } } },
      limit: 200,
    })
  })

export const addActivity = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      targetType: z.enum(RECORD_TYPES),
      targetId: z.string(),
      kind: z.enum(['note', 'call', 'meeting', 'email'] satisfies ActivityKind[]),
      body: z.string().trim().min(1).max(10_000),
      occurredAt: z.string().datetime().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await activityInsert({
      workspaceId: ctx.workspaceId,
      userId: ctx.user.id,
      targetType: data.targetType,
      targetId: data.targetId,
      kind: data.kind,
      body: data.body,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
    })
    return { ok: true }
  })

export const deleteActivity = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const row = await db.query.activities.findFirst({ where: and(eq(schema.activities.id, data.id), eq(schema.activities.workspaceId, ctx.workspaceId)) })
    if (!row) throw new Error('Not found')
    if (row.kind === 'created' || row.kind === 'updated' || row.kind === 'system') throw new Error('Auto-logged entries cannot be deleted')
    await db.delete(schema.activities).where(eq(schema.activities.id, data.id))
    return { ok: true }
  })

export { ACTIVITY_KINDS }
