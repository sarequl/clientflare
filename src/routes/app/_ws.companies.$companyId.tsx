import { useState } from 'react'
import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { deleteCompany, getCompany } from '#/features/companies/server'
import { listActivities } from '#/features/activities/server'
import { listFields } from '#/features/custom-fields/server'
import { listTags, setRecordTags } from '#/features/tags/server'
import { listMembers } from '#/features/workspaces/server'
import { listDeals } from '#/features/deals/server'
import { errorMessage } from '#/lib/format'
import { Card, CardHeader, Notice } from '#/components/Card'
import { Button } from '#/components/Button'
import { ConfirmDialog, Modal } from '#/components/Modal'
import { EmptyState } from '#/components/EmptyState'
import { TagChip } from '#/components/TagChip'
import { TagPicker } from '#/components/TagPicker'
import { Timeline } from '#/components/Timeline'
import { CompanyForm } from '#/components/CompanyForm'
import { ContactForm, fullName } from '#/components/ContactForm'
import { formatFieldValue } from '#/components/CustomFieldInputs'
import { Breakable, DetailList, RecordHeader } from '#/components/RecordDetail'
import { DealsPanel } from '#/components/DealsPanel'
import { TasksPanel } from '#/components/TasksPanel'
import { FilesPanel } from '#/components/FilesPanel'
import { IconChevronLeft, IconPencil, IconPlus, IconTrash, IconUsers } from '#/components/icons'

export const Route = createFileRoute('/app/_ws/companies/$companyId')({
  loader: async ({ params }) => {
    const [company, activities, fields, contactFields, tags, members, deals] = await Promise.all([
      getCompany({ data: { id: params.companyId } }),
      listActivities({ data: { targetType: 'company', targetId: params.companyId } }),
      listFields({ data: { recordType: 'company' } }),
      listFields({ data: { recordType: 'contact' } }),
      listTags(),
      listMembers(),
      listDeals({ data: { companyId: params.companyId } }),
    ])
    if (!company) throw notFound()
    return { company, activities, fields, contactFields, tags, deals, members: members.members.map((m) => ({ userId: m.userId, name: m.name })) }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.company.name ?? 'Company'} · Clientflare` }] }),
  component: CompanyPage,
})

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  domain: 'Domain',
  website: 'Website',
  phone: 'Phone',
  address: 'Address',
  ownerUserId: 'Owner',
}

function websiteHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function CompanyPage() {
  const { company, activities, fields, contactFields, tags, members, deals } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)
  const memberName = new Map(members.map((m) => [m.userId, m.name]))
  const tagIds = company.tags.map((t) => t.id)

  async function saveTags(ids: string[]) {
    setTagError(null)
    try {
      await setRecordTags({ data: { recordType: 'company', recordId: company.id, tagIds: ids } })
      await router.invalidate()
    } catch (err) {
      setTagError(errorMessage(err, 'Could not update tags.'))
    }
  }

  async function confirmDelete() {
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteCompany({ data: { id: company.id } })
      await navigate({ to: '/app/companies' })
    } catch (err) {
      setDeleteError(errorMessage(err))
      setDeletePending(false)
    }
  }

  return (
    <>
      <Link to="/app/companies" className="mb-3 inline-flex items-center gap-1 rounded text-[13px] text-fg-muted hover:text-fg">
        <IconChevronLeft size={14} /> Companies
      </Link>
      <RecordHeader
        title={company.name}
        subtitle={company.domain}
        meta={company.owner ? `Owner: ${company.owner.name}` : 'No owner'}
        tags={
          <>
            {company.tags.map((t) => (
              <TagChip key={t.id} tag={t} onRemove={() => saveTags(tagIds.filter((id) => id !== t.id))} />
            ))}
            <TagPicker tags={tags} value={tagIds} onChange={saveTags} label={company.tags.length ? 'Edit tags' : 'Add tag'} />
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
      {tagError && (
        <div className="mb-4">
          <Notice tone="danger" onDismiss={() => setTagError(null)}>
            {tagError}
          </Notice>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Details" />
            <DetailList
              items={[
                { label: 'Domain', value: company.domain },
                {
                  label: 'Website',
                  value: company.website && (
                    <a href={websiteHref(company.website)} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                      <Breakable text={company.website.replace(/^https?:\/\//i, '')} />
                    </a>
                  ),
                },
                { label: 'Phone', value: company.phone && <a href={`tel:${company.phone}`} className="hover:underline tnum">{company.phone}</a> },
                { label: 'Owner', value: company.owner?.name },
                ...fields.map((f) => ({ label: f.name, value: formatFieldValue(f, company.fieldValues[f.id]) })),
                { label: 'Address', value: company.address && <span className="whitespace-pre-wrap">{company.address}</span>, wide: true },
                { label: 'Notes', value: company.notes && <span className="whitespace-pre-wrap">{company.notes}</span>, wide: true },
              ]}
            />
          </Card>

          <Card>
            <CardHeader
              title="Contacts"
              description={`${company.contacts.length} ${company.contacts.length === 1 ? 'person' : 'people'}`}
              actions={
                <Button size="sm" icon={<IconPlus />} onClick={() => setAddingContact(true)}>
                  Add contact
                </Button>
              }
            />
            {company.contacts.length === 0 ? (
              <EmptyState icon={<IconUsers size={18} />} title="No contacts here yet" />
            ) : (
              <ul className="divide-y divide-border">
                {company.contacts.map((c) => (
                  <li key={c.id} className="relative px-4 py-2.5">
                    <Link to="/app/contacts/$contactId" params={{ contactId: c.id }} className="text-sm font-medium after:absolute after:inset-0 hover:underline">
                      {fullName(c)}
                    </Link>
                    {(c.jobTitle || c.email) && <p className="truncate text-[13px] text-fg-muted">{[c.jobTitle, c.email].filter(Boolean).join(' · ')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <DealsPanel deals={deals.rows} total={deals.total} />
          <TasksPanel companyId={company.id} />
          <FilesPanel recordType="company" recordId={company.id} />
        </div>

        <Timeline
          targetType="company"
          targetId={company.id}
          activities={activities}
          fieldLabels={FIELD_LABELS}
          resolveValue={(field, v) => (field === 'ownerUserId' ? (memberName.get(String(v)) ?? null) : null)}
        />
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit company">
        <CompanyForm company={company} fields={fields} members={members} onDone={() => setEditing(false)} />
      </Modal>

      <Modal open={addingContact} onClose={() => setAddingContact(false)} title={`New contact at ${company.name}`}>
        <ContactForm fields={contactFields} tags={tags} initialCompany={{ id: company.id, name: company.name }} onDone={() => setAddingContact(false)} />
      </Modal>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete ${company.name}?`}
        body={
          company.contacts.length
            ? `Its ${company.contacts.length} ${company.contacts.length === 1 ? 'contact stays' : 'contacts stay'}, without a company. Timeline, tags and custom field values are deleted.`
            : 'Its timeline, tags and custom field values are deleted too. This cannot be undone.'
        }
      />
    </>
  )
}
