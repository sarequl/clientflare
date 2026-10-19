import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { getAuth } from '#/lib/auth'
import { getDb, schema } from '#/db'
import { FILE_RECORD_TYPES, type FileRecordType } from '#/db/schema/tasks'
import { newId } from '#/lib/ids'
import { MAX_FILE_BYTES } from '#/features/files/server'

/** multipart/form-data: file, recordType, recordId. Returns the file row. */
export const Route = createFileRoute('/api/files/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getAuth().api.getSession({ headers: request.headers })
        const workspaceId = session?.session.activeOrganizationId
        if (!session || !workspaceId) return new Response('Unauthorized', { status: 401 })
        const form = await request.formData()
        const file = form.get('file')
        const recordType = String(form.get('recordType') ?? '') as FileRecordType
        const recordId = String(form.get('recordId') ?? '')
        if (!(file instanceof File) || !FILE_RECORD_TYPES.includes(recordType) || !recordId) return new Response('Bad request', { status: 400 })
        if (file.size > MAX_FILE_BYTES) return new Response('File too large', { status: 413 })
        const db = getDb()
        const owned =
          recordType === 'contact'
            ? await db.query.contacts.findFirst({ where: and(eq(schema.contacts.id, recordId), eq(schema.contacts.workspaceId, workspaceId)), columns: { id: true } })
            : recordType === 'company'
              ? await db.query.companies.findFirst({ where: and(eq(schema.companies.id, recordId), eq(schema.companies.workspaceId, workspaceId)), columns: { id: true } })
              : recordType === 'deal'
                ? await db.query.deals.findFirst({ where: and(eq(schema.deals.id, recordId), eq(schema.deals.workspaceId, workspaceId)), columns: { id: true } })
                : null
        if (!owned) return new Response('Record not found', { status: 404 })
        const id = newId()
        const safeName = file.name.replace(/[^\w.\-()+ ]/g, '_').slice(0, 150) || 'file'
        const key = `${workspaceId}/${id}/${safeName}`
        await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } })
        const row = {
          id,
          workspaceId,
          recordType,
          recordId,
          key,
          name: safeName,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          uploadedByUserId: session.user.id,
          sharedToPortal: false,
          createdAt: new Date(),
        }
        await db.insert(schema.files).values(row)
        return Response.json(row)
      },
    },
  },
})
