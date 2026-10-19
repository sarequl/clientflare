import { useState } from 'react'
import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { deleteDeal, getDeal, moveDeal } from '#/features/deals/server'
import { listActivities } from '#/features/activities/server'
import { listFields } from '#/features/custom-fields/server'
import { listTags, setRecordTags } from '#/features/tags/server'
import { listMembers } from '#/features/workspaces/server'
import { errorMessage, formatDay } from '#/lib/format'
import { formatMoney } from '#/lib/money'
import { Badge, Card, CardHeader, Notice } from '#/components/Card'
import { Button } from '#/components/Button'
import { ConfirmDialog, Modal } from '#/components/Modal'
import { Money } from '#/components/Money'
import { TagChip } from '#/components/TagChip'
import { TagPicker } from '#/components/TagPicker'
import { Timeline } from '#/components/Timeline'
import { DealForm, type DealDetail } from '#/components/DealForm'
import { LostReasonModal } from '#/components/LostReasonModal'
import { TasksPanel } from '#/components/TasksPanel'
import { FilesPanel } from '#/components/FilesPanel'
import { formatFieldValue } from '#/components/CustomFieldInputs'
import { DetailList, RecordHeader } from '#/components/RecordDetail'
import { useApp } from '#/components/useApp'
import { IconBuilding, IconCalendar, IconCheck, IconChevronLeft, IconPencil, IconTrash, IconUsers } from '#/components/icons'
import { IconBan, IconTrophy } from '#/components/icons2'

export const Route = createFileRoute('/app/_ws/deals/$dealId')({
  loader: async ({ params }) => {
    const [deal, activities, fields, tags, members] = await Promise.all([
      getDeal({ data: { id: params.dealId } }),
      listActivities({ data: { targetType: 'deal', targetId: params.dealId } }),
      listFields({ data: { recordType: 'deal' } }),
      listTags(),
      listMembers(),
    ])
    if (!deal) throw notFound()
    return { deal, activities, fields, tags, members: members.members.map((m) => ({ userId: m.userId, name: m.name })) }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.deal.title ?? 'Deal'} · Clientflare` }] }),
  component: DealPage,
})

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  valueMinor: 'Value',
  currency: 'Currency',
  expectedCloseOn: 'Expected close',
  contactId: 'Contact',
  companyId: 'Company',
  ownerUserId: 'Owner',
  tags: 'Tags',
}

function contactName(c: { firstName: string; lastName: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ')
}

function DealPage() {
  const { deal, activities, fields, tags, members } = Route.useLoaderData()
  const app = useApp()
  const router = useRouter()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const memberName = new Map(members.map((m) => [m.userId, m.name]))
  const tagIds = deal.tags.map((t) => t.id)
  const closedFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: app.workspace.timezone })

  async function saveTags(ids: string[]) {
    setError(null)
    try {
      await setRecordTags({ data: { recordType: 'deal', recordId: deal.id, tagIds: ids } })
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err, 'Could not update tags.'))
    }
  }

  async function confirmDelete() {
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteDeal({ data: { id: deal.id } })
      await navigate({ to: '/app/deals' })
    } catch (err) {
      setDeleteError(errorMessage(err))
      setDeletePending(false)
    }
  }

  const contact = deal.contact
  const company = deal.company

  return (
    <>
      <Link to="/app/deals" className="mb-3 inline-flex items-center gap-1 rounded text-[13px] text-fg-muted hover:text-fg">
        <IconChevronLeft size={14} /> Deals
      </Link>
      <RecordHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {deal.title}
            {deal.status === 'won' && <Badge tone="accent">Won</Badge>}
            {deal.status === 'lost' && <Badge tone="danger">Lost</Badge>}
          </span>
        }
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <Money minor={deal.valueMinor} currency={deal.currency} className="font-medium text-fg" />
            {deal.expectedCloseOn && (
              <span className="inline-flex items-center gap-1 tnum">
                <IconCalendar size={13} className="text-fg-subtle" />
                Close {formatDay(deal.expectedCloseOn)}
              </span>
            )}
            {company && (
              <Link to="/app/companies/$companyId" params={{ companyId: company.id }} className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                <IconBuilding size={13} className="text-fg-subtle" />
                {company.name}
              </Link>
            )}
            {contact && (
              <Link to="/app/contacts/$contactId" params={{ contactId: contact.id }} className="inline-flex items-center gap-1 hover:text-fg hover:underline">
                <IconUsers size={13} className="text-fg-subtle" />
                {contactName(contact)}
              </Link>
            )}
          </span>
        }
        meta={
          <>
            {deal.owner ? `Owner: ${deal.owner.name}` : 'No owner'}
            {deal.closedAt && deal.status !== 'open' && ` · ${deal.status === 'won' ? 'Won' : 'Lost'} ${closedFmt.format(new Date(deal.closedAt))}`}
          </>
        }
        tags={
          <>
            {deal.tags.map((t) => (
              <TagChip key={t.id} tag={t} onRemove={() => saveTags(tagIds.filter((id) => id !== t.id))} />
            ))}
            <TagPicker tags={tags} value={tagIds} onChange={saveTags} label={deal.tags.length ? 'Edit tags' : 'Add tag'} />
          </>
        }
        actions={
          <>
            <Button icon={<IconPencil />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              icon={<IconTrash />}
              onClick={() => {
                setDeleteError(null)
                setDeleting(true)
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      <StageStepper deal={deal} onError={setError} />

      <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="Details"
              actions={
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              }
            />
            <DetailList
              items={[
                { label: 'Value', value: <Money minor={deal.valueMinor} currency={deal.currency} /> },
                { label: 'Stage', value: <TagChip tag={{ id: deal.stage.id, name: deal.stage.name, color: deal.stage.color }} /> },
                { label: 'Expected close', value: deal.expectedCloseOn && <span className="tnum">{formatDay(deal.expectedCloseOn)}</span> },
                {
                  label: 'Contact',
                  value: contact && (
                    <Link to="/app/contacts/$contactId" params={{ contactId: contact.id }} className="hover:underline">
                      {contactName(contact)}
                    </Link>
                  ),
                },
                {
                  label: 'Company',
                  value: company && (
                    <Link to="/app/companies/$companyId" params={{ companyId: company.id }} className="hover:underline">
                      {company.name}
                    </Link>
                  ),
                },
                { label: 'Owner', value: deal.owner?.name },
                ...fields.map((f) => ({ label: f.name, value: formatFieldValue(f, deal.fieldValues[f.id]) })),
                ...(deal.status === 'lost' ? [{ label: 'Lost reason', value: deal.lostReason }] : []),
                { label: 'Notes', value: deal.notes && <span className="whitespace-pre-wrap">{deal.notes}</span>, wide: true },
              ]}
            />
          </Card>
          <TasksPanel dealId={deal.id} />
          <FilesPanel recordType="deal" recordId={deal.id} />
        </div>

        <Timeline
          targetType="deal"
          targetId={deal.id}
          activities={activities}
          fieldLabels={FIELD_LABELS}
          resolveValue={(field, v) =>
            field === 'valueMinor'
              ? formatMoney(Number(v), deal.currency)
              : field === 'expectedCloseOn'
                ? formatDay(String(v))
                : field === 'contactId'
                  ? v === contact?.id
                    ? contactName(contact)
                    : null
                  : field === 'companyId'
                    ? v === company?.id
                      ? company.name
                      : null
                    : field === 'ownerUserId'
                      ? (memberName.get(String(v)) ?? null)
                      : null
          }
        />
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit deal">
        <DealForm deal={deal} stages={deal.stages} fields={fields} members={members} onDone={() => setEditing(false)} />
      </Modal>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete ${deal.title}?`}
        body="Its timeline, tasks, tags and custom field values are deleted too. This cannot be undone."
      />
    </>
  )
}

