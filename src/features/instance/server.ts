import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { env } from 'cloudflare:workers'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getAuth } from '#/lib/auth'
import { appOrigin } from '#/lib/origin'
import { requireSession } from '#/lib/session'
import { instanceAdminId, isInstanceAdmin, readInstanceSettings } from '#/lib/instance'

const ROW_ID = 'default'

/** Public: what the signup page needs to explain itself. */
export const getSignupPolicy = createServerFn({ method: 'GET' }).handler(async () => {
  const [admin, settings] = await Promise.all([instanceAdminId(), readInstanceSettings()])
  return { openSignup: !admin || settings.openSignup }
})

export const getInstanceSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const { user } = await requireSession()
  if (!(await isInstanceAdmin(user.id))) throw new Error('Forbidden')
  return { ...(await readInstanceSettings()), emailConfigured: !!env.RESEND_API_KEY }
})

/** For /verify-email: who is waiting, or null when signed out / already verified. */
export const getVerificationState = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session) return { state: 'signed-out' as const }
  if (session.user.emailVerified || !(await readInstanceSettings()).requireEmailVerification) return { state: 'verified' as const }
  return { state: 'pending' as const, email: session.user.email }
})

export const resendVerificationEmail = createServerFn({ method: 'POST' }).handler(async () => {
  const headers = getRequestHeaders()
  const session = await getAuth().api.getSession({ headers })
  if (!session) throw new Error('Not signed in')
  await getAuth().api.sendVerificationEmail({ headers, body: { email: session.user.email, callbackURL: `${appOrigin()}/app` } })
  return { ok: true }
})

export const updateInstanceSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ openSignup: z.boolean(), membersCreateWorkspaces: z.boolean(), requireEmailVerification: z.boolean() }))
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    if (!(await isInstanceAdmin(user.id))) throw new Error('Forbidden')
    const now = new Date()
    await getDb()
      .insert(schema.instanceSettings)
      .values({ id: ROW_ID, ...data, updatedAt: now })
      .onConflictDoUpdate({ target: schema.instanceSettings.id, set: { ...data, updatedAt: now } })
    return { ok: true }
  })
