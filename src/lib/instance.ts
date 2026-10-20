import { createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, eq, gt } from 'drizzle-orm'
import { getDb, schema } from '#/db'

/**
 * Install-wide settings, read side. Lives in lib so auth.ts can import it
 * without pulling in session.ts (which imports auth.ts). One deployment, one row. The instance admin is the
 * first account created on the deployment: whoever ran the deploy and signed up.
 */

const ROW_ID = 'default'

export type InstanceSettings = { openSignup: boolean; membersCreateWorkspaces: boolean }

const DEFAULTS: InstanceSettings = { openSignup: true, membersCreateWorkspaces: true }

export const readInstanceSettings = createServerOnlyFn(async (): Promise<InstanceSettings> => {
  const row = await getDb().query.instanceSettings.findFirst({ where: eq(schema.instanceSettings.id, ROW_ID) })
  return row ? { openSignup: row.openSignup, membersCreateWorkspaces: row.membersCreateWorkspaces } : DEFAULTS
})

/** The first user ever created. Null on a fresh install. */
export const instanceAdminId = createServerOnlyFn(async (): Promise<string | null> => {
  const first = await getDb().query.user.findFirst({ orderBy: asc(schema.user.createdAt), columns: { id: true } })
  return first?.id ?? null
})

export const isInstanceAdmin = createServerOnlyFn(async (userId: string) => (await instanceAdminId()) === userId)

/** Whether `userId` may create a workspace right now. */
export const canCreateWorkspace = createServerOnlyFn(async (userId: string) => {
  const settings = await readInstanceSettings()
  if (settings.membersCreateWorkspaces) return true
  return isInstanceAdmin(userId)
})

/**
 * Whether an account may be created for `email`. Always true for the very first
 * account; otherwise open signup, or a pending, unexpired invitation for that email.
 */
export const canSignUp = createServerOnlyFn(async (email: string) => {
  if (!(await instanceAdminId())) return true
  const settings = await readInstanceSettings()
  if (settings.openSignup) return true
  const invite = await getDb().query.invitation.findFirst({
    where: and(eq(schema.invitation.email, email.toLowerCase()), eq(schema.invitation.status, 'pending'), gt(schema.invitation.expiresAt, new Date())),
    columns: { id: true },
  })
  return !!invite
})
