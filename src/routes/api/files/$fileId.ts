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
            const allowed = new Set([access.contactId, ...(access.contact.companyId ? [access.contact.companyId] : [])])
            if (candidate.recordType === 'invoice') {
              const inv = await getDb().query.invoices.findFirst({ where: eq(schema.invoices.id, candidate.recordId), columns: { contactId: true, companyId: true } })
              if (inv && ((inv.contactId && allowed.has(inv.contactId)) || (inv.companyId && allowed.has(inv.companyId)))) f = candidate
            } else if (allowed.has(candidate.recordId)) f = candidate
          }
        }
        if (!f) return new Response('Not found', { status: 404 })
        const obj = await env.FILES.get(f.key)
        if (!obj) return new Response('Gone', { status: 410 })
        const headers = new Headers()
        obj.writeHttpMetadata(headers)
        // Only a short allowlist may render inline. Anything that can carry script
        // (html, svg, xml, pdf with JS) is forced to download so uploads never run
        // on the app origin with the viewer's session.
        const type = (headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!.trim().toLowerCase()
        const inlineOk = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|wav)|text\/plain)$/.test(type)
        const download = !inlineOk || new URL(request.url).searchParams.get('download') === '1'
        if (!inlineOk) headers.set('content-type', 'application/octet-stream')
        headers.set('etag', obj.httpEtag)
        headers.set('content-length', String(obj.size))
        headers.set('content-disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
        headers.set('x-content-type-options', 'nosniff')
        headers.set('content-security-policy', "sandbox; default-src 'none'")
        headers.set('cache-control', 'private, max-age=0')
        return new Response(obj.body, { headers })
      },
    },
  },
})
