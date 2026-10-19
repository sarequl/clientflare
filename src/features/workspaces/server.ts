import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { appOrigin } from '#/lib/origin'
import { getAuth } from '#/lib/auth'
import { getDb, schema } from '#/db'
import { requireSession, requireWorkspace, requireRole } from '#/lib/session'
import { ensureDefaultPipeline } from '#/features/deals/server'

const CURRENCY = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO code')

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace'

/** Create a workspace (Better Auth organization), its settings row, and make it active. */
export const createWorkspace = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(80), baseCurrency: CURRENCY, timezone: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireSession()
    const auth = getAuth()
    const headers = getRequestHeaders()
    const base = slugify(data.name)
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`
    const org = await auth.api.createOrganization({ headers, body: { name: data.name, slug } })
    if (!org) throw new Error('Could not create workspace')
    await getDb().insert(schema.workspaceSettings).values({
      organizationId: org.id,
      baseCurrency: data.baseCurrency,
      timezone: data.timezone,
      updatedAt: new Date(),
    })
    await ensureDefaultPipeline(org.id)
    await auth.api.setActiveOrganization({ headers, body: { organizationId: org.id } })
    return { id: org.id, slug: org.slug }
  })

export const switchWorkspace = createServerFn({ method: 'POST' })
  .validator(z.object({ organizationId: z.string() }))
  .handler(async ({ data }) => {
    await requireSession()
    await getAuth().api.setActiveOrganization({ headers: getRequestHeaders(), body: data })
    return { ok: true }
  })

/** Everything the app shell needs: user, workspaces, active workspace + settings, role. */
export const getAppContext = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const headers = getRequestHeaders()
  const auth = getAuth()
  const [orgs, membership, settings, userSettings] = await Promise.all([
    auth.api.listOrganizations({ headers }),
    auth.api.getActiveMember({ headers }),
    getDb().query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) }),
    getDb().query.userSettings.findFirst({ where: eq(schema.userSettings.userId, ctx.user.id) }),
  ])
  const active = orgs.find((o) => o.id === ctx.workspaceId)
  if (!active) throw new Error('Active workspace not found')
  const origin = appOrigin()
  if (settings && settings.appOrigin !== origin) {
    await getDb().update(schema.workspaceSettings).set({ appOrigin: origin }).where(eq(schema.workspaceSettings.organizationId, ctx.workspaceId))
  }
  return {
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
    workspaces: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
    workspace: {
      id: active.id,
      name: active.name,
      slug: active.slug,
      baseCurrency: settings?.baseCurrency ?? 'USD',
      timezone: settings?.timezone ?? 'UTC',
    },
    personalCurrency: userSettings?.baseCurrency ?? settings?.baseCurrency ?? 'USD',
    setupDone: !!settings?.setupCompletedAt || !['owner', 'admin'].some((r) => (membership?.role ?? '').split(',').includes(r)),
    role: (membership?.role ?? 'member') as 'owner' | 'admin' | 'member',
  }
})

export const updateWorkspaceSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1).max(80), baseCurrency: CURRENCY, timezone: z.string().min(1) }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const headers = getRequestHeaders()
    await getAuth().api.updateOrganization({ headers, body: { organizationId: ctx.workspaceId, data: { name: data.name } } })
    await getDb()
      .insert(schema.workspaceSettings)
      .values({ organizationId: ctx.workspaceId, baseCurrency: data.baseCurrency, timezone: data.timezone, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.workspaceSettings.organizationId,
        set: { baseCurrency: data.baseCurrency, timezone: data.timezone, updatedAt: new Date() },
      })
    return { ok: true }
  })

export const updatePersonalSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ baseCurrency: CURRENCY }))
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    await getDb()
      .insert(schema.userSettings)
      .values({ userId: user.id, baseCurrency: data.baseCurrency, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { baseCurrency: data.baseCurrency, updatedAt: new Date() } })
    return { ok: true }
  })

export const listMembers = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const headers = getRequestHeaders()
  const auth = getAuth()
  const [full, invites] = await Promise.all([
    auth.api.getFullOrganization({ headers, query: { organizationId: ctx.workspaceId } }),
    auth.api.listInvitations({ headers, query: { organizationId: ctx.workspaceId } }),
  ])
  return {
    members: (full?.members ?? []).map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
    })),
    invitations: invites
      .filter((i) => i.status === 'pending')
      .map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
  }
})

export const inviteMember = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().email(), role: z.enum(['admin', 'member']) }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    const inv = await getAuth().api.createInvitation({
      headers: getRequestHeaders(),
      body: { email: data.email, role: data.role, organizationId: ctx.workspaceId, resend: true },
    })
    return { id: inv.id }
  })

export const removeMember = createServerFn({ method: 'POST' })
  .validator(z.object({ memberId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireRole('admin')
    await getAuth().api.removeMember({
      headers: getRequestHeaders(),
      body: { memberIdOrEmail: data.memberId, organizationId: ctx.workspaceId },
    })
    return { ok: true }
  })

export const cancelInvitation = createServerFn({ method: 'POST' })
  .validator(z.object({ invitationId: z.string() }))
  .handler(async ({ data }) => {
    await requireRole('admin')
    await getAuth().api.cancelInvitation({ headers: getRequestHeaders(), body: data })
    return { ok: true }
  })

/** Public: what an invite link points at, so the accept page can show it before login. */
export const getInvitation = createServerFn({ method: 'GET' })
  .validator(z.object({ invitationId: z.string() }))
  .handler(async ({ data }) => {
    const row = await getDb().query.invitation.findFirst({
      where: eq(schema.invitation.id, data.invitationId),
      with: { organization: true, user: true },
    })
    if (!row) return null
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      expired: row.expiresAt.getTime() < Date.now(),
      workspaceName: row.organization.name,
      inviterName: row.user.name,
    }
  })

export const acceptInvitation = createServerFn({ method: 'POST' })
  .validator(z.object({ invitationId: z.string() }))
  .handler(async ({ data }) => {
    await requireSession()
    const headers = getRequestHeaders()
    const auth = getAuth()
    const res = await auth.api.acceptInvitation({ headers, body: data })
    if (res?.invitation.organizationId) {
      await auth.api.setActiveOrganization({ headers, body: { organizationId: res.invitation.organizationId } })
    }
    return { ok: true }
  })

/** Marks the first-run wizard as finished so the app stops redirecting to it. */
export const completeSetup = createServerFn({ method: 'POST' }).handler(async () => {
  const ctx = await requireRole('admin')
  const now = new Date()
  await getDb()
    .insert(schema.workspaceSettings)
    .values({ organizationId: ctx.workspaceId, setupCompletedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: schema.workspaceSettings.organizationId, set: { setupCompletedAt: now, updatedAt: now } })
  return { ok: true }
})
