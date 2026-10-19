import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { getAuth } from '#/lib/auth'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  return getAuth().api.getSession({ headers: getRequestHeaders() })
})

/** For use inside other server functions. Throws a redirect to /login when signed out. */
export const requireSession = createServerOnlyFn(async () => {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
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
  const membership = await getAuth().api.getActiveMember({ headers: getRequestHeaders() })
  const rank: Record<Role, number> = { member: 0, admin: 1, owner: 2 }
  const roles = (membership?.role ?? '').split(',') as Role[]
  const best = Math.max(-1, ...roles.map((r) => rank[r] ?? -1))
  if (best < rank[minimum]) throw new Error('Forbidden')
  return { ...ctx, role: roles }
})
