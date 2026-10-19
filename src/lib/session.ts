import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { getAuth } from '#/lib/auth'
import { getDb, schema } from '#/db'
import { sha256Hex } from '#/lib/tokens'

export const TOKEN_PREFIX = 'cf_'

type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  return getAuth().api.getSession({ headers: getRequestHeaders() })
})

/**
 * `Authorization: Bearer cf_…` resolves to the token owner acting inside the
 * token's workspace. Used by the MCP endpoint; cookies are ignored on that path.
 */
export const sessionFromToken = createServerOnlyFn(async (headers: Headers): Promise<AuthSession | null> => {
  const header = headers.get('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const token = header.slice(7).trim()
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 40) return null
  const db = getDb()
  const row = await db.query.apiTokens.findFirst({ where: eq(schema.apiTokens.tokenHash, await sha256Hex(token)) })
  if (!row) return null
  const user = await db.query.user.findFirst({ where: eq(schema.user.id, row.userId) })
  if (!user) return null
  const now = new Date()
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(schema.apiTokens).set({ lastUsedAt: now }).where(eq(schema.apiTokens.id, row.id))
  }
  const session = {
    id: `token:${row.id}`,
    token: '',
    userId: user.id,
    activeOrganizationId: row.workspaceId,
    createdAt: row.createdAt,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    ipAddress: null,
    userAgent: null,
  }
  return { user, session } as unknown as AuthSession
})

/** For use inside other server functions. Throws a redirect to /login when signed out. */
export const requireSession = createServerOnlyFn(async () => {
  const headers = getRequestHeaders()
  const session = (await sessionFromToken(headers)) ?? (await getAuth().api.getSession({ headers }))
  if (!session) throw redirect({ to: '/login' })
  return session
})

/** Session + active workspace, or a redirect to workspace creation. */
export const requireWorkspace = createServerOnlyFn(async () => {
  const session = await requireSession()
  const workspaceId = session.session.activeOrganizationId
  if (!workspaceId) throw redirect({ to: '/app/workspaces/new' })
  return { ...session, workspaceId }
})

export type Role = 'owner' | 'admin' | 'member'

export const requireRole = createServerOnlyFn(async (minimum: Role) => {
  const ctx = await requireWorkspace()
  const membership = await getDb().query.member.findFirst({
    where: and(eq(schema.member.organizationId, ctx.workspaceId), eq(schema.member.userId, ctx.user.id)),
    columns: { role: true },
  })
  const rank: Record<Role, number> = { member: 0, admin: 1, owner: 2 }
  const roles = (membership?.role ?? '').split(',') as Role[]
  const best = Math.max(-1, ...roles.map((r) => rank[r] ?? -1))
  if (best < rank[minimum]) throw new Error('Forbidden')
  return { ...ctx, role: roles }
})
