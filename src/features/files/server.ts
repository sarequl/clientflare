import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { FILE_RECORD_TYPES } from '#/db/schema/tasks'
import { requireWorkspace } from '#/lib/session'

export const MAX_FILE_BYTES = 25 * 1024 * 1024

export const listFiles = createServerFn({ method: 'GET' })
  .validator(z.object({ recordType: z.enum(FILE_RECORD_TYPES), recordId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    return getDb().query.files.findMany({
      where: and(eq(schema.files.workspaceId, ctx.workspaceId), eq(schema.files.recordType, data.recordType), eq(schema.files.recordId, data.recordId)),
      orderBy: [desc(schema.files.createdAt)],
      with: { uploadedBy: { columns: { id: true, name: true } } },
    })
  })

/** Remove every file (R2 object + row) attached to a record. Called by record delete fns. */
export const deleteRecordFiles = createServerOnlyFn(async (workspaceId: string, recordType: (typeof FILE_RECORD_TYPES)[number], recordId: string) => {
  const db = getDb()
  const rows = await db.query.files.findMany({ where: and(eq(schema.files.workspaceId, workspaceId), eq(schema.files.recordType, recordType), eq(schema.files.recordId, recordId)) })
  if (!rows.length) return
  await env.FILES.delete(rows.map((r) => r.key))
  await db.delete(schema.files).where(and(eq(schema.files.recordType, recordType), eq(schema.files.recordId, recordId)))
})

export const deleteFile = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const f = await db.query.files.findFirst({ where: and(eq(schema.files.id, data.id), eq(schema.files.workspaceId, ctx.workspaceId)) })
    if (!f) throw new Error('Not found')
    await env.FILES.delete(f.key)
    await db.delete(schema.files).where(eq(schema.files.id, f.id))
    return { ok: true }
  })

export const setFileShared = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), shared: z.boolean() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb().update(schema.files).set({ sharedToPortal: data.shared }).where(and(eq(schema.files.id, data.id), eq(schema.files.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })
