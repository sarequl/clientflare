import { useState, type ComponentType, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { ShareNoteToggle } from './ShareNoteToggle'
import { addActivity, deleteActivity, type listActivities } from '#/features/activities/server'
import { errorMessage, formatDateTime } from '#/lib/format'
import { Button, IconButton } from './Button'
import { Card, CardHeader, Notice } from './Card'
import { EmptyState } from './EmptyState'
import { Input, Textarea } from './Field'
import { ConfirmDialog } from './Modal'
import { IconCalendar, IconMail, IconNote, IconPencil, IconPhone, IconSettings, IconSparkle, IconTrash } from './icons'
import { useApp } from './useApp'

export type Activity = Awaited<ReturnType<typeof listActivities>>[number]
type ManualKind = 'note' | 'call' | 'meeting' | 'email'

const KIND_META: Record<Activity['kind'], { label: string; Icon: ComponentType<{ size?: number }> }> = {
  note: { label: 'Note', Icon: IconNote },
  call: { label: 'Call', Icon: IconPhone },
  meeting: { label: 'Meeting', Icon: IconCalendar },
  email: { label: 'Email', Icon: IconMail },
  created: { label: 'Created', Icon: IconSparkle },
  updated: { label: 'Updated', Icon: IconPencil },
  system: { label: 'System', Icon: IconSettings },
}
const MANUAL: ManualKind[] = ['note', 'call', 'meeting', 'email']

export function Timeline({
  targetType,
  targetId,
  activities,
  fieldLabels,
  resolveValue,
}: {
  targetType: 'contact' | 'company' | 'deal'
  targetId: string
  activities: Activity[]
  /** Pretty names for keys in `updated` diffs. */
  fieldLabels: Record<string, string>
  /** Turn stored values (e.g. ids) into readable text; return null when unknown. */
  resolveValue?: (field: string, value: string | number) => string | null
}) {
  const app = useApp()
  const router = useRouter()
  const [deleting, setDeleting] = useState<Activity | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)


  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteActivity({ data: { id: deleting.id } })
      await router.invalidate()
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }

  const show = (field: string, v: string | number | null) => {
    if (v == null || v === '') return null
    return resolveValue?.(field, v) ?? (field.endsWith('Id') ? null : String(v))
  }

  return (
    <Card>
      <CardHeader title="Timeline" />
      <Composer targetType={targetType} targetId={targetId} />
      {activities.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Notes, calls and changes to this record show up here." />
      ) : (
        <ol className="divide-y divide-border">
          {activities.map((a) => {
            const { label, Icon } = KIND_META[a.kind]
            const manual = (MANUAL as string[]).includes(a.kind)
            const who = a.user?.name ?? 'Someone'
            return (
              <li key={a.id} className="flex flex-wrap gap-x-3 px-4 py-3 sm:flex-nowrap">
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
                    manual ? 'bg-accent-soft text-accent-soft-fg' : 'bg-surface-2 text-fg-subtle'
                  }`}
                >
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-fg-muted">
                    <span className="font-medium text-fg">{manual ? label : who}</span>
                    {manual && <span>by {who}</span>}
                    {a.kind === 'created' && <span>created this record</span>}
                    <time dateTime={new Date(a.occurredAt).toISOString()} className="text-fg-subtle tnum">
                      {formatDateTime(a.occurredAt, app.workspace.timezone)}
                    </time>
                  </p>
                  {a.kind === 'updated' && a.meta ? (
                    <ul className="mt-0.5 text-sm">
                      {Object.entries(a.meta).map(([field, [before, after]]) => {
                        const name = fieldLabels[field] ?? field
                        const b = show(field, before)
                        const c = show(field, after)
                        return (
                          <li key={field} className="text-fg-muted">
                            changed <span className="font-medium text-fg">{name}</span>
                            {b != null && (
                              <>
                                {' '}from <span className="text-fg line-through decoration-fg-subtle">{b}</span>
                              </>
                            )}
                            {c != null ? (
                              <>
                                {' '}to <span className="text-fg">{c}</span>
                              </>
                            ) : after == null ? (
                              <> to empty</>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    a.body && <p className="mt-0.5 text-sm whitespace-pre-wrap">{a.body}</p>
                  )}
                </div>
                {a.kind === 'note' && targetType !== 'deal' && (
                  // Below the note on phones so the text keeps the full width; beside it from sm up.
                  <div className="order-last mt-1.5 basis-full pl-10 sm:order-none sm:mt-0 sm:shrink-0 sm:basis-auto sm:pl-0">
                    <ShareNoteToggle activityId={a.id} shared={a.sharedToPortal} />
                  </div>
                )}
                {manual && (
                  <IconButton
                    aria-label={`Delete ${label.toLowerCase()}`}
                    className="-mr-1.5 shrink-0"
                    icon={<IconTrash />}
                    onClick={() => {
                      setDeleteError(null)
                      setDeleting(a)
                    }}
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete this ${deleting ? KIND_META[deleting.kind].label.toLowerCase() : 'entry'}?`}
        body="It is removed from the timeline for everyone."
      />
    </Card>
  )
}

function Composer({ targetType, targetId }: { targetType: 'contact' | 'company' | 'deal'; targetId: string }) {
  const router = useRouter()
  const [kind, setKind] = useState<ManualKind>('note')
  const [body, setBody] = useState('')
  const [when, setWhen] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!body.trim()) {
      setError('Write something first.')
      return
    }
    let occurredAt: string | undefined
    if (when) {
      const d = new Date(when)
      if (Number.isNaN(d.getTime())) {
        setError('That date and time is not valid.')
        return
      }
      occurredAt = d.toISOString()
    }
    setPending(true)
    try {
      await addActivity({ data: { targetType, targetId, kind, body: body.trim(), occurredAt } })
      await router.invalidate()
      setBody('')
      setWhen('')
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5 border-b border-border p-4" noValidate>
      <div role="radiogroup" aria-label="Entry type" className="inline-flex w-fit flex-wrap rounded-md border border-border bg-surface-2 p-0.5">
        {MANUAL.map((k) => {
          const { label, Icon } = KIND_META[k]
          return (
            <label
              key={k}
              className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${
                kind === k ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <input type="radio" name={`kind-${targetId}`} value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              <Icon size={13} />
              {label}
            </label>
          )
        })}
      </div>
      <Textarea
        aria-label="Details"
        placeholder={kind === 'note' ? 'Add a note' : `What happened on the ${kind}?`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={10000}
        rows={3}
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-fg-muted">
          When (optional)
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-auto text-[13px]" />
        </label>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Log {KIND_META[kind].label.toLowerCase()}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </form>
  )
}
