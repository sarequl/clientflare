import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { and, asc, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { todayIn } from '#/lib/dates'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { linkMail, sendMail } from '#/lib/email'
import { requireWorkspace } from '#/lib/session'
import { activityInsert } from '#/features/activities/server'

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export { todayIn }

const taskSelect = {
  id: schema.tasks.id,
  title: schema.tasks.title,
  description: schema.tasks.description,
  dueOn: schema.tasks.dueOn,
  status: schema.tasks.status,
  completedAt: schema.tasks.completedAt,
  assigneeUserId: schema.tasks.assigneeUserId,
  assigneeName: sql<string | null>`(select u.name from user u where u.id = ${schema.tasks.assigneeUserId})`,
  contactId: schema.tasks.contactId,
  contactName: sql<string | null>`(select c.first_name || coalesce(' ' || c.last_name, '') from contacts c where c.id = ${schema.tasks.contactId})`,
  companyId: schema.tasks.companyId,
  companyName: sql<string | null>`(select co.name from companies co where co.id = ${schema.tasks.companyId})`,
  dealId: schema.tasks.dealId,
  dealTitle: sql<string | null>`(select d.title from deals d where d.id = ${schema.tasks.dealId})`,
  updatedAt: schema.tasks.updatedAt,
}

/**
 * view: today = due today or overdue (open), upcoming = open with a future date,
 * all = every open task, done = completed. `mine` restricts to the caller.
 */
export const listTasks = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        view: z.enum(['today', 'upcoming', 'all', 'done']).default('today'),
        mine: z.boolean().default(false),
        contactId: z.string().optional(),
        companyId: z.string().optional(),
        dealId: z.string().optional(),
        today: ISO_DATE.optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const settings = await db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) })
    const today = data?.today ?? todayIn(settings?.timezone ?? 'UTC')
    const view = data?.view ?? 'today'
    const conds = [eq(schema.tasks.workspaceId, ctx.workspaceId)]
    if (view === 'done') conds.push(eq(schema.tasks.status, 'done'))
    else conds.push(eq(schema.tasks.status, 'open'))
    if (view === 'today') conds.push(lte(schema.tasks.dueOn, today))
    if (view === 'upcoming') conds.push(sql`${schema.tasks.dueOn} > ${today}`)
    if (data?.mine) conds.push(eq(schema.tasks.assigneeUserId, ctx.user.id))
    if (data?.contactId) conds.push(eq(schema.tasks.contactId, data.contactId))
    if (data?.companyId) conds.push(eq(schema.tasks.companyId, data.companyId))
    if (data?.dealId) conds.push(eq(schema.tasks.dealId, data.dealId))
    const rows = await db
      .select(taskSelect)
      .from(schema.tasks)
      .where(and(...conds))
      .orderBy(view === 'done' ? desc(schema.tasks.completedAt) : asc(sql`coalesce(${schema.tasks.dueOn}, '9999-12-31')`), asc(schema.tasks.createdAt))
      .limit(200)
    return { today, rows: rows.map((r) => ({ ...r, overdue: r.status === 'open' && !!r.dueOn && r.dueOn < today })) }
  })

export const getTaskCounts = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  const db = getDb()
  const settings = await db.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.organizationId, ctx.workspaceId) })
  const today = todayIn(settings?.timezone ?? 'UTC')
  const [row] = await db
    .select({
      overdue: sql<number>`sum(case when due_on < ${today} then 1 else 0 end)`,
      dueToday: sql<number>`sum(case when due_on = ${today} then 1 else 0 end)`,
      open: sql<number>`count(*)`,
    })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, ctx.workspaceId), eq(schema.tasks.status, 'open')))
  return { today, overdue: row?.overdue ?? 0, dueToday: row?.dueToday ?? 0, open: row?.open ?? 0 }
})

const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  dueOn: ISO_DATE.nullable().optional(),
  assigneeUserId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
})

export const createTask = createServerFn({ method: 'POST' })
  .validator(taskInput)
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const db = getDb()
    const now = new Date()
    const id = newId()
    const stmts = [
      db.insert(schema.tasks).values({
        id,
        workspaceId: ctx.workspaceId,
        title: data.title,
        description: data.description || null,
        dueOn: data.dueOn ?? null,
        assigneeUserId: data.assigneeUserId === undefined ? ctx.user.id : data.assigneeUserId,
        contactId: data.contactId ?? null,
        companyId: data.companyId ?? null,
        dealId: data.dealId ?? null,
        createdByUserId: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      }),
    ]
    const target = data.dealId ? (['deal', data.dealId] as const) : data.contactId ? (['contact', data.contactId] as const) : data.companyId ? (['company', data.companyId] as const) : null
    if (target) stmts.push(activityInsert({ workspaceId: ctx.workspaceId, userId: ctx.user.id, targetType: target[0], targetId: target[1], kind: 'system', body: `Task added: ${data.title}` }) as never)
    await db.batch(stmts as [typeof stmts[0], ...typeof stmts])
    return { id }
  })

