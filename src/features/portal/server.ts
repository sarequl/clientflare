import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { linkMail, sendMail } from '#/lib/email'
import { parseCookie, randomToken, sha256Hex } from '#/lib/tokens'
import { requireWorkspace } from '#/lib/session'
import { activityInsert } from '#/features/activities/server'

export const PORTAL_COOKIE = 'cf_portal'
const LINK_TTL_MS = 15 * 60_000
const SESSION_TTL_MS = 30 * 86_400_000

// ── Team side ──────────────────────────────────────────────────────────────

export const getPortalAccess = createServerFn({ method: 'GET' })
  .validator(z.object({ contactId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const row = await getDb().query.portalAccess.findFirst({ where: and(eq(schema.portalAccess.contactId, data.contactId), eq(schema.portalAccess.workspaceId, ctx.workspaceId)) })
    return row ?? null
  })

/** Enable portal access for a contact and email them a sign-in link. */
export const invitePortal = createServerFn({ method: 'POST' })
  .validator(z.object({ contactId: z.string(), email: z.string().trim().email().optional() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const contact = await db.query.contacts.findFirst({ where: and(eq(schema.contacts.id, data.contactId), eq(schema.contacts.workspaceId, ctx.workspaceId)) })
    if (!contact) throw new Error('Contact not found')
    const email = data.email ?? contact.email
    if (!email) throw new Error('Contact has no email')
    let access = await db.query.portalAccess.findFirst({ where: eq(schema.portalAccess.contactId, contact.id) })
    if (!access) {
      const id = newId()
      await db.insert(schema.portalAccess).values({ id, workspaceId: ctx.workspaceId, contactId: contact.id, email, enabled: true, createdAt: new Date() })
      access = (await db.query.portalAccess.findFirst({ where: eq(schema.portalAccess.id, id) }))!
    } else if (!access.enabled || access.email !== email) {
      await db.update(schema.portalAccess).set({ enabled: true, email }).where(eq(schema.portalAccess.id, access.id))
    }
    await sendPortalLink(access.id, email, ctx.workspaceId)
    await activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: 'contact', targetId: contact.id, kind: 'system', body: `Portal invite sent to ${email}` })
    return { ok: true }
  })

export const disablePortal = createServerFn({ method: 'POST' })
  .validator(z.object({ contactId: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const access = await db.query.portalAccess.findFirst({ where: and(eq(schema.portalAccess.contactId, data.contactId), eq(schema.portalAccess.workspaceId, ctx.workspaceId)) })
    if (!access) return { ok: true }
    await db.batch([
      db.update(schema.portalAccess).set({ enabled: false }).where(eq(schema.portalAccess.id, access.id)),
      db.delete(schema.portalSessions).where(eq(schema.portalSessions.accessId, access.id)),
      db.delete(schema.portalLinks).where(eq(schema.portalLinks.accessId, access.id)),
    ])
    return { ok: true }
  })

export const setActivityShared = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), shared: z.boolean() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb().update(schema.activities).set({ sharedToPortal: data.shared }).where(and(eq(schema.activities.id, data.id), eq(schema.activities.workspaceId, ctx.workspaceId), eq(schema.activities.kind, 'note')))
    return { ok: true }
  })

const sendPortalLink = createServerOnlyFn(async (accessId: string, email: string, workspaceId: string) => {
  const db = getDb()
  const token = randomToken()
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, workspaceId), columns: { name: true } })
  await db.insert(schema.portalLinks).values({ tokenHash: await sha256Hex(token), accessId, expiresAt: new Date(Date.now() + LINK_TTL_MS), createdAt: new Date() })
  const url = `${env.APP_URL}/api/portal/auth?token=${token}`
  await sendMail(
    linkMail({
      to: email,
      subject: `Your ${org?.name ?? 'client'} portal link`,
      heading: `Sign in to your ${org?.name ?? ''} portal`,
      body: 'This link works once and expires in 15 minutes.',
      cta: 'Open portal',
      url,
    }),
  )
})

// ── Portal side ────────────────────────────────────────────────────────────

/** Request a fresh link by email. Always returns ok so emails can't be enumerated. */
export const requestPortalLink = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().trim().email() }))
  .handler(async ({ data }) => {
    const db = getDb()
    const rows = await db.query.portalAccess.findMany({ where: and(eq(schema.portalAccess.email, data.email), eq(schema.portalAccess.enabled, true)) })
    for (const a of rows) await sendPortalLink(a.id, a.email, a.workspaceId)
    return { ok: true }
  })

