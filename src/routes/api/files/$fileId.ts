import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { getAuth } from '#/lib/auth'
import { getDb, schema } from '#/db'
import { portalSessionFromHeaders } from '#/features/portal/server'

/** Streams a file from R2. `?download=1` forces attachment. */
export const Route = createFileRoute('/api/files/$fileId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await getAuth().api.getSession({ headers: request.headers })
        const workspaceId = session?.session.activeOrganizationId
        let f: typeof schema.files.$inferSelect | undefined
        if (session && workspaceId) {
          f = await getDb().query.files.findFirst({ where: and(eq(schema.files.id, params.fileId), eq(schema.files.workspaceId, workspaceId)) })
        } else {
          // Portal visitors may fetch files shared to them.
          const access = await portalSessionFromHeaders(request.headers)
          if (!access) return new Response('Unauthorized', { status: 401 })
          const candidate = await getDb().query.files.findFirst({ where: and(eq(schema.files.id, params.fileId), eq(schema.files.workspaceId, access.workspaceId), eq(schema.files.sharedToPortal, true)) })
          if (candidate) {
            const allowed = new Set([access.contactId, access.contact.companyId])
            if (candidate.recordType === 'invoice') {
              const inv = await getDb().query.invoices.findFirst({ where: eq(schema.invoices.id, candidate.recordId), columns: { contactId: true, companyId: true } })
              if (inv && (allowed.has(inv.contactId) || allowed.has(inv.companyId))) f = candidate
            } else if (allowed.has(candidate.recordId)) f = candidate
          }
        }
        if (!f) return new Response('Not found', { status: 404 })
        const obj = await env.FILES.get(f.key)
        if (!obj) return new Response('Gone', { status: 410 })
        const download = new URL(request.url).searchParams.get('download') === '1'
        const headers = new Headers()
        obj.writeHttpMetadata(headers)
        headers.set('etag', obj.httpEtag)
        headers.set('content-length', String(obj.size))
        headers.set('content-disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
        headers.set('x-content-type-options', 'nosniff')
        return new Response(obj.body, { headers })
      },
    },
  },
})