/** Click an open stage to move there; Won / Lost close the deal. */
function StageStepper({ deal, onError }: { deal: DealDetail; onError: (msg: string | null) => void }) {
  const router = useRouter()
  const [pendingStage, setPendingStage] = useState<string | null>(null)
  const [losing, setLosing] = useState(false)
  const open = deal.stages.filter((s) => s.kind === 'open')
  const won = deal.stages.find((s) => s.kind === 'won')
  const lost = deal.stages.find((s) => s.kind === 'lost')
  const currentId = pendingStage ?? deal.stageId
  const current = deal.stages.find((s) => s.id === currentId)
  const currentOpenIdx = open.findIndex((s) => s.id === currentId)

  async function go(stageId: string, lostReason?: string) {
    if (stageId === deal.stageId) return
    onError(null)
    setPendingStage(stageId)
    try {
      await moveDeal({ data: { id: deal.id, stageId, index: 0, lostReason: lostReason || undefined } })
      await router.invalidate()
    } catch (err) {
      onError(errorMessage(err, 'Could not move the deal.'))
    } finally {
      setPendingStage(null)
    }
  }

  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ol aria-label="Stage" className="grid min-w-0 flex-1 grid-cols-2 gap-1 sm:flex sm:overflow-x-auto">
          {open.map((s, i) => {
            const isCurrent = s.id === currentId
            const passed = current?.kind === 'open' ? i < currentOpenIdx : current?.kind === 'won'
            return (
              <li key={s.id} className="min-w-0 sm:min-w-[6.5rem] sm:flex-1">
                <button
                  type="button"
                  aria-current={isCurrent ? 'step' : undefined}
                  disabled={!!pendingStage}
                  onClick={() => go(s.id)}
                  title={isCurrent ? `Current stage: ${s.name}` : `Move to ${s.name}`}
                  className={`flex h-9 w-full items-center justify-center gap-1 truncate rounded-md px-2 text-[13px] font-medium transition-colors disabled:cursor-wait ${
                    isCurrent
                      ? 'bg-accent text-accent-fg'
                      : passed
                        ? 'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft/70'
                        : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg'
                  }`}
                >
                  {passed && !isCurrent && <IconCheck size={13} className="shrink-0" />}
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            )
          })}
        </ol>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          {won && (
            <Button
              variant={current?.kind === 'won' ? 'primary' : 'secondary'}
              icon={<IconTrophy />}
              disabled={!!pendingStage || current?.kind === 'won'}
              pending={pendingStage === won.id}
              onClick={() => go(won.id)}
            >
              {current?.kind === 'won' ? 'Won' : 'Mark won'}
            </Button>
          )}
          {lost && (
            <Button
              variant={current?.kind === 'lost' ? 'danger' : 'secondary'}
              icon={<IconBan />}
              disabled={!!pendingStage || current?.kind === 'lost'}
              pending={pendingStage === lost.id}
              onClick={() => setLosing(true)}
            >
              {current?.kind === 'lost' ? 'Lost' : 'Mark lost'}
            </Button>
          )}
        </div>
      </div>
      {deal.status !== 'open' && <p className="mt-2 text-[12px] text-fg-muted">Closed deals reopen when you pick an open stage.</p>}
      <LostReasonModal
        deal={losing ? deal : null}
        onClose={() => setLosing(false)}
        onConfirm={(reason) => {
          setLosing(false)
          if (lost) void go(lost.id, reason)
        }}
      />
    </Card>
  )
}