/** Exchange a one-time link token for a session token. Used by /api/portal/auth. */
export const redeemPortalLink = createServerOnlyFn(async (token: string) => {
  const db = getDb()
  const hash = await sha256Hex(token)
  const link = await db.query.portalLinks.findFirst({ where: eq(schema.portalLinks.tokenHash, hash) })
  if (!link || link.usedAt || link.expiresAt.getTime() < Date.now()) return null
  const access = await db.query.portalAccess.findFirst({ where: eq(schema.portalAccess.id, link.accessId) })
  if (!access?.enabled) return null
  const session = randomToken()
  const now = new Date()
  await db.batch([
    db.update(schema.portalLinks).set({ usedAt: now }).where(eq(schema.portalLinks.tokenHash, hash)),
    db.insert(schema.portalSessions).values({ tokenHash: await sha256Hex(session), accessId: access.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS), createdAt: now }),
    db.update(schema.portalAccess).set({ lastSeenAt: now }).where(eq(schema.portalAccess.id, access.id)),
  ])
  return { sessionToken: session, maxAge: SESSION_TTL_MS / 1000 }
})

export const portalSessionFromHeaders = createServerOnlyFn(async (headers: Headers) => {
  const token = parseCookie(headers.get('cookie'), PORTAL_COOKIE)
  if (!token) return null
  const db = getDb()
  const s = await db.query.portalSessions.findFirst({ where: eq(schema.portalSessions.tokenHash, await sha256Hex(token)) })
  if (!s || s.expiresAt.getTime() < Date.now()) return null
  const access = await db.query.portalAccess.findFirst({ where: eq(schema.portalAccess.id, s.accessId), with: { contact: true } })
  if (!access?.enabled) return null
  return access
})

export const getPortalData = createServerFn({ method: 'GET' }).handler(async () => {
  const access = await portalSessionFromHeaders(getRequestHeaders())
  if (!access) return null
  const db = getDb()
  const contact = access.contact
  const recordIds = [contact.id, ...(contact.companyId ? [contact.companyId] : [])]
  const [org, settings, invoiceRows, notes] = await Promise.all([
    db.query.organization.findFirst({ where: eq(schema.organization.id, access.workspaceId), columns: { name: true } }),
    db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, access.workspaceId) }),
    db.query.invoices.findMany({
      where: and(
        eq(schema.invoices.workspaceId, access.workspaceId),
        inArray(schema.invoices.status, ['sent', 'paid']),
        or(eq(schema.invoices.contactId, contact.id), contact.companyId ? eq(schema.invoices.companyId, contact.companyId) : sql`0`),
      ),
      orderBy: [desc(schema.invoices.issuedOn)],
    }),
    db.query.activities.findMany({
      where: and(eq(schema.activities.workspaceId, access.workspaceId), eq(schema.activities.sharedToPortal, true), inArray(schema.activities.targetId, recordIds)),
      orderBy: [desc(schema.activities.occurredAt)],
      with: { user: { columns: { name: true } } },
    }),
  ])
  const fileRecordIds = [...recordIds, ...invoiceRows.map((i) => i.id)]
  const fileRows = await db.query.files.findMany({
    where: and(eq(schema.files.workspaceId, access.workspaceId), eq(schema.files.sharedToPortal, true), inArray(schema.files.recordId, fileRecordIds)),
    orderBy: [desc(schema.files.createdAt)],
  })
  const today = new Date().toISOString().slice(0, 10)
  return {
    contact: { firstName: contact.firstName, lastName: contact.lastName, email: access.email },
    business: { name: settings?.businessName ?? org?.name ?? '', email: settings?.businessEmail ?? null },
    invoices: invoiceRows.map((i) => ({ id: i.id, number: i.number, status: i.status, issuedOn: i.issuedOn, dueOn: i.dueOn, totalMinor: i.totalMinor, currency: i.currency, paidOn: i.paidOn, publicToken: i.publicToken, overdue: i.status === 'sent' && !!i.dueOn && i.dueOn < today })),
    files: fileRows.map((f) => ({ id: f.id, name: f.name, size: f.size, contentType: f.contentType, createdAt: f.createdAt })),
    notes: notes.map((n) => ({ id: n.id, body: n.body, occurredAt: n.occurredAt, author: n.user?.name ?? null })),
  }
})

export const portalLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const token = parseCookie(getRequestHeaders().get('cookie'), PORTAL_COOKIE)
  if (token) await getDb().delete(schema.portalSessions).where(eq(schema.portalSessions.tokenHash, await sha256Hex(token)))
  return { ok: true }
})
