import { useEffect, useState, type FormEvent } from 'react'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { createTask, deleteTask, getTaskCounts, listAssignees, listTasks, setTaskDone } from '#/features/tasks/server'
import { errorMessage } from '#/lib/format'
import { Card, Notice, PageHeader } from '#/components/Card'
import { Button } from '#/components/Button'
import { Input, Select, Switch } from '#/components/Field'
import { ConfirmDialog, Modal } from '#/components/Modal'
import { EmptyState } from '#/components/EmptyState'
import { OverflowMenu } from '#/components/Popover'
import { Avatar } from '#/components/Avatar'
import { DueLabel, TaskForm, TaskLinkChip, type TaskRow } from '#/components/TaskForm'
import { useApp } from '#/components/useApp'
import { StableLabel } from '#/components/Tabs'
import { IconPencil, IconPlus, IconTrash } from '#/components/icons'
import { IconCheckSquare } from '#/components/icons2'

type View = 'today' | 'upcoming' | 'all' | 'done'

const searchSchema = z.object({
  view: z.enum(['today', 'upcoming', 'all', 'done']).optional().catch(undefined),
  mine: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/app/_ws/tasks')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'today', mine: !!search.mine }),
  loader: async ({ deps }) => {
    const [tasks, assignees, counts] = await Promise.all([listTasks({ data: { view: deps.view, mine: deps.mine } }), listAssignees(), getTaskCounts()])
    return { tasks, assignees, counts }
  },
  head: () => ({ meta: [{ title: 'Tasks · Clientflare' }] }),
  component: TasksPage,
})

const VIEWS: { v: View; label: string }[] = [
  { v: 'today', label: 'Today' },
  { v: 'upcoming', label: 'Upcoming' },
  { v: 'all', label: 'All open' },
  { v: 'done', label: 'Done' },
]

const EMPTY: Record<View, { title: string; body: string }> = {
  today: { title: 'Nothing due today', body: 'Overdue tasks and tasks due today show up here.' },
  upcoming: { title: 'Nothing coming up', body: 'Tasks with a future due date show up here.' },
  all: { title: 'No open tasks', body: 'Add one above, or from a contact, company or deal.' },
  done: { title: 'Nothing completed yet', body: 'Ticked-off tasks land here.' },
}

