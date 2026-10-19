import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { updateTask, type listTasks } from '#/features/tasks/server'
import { errorMessage, formatDay } from '#/lib/format'
import { Button } from './Button'
import { Notice } from './Card'
import { Field, Input, Select, Textarea } from './Field'
import { ModalActions } from './Modal'
import { IconBuilding, IconUsers } from './icons'
import { IconHandshake } from './icons2'

export type TaskRow = Awaited<ReturnType<typeof listTasks>>['rows'][number]
export type AssigneeOption = { id: string; name: string }

/** Edit an existing task. Links to records are shown, not edited. */
export function TaskForm({ task, assignees, onDone }: { task: TaskRow; assignees: AssigneeOption[]; onDone: (saved: boolean) => void }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [dueOn, setDueOn] = useState(task.dueOn ?? '')
  const [assigneeUserId, setAssigneeUserId] = useState(task.assigneeUserId ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setTitleError('Give the task a title.')
      return
    }
    setTitleError(null)
    setPending(true)
    try {
      await updateTask({ data: { id: task.id, title: title.trim(), description: description.trim(), dueOn: dueOn || null, assigneeUserId: assigneeUserId || null } })
      onDone(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save the task.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Title" htmlFor="tk-title" error={titleError}>
        <Input id="tk-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={!!titleError} autoComplete="off" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Due" htmlFor="tk-due">
          <Input id="tk-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
        <Field label="Assignee" htmlFor="tk-assignee">
          <Select id="tk-assignee" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
            <option value="">Nobody</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Details" htmlFor="tk-desc">
        <Textarea id="tk-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} />
      </Field>
      {(task.dealId || task.contactId || task.companyId) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
          Linked to <TaskLinkChip task={task} />
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={() => onDone(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Save changes
        </Button>
      </ModalActions>
    </form>
  )
}

const chip = 'inline-flex max-w-full min-w-0 items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-px text-[12px] text-fg-muted hover:border-border-strong hover:text-fg'

/** Link to the record a task belongs to: deal first, then contact, then company. */
export function TaskLinkChip({ task }: { task: Pick<TaskRow, 'dealId' | 'dealTitle' | 'contactId' | 'contactName' | 'companyId' | 'companyName'> }) {
  if (task.dealId)
    return (
      <Link to="/app/deals/$dealId" params={{ dealId: task.dealId }} className={chip}>
        <IconHandshake size={12} className="shrink-0" />
        <span className="truncate">{task.dealTitle ?? 'Deal'}</span>
      </Link>
    )
  if (task.contactId)
    return (
      <Link to="/app/contacts/$contactId" params={{ contactId: task.contactId }} className={chip}>
        <IconUsers size={12} className="shrink-0" />
        <span className="truncate">{task.contactName ?? 'Contact'}</span>
      </Link>
    )
  if (task.companyId)
    return (
      <Link to="/app/companies/$companyId" params={{ companyId: task.companyId }} className={chip}>
        <IconBuilding size={12} className="shrink-0" />
        <span className="truncate">{task.companyName ?? 'Company'}</span>
      </Link>
    )
  return null
}

/** "Today", "Tomorrow", "Overdue · Oct 3" or a plain date. */
export function DueLabel({ dueOn, today, overdue, done }: { dueOn: string | null; today: string; overdue: boolean; done?: boolean }) {
  if (!dueOn) return null
  const tomorrow = shiftDay(today, 1)
  const text = dueOn === today ? 'Today' : dueOn === tomorrow ? 'Tomorrow' : formatDay(dueOn)
  if (overdue && !done)
    return (
      <span className="inline-flex items-center rounded bg-danger-soft px-1.5 py-px text-[12px] font-medium whitespace-nowrap text-danger-soft-fg tnum">
        Overdue · {formatDay(dueOn)}
      </span>
    )
  return <span className={`text-[12px] whitespace-nowrap tnum ${dueOn === today && !done ? 'font-medium text-fg' : 'text-fg-muted'}`}>{text}</span>
}

export function shiftDay(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d! + days))
  return date.toISOString().slice(0, 10)
}
