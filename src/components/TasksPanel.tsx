import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { createTask, listTasks, setTaskDone } from '#/features/tasks/server'
import { errorMessage } from '#/lib/format'
import { Avatar } from './Avatar'
import { Button, Spinner, buttonClass, useSlowLoading } from './Button'
import { Card, CardHeader, Notice } from './Card'
import { Input } from './Field'
import { IconPlus } from './icons'
import { DueLabel, type TaskRow } from './TaskForm'

type Target = { contactId: string; companyId?: never; dealId?: never } | { companyId: string; contactId?: never; dealId?: never } | { dealId: string; contactId?: never; companyId?: never }

/** Open tasks for one record, with quick-add and complete. Loads its own data. */
export function TasksPanel(target: Target) {
  const router = useRouter()
  const key = target.dealId ?? target.contactId ?? target.companyId
  const [rows, setRows] = useState<TaskRow[] | null>(null)
  const [today, setToday] = useState('')
  const [title, setTitle] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [adding, setAdding] = useState(false)
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const slow = useSlowLoading(rows === null)

  const load = useCallback(async () => {
    const res = await listTasks({ data: { view: 'all', dealId: target.dealId, contactId: target.contactId, companyId: target.companyId } })
    setRows(res.rows)
    setToday(res.today)
  }, [key])

  useEffect(() => {
    setRows(null)
    load().catch((err) => setError(errorMessage(err, 'Could not load tasks.')))
  }, [load])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return
    setAdding(true)
    try {
      await createTask({ data: { title: title.trim(), dueOn: dueOn || null, dealId: target.dealId, contactId: target.contactId, companyId: target.companyId } })
      setTitle('')
      setDueOn('')
      await load()
      void router.invalidate()
    } catch (err) {
      setError(errorMessage(err, 'Could not add the task.'))
    } finally {
      setAdding(false)
    }
  }

  async function complete(task: TaskRow) {
    setError(null)
    setCompleting((s) => new Set(s).add(task.id))
    try {
      await setTaskDone({ data: { id: task.id, done: true } })
      setRows((r) => r?.filter((t) => t.id !== task.id) ?? r)
    } catch (err) {
      setError(errorMessage(err, 'Could not complete the task.'))
    } finally {
      setCompleting((s) => {
        const n = new Set(s)
        n.delete(task.id)
        return n
      })
    }
  }

  return (
    <Card>
      <CardHeader
        title="Tasks"
        description={rows ? (rows.length ? `${rows.length} open` : 'Nothing open') : undefined}
        actions={
          <Link to="/app/tasks" search={{ view: 'all' }} className={buttonClass('ghost', 'sm')}>
            View all
          </Link>
        }
      />
      <form onSubmit={onAdd} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border p-3" noValidate>
        <Input aria-label="New task" placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="col-span-2 h-8 text-[13px]" />
        <Input aria-label="Due date" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="h-8 w-full min-w-0 text-[13px]" />
        <Button type="submit" size="sm" icon={<IconPlus />} pending={adding} disabled={!title.trim()}>
          Add
        </Button>
      </form>
      {error && (
        <div className="p-3 pb-0">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}
      {rows === null ? (
        <p className="flex h-[53px] items-center gap-2 px-4 text-[13px] text-fg-muted" aria-busy>
          {slow && (
            <>
              <Spinner /> Loading
            </>
          )}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-fg-subtle">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t) => {
            const busy = completing.has(t.id)
            return (
              <li key={t.id} className={`flex items-start gap-2.5 px-4 py-2.5 transition-opacity ${busy ? 'opacity-60' : ''}`}>
                <input
                  type="checkbox"
                  aria-label={`Complete ${t.title}`}
                  checked={busy}
                  disabled={busy}
                  onChange={() => complete(t)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm break-words ${busy ? 'text-fg-muted line-through' : ''}`}>{t.title}</p>
                  {t.dueOn && (
                    <div className="mt-0.5">
                      <DueLabel dueOn={t.dueOn} today={today} overdue={t.overdue} />
                    </div>
                  )}
                </div>
                <Avatar name={t.assigneeName} size="xs" className="mt-0.5" />
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