function TasksPage() {
  const { tasks, assignees, counts } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const view: View = search.view ?? 'today'
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [deleting, setDeleting] = useState<TaskRow | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fresh loader data supersedes optimistic ticks.
  useEffect(() => setOverrides({}), [tasks])

  async function toggle(task: TaskRow, done: boolean) {
    setError(null)
    setOverrides((o) => ({ ...o, [task.id]: done }))
    try {
      await setTaskDone({ data: { id: task.id, done } })
      await router.invalidate()
    } catch (err) {
      setOverrides((o) => {
        const n = { ...o }
        delete n[task.id]
        return n
      })
      setError(errorMessage(err, 'Could not update the task.'))
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteTask({ data: { id: deleting.id } })
      await router.invalidate()
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }

  const countFor = (v: View) => (v === 'today' ? counts.overdue + counts.dueToday : v === 'all' ? counts.open : null)
  const groups =
    view === 'today'
      ? [
          { label: 'Overdue', rows: tasks.rows.filter((t) => t.overdue) },
          { label: 'Today', rows: tasks.rows.filter((t) => !t.overdue) },
        ].filter((g) => g.rows.length)
      : [{ label: null, rows: tasks.rows }]

  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups and to-dos across your contacts, companies and deals." />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Task views" className="inline-flex w-full rounded-md border border-border bg-surface-2 p-0.5 sm:w-fit">
          {VIEWS.map(({ v, label }) => {
            const n = countFor(v)
            const active = v === view
            return (
              <Link
                key={v}
                to="/app/tasks"
                search={(s) => ({ ...s, view: v === 'today' ? undefined : v })}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded px-2.5 text-[13px] whitespace-nowrap transition-colors sm:flex-none ${
                  active ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <StableLabel>{label}</StableLabel>
                {!!n && (
                  <span className={`rounded px-1 text-[11px] tnum ${v === 'today' && counts.overdue ? 'bg-danger-soft text-danger-soft-fg' : 'bg-surface-3 text-fg-muted'}`}>{n}</span>
                )}
              </Link>
            )
          })}
        </nav>
        <Switch id="tasks-mine" checked={!!search.mine} onChange={(on) => navigate({ search: (s) => ({ ...s, mine: on || undefined }), replace: true })} label="Only mine" />
      </div>

      <QuickAdd assignees={assignees} defaultDue={view === 'today' ? tasks.today : ''} />

      {error && (
        <div className="mb-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      <Card>
        {tasks.rows.length === 0 ? (
          <EmptyState icon={<IconCheckSquare size={18} />} title={EMPTY[view].title} body={search.mine ? `${EMPTY[view].body} Only your tasks are shown.` : EMPTY[view].body} />
        ) : (
          groups.map((g) => (
            <section key={g.label ?? 'all'} aria-label={g.label ?? undefined}>
              {g.label && (
                <h2 className={`border-b border-border bg-surface-2/60 px-4 py-1.5 text-[12px] font-medium ${g.label === 'Overdue' ? 'text-danger' : 'text-fg-muted'}`}>
                  {g.label} <span className="tnum">· {g.rows.length}</span>
                </h2>
              )}
              <ul className="divide-y divide-border">
                {g.rows.map((t) => {
                  const done = overrides[t.id] ?? t.status === 'done'
                  return (
                    <li key={t.id} className={`flex items-start gap-3 px-4 py-2.5 ${t.overdue && !done ? 'bg-danger-soft/30' : ''}`}>
                      <input
                        type="checkbox"
                        aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                        checked={done}
                        onChange={(e) => toggle(t, e.target.checked)}
                        className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          className={`text-left text-sm break-words hover:underline ${done ? 'text-fg-muted line-through decoration-fg-subtle' : 'font-medium'}`}
                        >
                          {t.title}
                        </button>
                        {t.description && <p className="truncate text-[13px] text-fg-muted">{t.description}</p>}
                        {(t.dueOn || t.dealId || t.contactId || t.companyId) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <DueLabel dueOn={t.dueOn} today={tasks.today} overdue={t.overdue} done={done} />
                            <TaskLinkChip task={t} />
                          </div>
                        )}
                      </div>
                      <Avatar name={t.assigneeName} className="mt-0.5" />
                      <OverflowMenu
                        quiet
                        label={`Actions for ${t.title}`}
                        items={[
                          { label: 'Edit', icon: <IconPencil />, onSelect: () => setEditing(t) },
                          {
                            label: 'Delete',
                            icon: <IconTrash />,
                            onSelect: () => {
                              setDeleteError(null)
                              setDeleting(t)
                            },
                          },
                        ]}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit task">
        {editing && (
          <TaskForm
            task={editing}
            assignees={assignees}
            onDone={async (saved) => {
              if (saved) await router.invalidate()
              setEditing(null)
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title="Delete this task?"
        body={deleting ? `“${deleting.title}” is removed for everyone.` : undefined}
      />
    </>
  )
}

function QuickAdd({ assignees, defaultDue }: { assignees: { id: string; name: string }[]; defaultDue: string }) {
  const app = useApp()
  const router = useRouter()
  const focusTitle = () => document.getElementById('task-quick-title')?.focus()
  const [title, setTitle] = useState('')
  const [dueOn, setDueOn] = useState(defaultDue)
  const [assignee, setAssignee] = useState(app.user.id)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDueOn(defaultDue), [defaultDue])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Type what needs doing.')
      focusTitle()
      return
    }
    setPending(true)
    try {
      await createTask({ data: { title: title.trim(), dueOn: dueOn || null, assigneeUserId: assignee || null } })
      setTitle('')
      setDueOn(defaultDue)
      await router.invalidate()
      focusTitle()
    } catch (err) {
      setError(errorMessage(err, 'Could not add the task.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-3" noValidate>
      {/* Phones: title + Add on one row, date and assignee share the next. From sm up it's one row. */}
      <Card className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-2 sm:flex sm:items-center">
        <Input id="task-quick-title" aria-label="New task" placeholder="Add a task, e.g. Send proposal to Acme" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="sm:flex-1" />
        <Button type="submit" variant="primary" icon={<IconPlus />} pending={pending} className="sm:order-last">
          Add
        </Button>
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:contents">
          <Input aria-label="Due date" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="min-w-0 sm:w-40" />
          <Select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="min-w-0 sm:w-40">
            <option value="">Nobody</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id === app.user.id ? `${a.name} (me)` : a.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>
      {error && (
        <p className="mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
