import { useState } from 'react'
import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import { deleteContact, getContact } from '#/features/contacts/server'
import { listActivities } from '#/features/activities/server'
import { listFields } from '#/features/custom-fields/server'
import { listTags, setRecordTags } from '#/features/tags/server'
import { listMembers } from '#/features/workspaces/server'
import { errorMessage } from '#/lib/format'
import { Card, CardHeader, Notice } from '#/components/Card'
import { Button } from '#/components/Button'
import { ConfirmDialog, Modal } from '#/components/Modal'
import { TagChip } from '#/components/TagChip'
import { TagPicker } from '#/components/TagPicker'
import { Timeline } from '#/components/Timeline'
import { PortalAccessCard } from '#/components/PortalAccessCard'
import { ContactForm, fullName } from '#/components/ContactForm'
import { formatFieldValue } from '#/components/CustomFieldInputs'
import { DetailList, RecordHeader } from '#/components/RecordDetail'
import { TasksPanel } from '#/components/TasksPanel'
import { FilesPanel } from '#/components/FilesPanel'
import { IconBuilding, IconChevronLeft, IconPencil, IconTrash } from '#/components/icons'

export const Route = createFileRoute('/app/_ws/contacts/$contactId')({
  loader: async ({ params }) => {
    const [contact, activities, fields, tags, members] = await Promise.all([
      getContact({ data: { id: params.contactId } }),
      listActivities({ data: { targetType: 'contact', targetId: params.contactId } }),
      listFields({ data: { recordType: 'contact' } }),
      listTags(),
      listMembers(),
    ])
    if (!contact) throw notFound()
    return { contact, activities, fields, tags, members: members.members.map((m) => ({ userId: m.userId, name: m.name })) }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData ? fullName(loaderData.contact) : 'Contact'} · Clientflare` }] }),
  component: ContactPage,
})

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  jobTitle: 'Job title',
  companyId: 'Company',
  ownerUserId: 'Owner',
}

function ContactPage() {
  const { contact, activities, fields, tags, members } = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)
  const memberName = new Map(members.map((m) => [m.userId, m.name]))
  const tagIds = contact.tags.map((t) => t.id)

  async function saveTags(ids: string[]) {
    setTagError(null)
    try {
      await setRecordTags({ data: { recordType: 'contact', recordId: contact.id, tagIds: ids } })
      await router.invalidate()
    } catch (err) {
      setTagError(errorMessage(err, 'Could not update tags.'))
    }
  }

  async function confirmDelete() {
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteContact({ data: { id: contact.id } })
      await navigate({ to: '/app/contacts' })
    } catch (err) {
      setDeleteError(errorMessage(err))
      setDeletePending(false)
    }
  }

  return (
    <>
      <Link to="/app/contacts" className="mb-3 inline-flex items-center gap-1 rounded text-[13px] text-fg-muted hover:text-fg">
        <IconChevronLeft size={14} /> Contacts
      </Link>
      <RecordHeader
        title={fullName(contact)}
        subtitle={
          (contact.jobTitle || contact.company) && (
            <>
              {contact.jobTitle}
              {contact.jobTitle && contact.company && ' at '}
              {contact.company && (
                <Link to="/app/companies/$companyId" params={{ companyId: contact.company.id }} className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
                  <IconBuilding size={13} className="text-fg-subtle" />
                  {contact.company.name}
                </Link>
              )}
            </>
          )
        }
        meta={contact.owner ? `Owner: ${contact.owner.name}` : 'No owner'}
        tags={
          <>
            {contact.tags.map((t) => (
              <TagChip key={t.id} tag={t} onRemove={() => saveTags(tagIds.filter((id) => id !== t.id))} />
            ))}
            <TagPicker tags={tags} value={tagIds} onChange={saveTags} label={contact.tags.length ? 'Edit tags' : 'Add tag'} />
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
                { label: 'Email', value: contact.email && <a href={`mailto:${contact.email}`} className="text-accent hover:underline">{contact.email}</a> },
                { label: 'Phone', value: contact.phone && <a href={`tel:${contact.phone}`} className="hover:underline tnum">{contact.phone}</a> },
                { label: 'Job title', value: contact.jobTitle },
                {
                  label: 'Company',
                  value: contact.company && (
                    <Link to="/app/companies/$companyId" params={{ companyId: contact.company.id }} className="hover:underline">
                      {contact.company.name}
                    </Link>
                  ),
                },
                { label: 'Owner', value: contact.owner?.name },
                ...fields.map((f) => ({ label: f.name, value: formatFieldValue(f, contact.fieldValues[f.id]) })),
                { label: 'Notes', value: contact.notes && <span className="whitespace-pre-wrap">{contact.notes}</span>, wide: true },
              ]}
            />
          </Card>
          <TasksPanel contactId={contact.id} />
          <FilesPanel recordType="contact" recordId={contact.id} />
          <PortalAccessCard contactId={contact.id} email={contact.email} />
        </div>

        <Timeline
          targetType="contact"
          targetId={contact.id}
          activities={activities}
          fieldLabels={FIELD_LABELS}
          resolveValue={(field, v) =>
            field === 'companyId' ? (v === contact.company?.id ? contact.company.name : null) : field === 'ownerUserId' ? (memberName.get(String(v)) ?? null) : null
          }
        />
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit contact">
        <ContactForm contact={contact} fields={fields} members={members} onDone={() => setEditing(false)} />
      </Modal>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete ${fullName(contact)}?`}
        body="Their timeline, tags and custom field values are deleted too. This cannot be undone."
      />
    </>
  )
}
