import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb, schema } from '#/db'
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
  return readInstanceSettings()
})

export const updateInstanceSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ openSignup: z.boolean(), membersCreateWorkspaces: z.boolean() }))
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