export const updateTask = createServerFn({ method: 'POST' })
  .validator(taskInput.partial().extend({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const { id, ...rest } = data
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if (rest.title !== undefined) patch.title = rest.title
    if (rest.description !== undefined) patch.description = rest.description || null
    if (rest.dueOn !== undefined) patch.dueOn = rest.dueOn
    if (rest.assigneeUserId !== undefined) patch.assigneeUserId = rest.assigneeUserId
    if (rest.contactId !== undefined) patch.contactId = rest.contactId
    if (rest.companyId !== undefined) patch.companyId = rest.companyId
    if (rest.dealId !== undefined) patch.dealId = rest.dealId
    await getDb().update(schema.tasks).set(patch).where(and(eq(schema.tasks.id, id), eq(schema.tasks.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })

export const setTaskDone = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), done: z.boolean() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    const now = new Date()
    await getDb()
      .update(schema.tasks)
      .set({ status: data.done ? 'done' : 'open', completedAt: data.done ? now : null, updatedAt: now })
      .where(and(eq(schema.tasks.id, data.id), eq(schema.tasks.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })

export const deleteTask = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const ctx = await requireWorkspace()
    await getDb().delete(schema.tasks).where(and(eq(schema.tasks.id, data.id), eq(schema.tasks.workspaceId, ctx.workspaceId)))
    return { ok: true }
  })

/** Members of the active workspace, for assignee pickers. */
export const listAssignees = createServerFn({ method: 'GET' }).handler(async () => {
  const ctx = await requireWorkspace()
  return getDb()
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, ctx.workspaceId))
    .orderBy(asc(schema.user.name))
})

// ── Reminder digests (called from the scheduled handler) ───────────────────

const DIGEST_HOUR = 8

/**
 * For every workspace whose local time is DIGEST_HOUR, email each assignee one
 * digest of tasks due today or overdue. Idempotent per (workspace, user, day).
 */
export const runTaskReminders = createServerOnlyFn(async (appUrl: string | null, now = new Date()) => {
  const db = getDb()
  const workspaces = await db.select({ id: schema.organization.id, name: schema.organization.name, timezone: schema.workspaceSettings.timezone, appOrigin: schema.workspaceSettings.appOrigin }).from(schema.organization).leftJoin(schema.workspaceSettings, eq(schema.workspaceSettings.organizationId, schema.organization.id))
  let sent = 0
  for (const ws of workspaces) {
    const tz = ws.timezone ?? 'UTC'
    let hour: number
    try {
      hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now))
    } catch {
      hour = now.getUTCHours()
    }
    if (hour !== DIGEST_HOUR) continue
    const base = appUrl || ws.appOrigin
    if (!base) continue // nobody has opened this workspace yet, so no link to send
    const today = todayIn(tz, now)
    const due = await db
      .select({ id: schema.tasks.id, title: schema.tasks.title, dueOn: schema.tasks.dueOn, assigneeUserId: schema.tasks.assigneeUserId })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.status, 'open'), lte(schema.tasks.dueOn, today), sql`${schema.tasks.assigneeUserId} is not null`))
      .orderBy(asc(schema.tasks.dueOn))
    const byUser = new Map<string, typeof due>()
    for (const t of due) byUser.set(t.assigneeUserId!, [...(byUser.get(t.assigneeUserId!) ?? []), t])
    for (const [userId, list] of byUser) {
      const already = await db.query.taskDigests.findFirst({ where: and(eq(schema.taskDigests.workspaceId, ws.id), eq(schema.taskDigests.userId, userId), eq(schema.taskDigests.sentOn, today)) })
      if (already) continue
      const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId), columns: { email: true, name: true } })
      if (!u) continue
      const overdue = list.filter((t) => t.dueOn! < today)
      const todayList = list.filter((t) => t.dueOn === today)
      const lines = [
        ...(overdue.length ? ['Overdue:', ...overdue.map((t) => `  • ${t.title} (due ${t.dueOn})`)] : []),
        ...(todayList.length ? ['Due today:', ...todayList.map((t) => `  • ${t.title}`)] : []),
      ].join('\n')
      await sendMail(
        linkMail({
          to: u.email,
          subject: `${list.length} task${list.length === 1 ? '' : 's'} need attention in ${ws.name}`,
          heading: `Good morning, ${u.name}`,
          body: lines.replace(/\n/g, '<br>'),
          cta: 'Open tasks',
          url: `${base}/app/tasks`,
        }),
      )
      await db.insert(schema.taskDigests).values({ workspaceId: ws.id, userId, sentOn: today }).onConflictDoNothing()
      sent++
    }
  }
  return { sent }
})

export { isNull, lt, or }
