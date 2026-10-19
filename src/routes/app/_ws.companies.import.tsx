import { Link, createFileRoute } from '@tanstack/react-router'
import { COMPANY_COLUMNS, importCompanies } from '#/features/csv/server'
import { listFields } from '#/features/custom-fields/server'
import { PageHeader } from '#/components/Card'
import { CsvImport } from '#/components/CsvImport'
import { IconChevronLeft } from '#/components/icons'

export const Route = createFileRoute('/app/_ws/companies/import')({
  loader: async () => ({ fields: await listFields({ data: { recordType: 'company' } }) }),
  head: () => ({ meta: [{ title: 'Import companies · Clientflare' }] }),
  component: ImportCompaniesPage,
})

const META: Record<(typeof COMPANY_COLUMNS)[number], { label: string; aliases: string[] }> = {
  name: { label: 'Name', aliases: ['company', 'company name', 'organization', 'organisation', 'account'] },
  domain: { label: 'Domain', aliases: ['domain name'] },
  website: { label: 'Website', aliases: ['url', 'web', 'site', 'homepage'] },
  phone: { label: 'Phone', aliases: ['telephone', 'phone number'] },
  address: { label: 'Address', aliases: ['street', 'location', 'billing address'] },
  notes: { label: 'Notes', aliases: ['note', 'description', 'comments'] },
  tags: { label: 'Tags', aliases: ['tag', 'labels', 'groups'] },
}

function ImportCompaniesPage() {
  const { fields } = Route.useLoaderData()
  return (
    <>
      <Link to="/app/companies" className="mb-3 inline-flex items-center gap-1 rounded text-[13px] text-fg-muted hover:text-fg">
        <IconChevronLeft size={14} /> Companies
      </Link>
      <PageHeader title="Import companies" description="Tags are split on ; or , and created when missing." />
      <CsvImport
        noun={{ one: 'company', many: 'companies' }}
        listTo="/app/companies"
        targets={COMPANY_COLUMNS.map((c) => ({ value: c, ...META[c] }))}
        required="name"
        fields={fields}
        onImport={(text, mapping) => importCompanies({ data: { text, mapping } })}
      />
    </>
  )
}
