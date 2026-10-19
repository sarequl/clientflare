import { Link, createFileRoute } from '@tanstack/react-router'
import { CONTACT_COLUMNS, importContacts } from '#/features/csv/server'
import { listFields } from '#/features/custom-fields/server'
import { PageHeader } from '#/components/Card'
import { CsvImport } from '#/components/CsvImport'
import { IconChevronLeft } from '#/components/icons'

export const Route = createFileRoute('/app/_ws/contacts/import')({
  loader: async () => ({ fields: await listFields({ data: { recordType: 'contact' } }) }),
  head: () => ({ meta: [{ title: 'Import contacts · Clientflare' }] }),
  component: ImportContactsPage,
})

const META: Record<(typeof CONTACT_COLUMNS)[number], { label: string; aliases: string[] }> = {
  firstName: { label: 'First name', aliases: ['first', 'given name', 'forename', 'name'] },
  lastName: { label: 'Last name', aliases: ['last', 'surname', 'family name'] },
  email: { label: 'Email', aliases: ['e-mail', 'email address', 'mail'] },
  phone: { label: 'Phone', aliases: ['mobile', 'telephone', 'phone number', 'cell'] },
  jobTitle: { label: 'Job title', aliases: ['title', 'position', 'role'] },
  company: { label: 'Company', aliases: ['organization', 'organisation', 'company name', 'account'] },
  notes: { label: 'Notes', aliases: ['note', 'description', 'comments'] },
  tags: { label: 'Tags', aliases: ['tag', 'labels', 'groups'] },
}

function ImportContactsPage() {
  const { fields } = Route.useLoaderData()
  return (
    <>
      <Link to="/app/contacts" className="mb-3 inline-flex items-center gap-1 rounded text-[13px] text-fg-muted hover:text-fg">
        <IconChevronLeft size={14} /> Contacts
      </Link>
      <PageHeader title="Import contacts" description="New company names are created for you. Tags are split on ; or , and created when missing." />
      <CsvImport
        noun={{ one: 'contact', many: 'contacts' }}
        listTo="/app/contacts"
        targets={CONTACT_COLUMNS.map((c) => ({ value: c, ...META[c] }))}
        required="firstName"
        fields={fields}
        onImport={(text, mapping) => importContacts({ data: { text, mapping } })}
      />
    </>
  )
}
