import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { listCompanies } from '#/features/companies/server'
import { listTags } from '#/features/tags/server'
import { listFields } from '#/features/custom-fields/server'
import { exportCompanies } from '#/features/csv/server'
import { errorMessage } from '#/lib/format'
import { Card, Notice, PageHeader } from '#/components/Card'
import { Button, buttonClass } from '#/components/Button'
import { Select } from '#/components/Field'
import { Modal } from '#/components/Modal'
import { EmptyState } from '#/components/EmptyState'
import { SearchInput } from '#/components/SearchInput'
import { Pagination } from '#/components/Pagination'
import { OverflowMenu } from '#/components/Popover'
import { TagList } from '#/components/TagChip'
import { CompanyForm } from '#/components/CompanyForm'
import { downloadText } from '#/components/download'
import { IconBuilding, IconDownload, IconPlus, IconUpload } from '#/components/icons'

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  tagId: z.string().optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(['name', 'updated']).optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/app/_ws/companies/')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ q: search.q, tagId: search.tagId, page: search.page, sort: search.sort }),
  loader: async ({ deps }) => {
    const [list, tags, fields] = await Promise.all([
      listCompanies({ data: { q: deps.q || undefined, tagId: deps.tagId, page: deps.page ?? 1, sort: deps.sort ?? 'name' } }),
      listTags(),
      listFields({ data: { recordType: 'company' } }),
    ])
    return { list, tags, fields }
  },
  head: () => ({ meta: [{ title: 'Companies · Clientflare' }] }),
  component: CompaniesPage,
})

function CompaniesPage() {
  const { list, tags, fields } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filtered = !!(search.q || search.tagId)

  useEffect(() => {
    if (search.new) {
      setCreating(true)
      navigate({ search: (s) => ({ ...s, new: undefined }), replace: true })
    }
  }, [search.new, navigate])

  async function onExport() {
    setError(null)
    setExporting(true)
    try {
      const { filename, csv } = await exportCompanies()
      downloadText(filename, csv)
    } catch (err) {
      setError(errorMessage(err, 'Could not export companies.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Companies"
        description="Organisations your contacts belong to."
        actions={
          <>
            <Button variant="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>
              New company
            </Button>
            <OverflowMenu
              items={[
                { label: 'Import CSV', icon: <IconUpload />, link: { to: '/app/companies/import' } },
                { label: exporting ? 'Exporting…' : 'Export CSV', icon: <IconDownload />, onSelect: onExport, disabled: exporting },
              ]}
            />
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search.q ?? ''}
          onChange={(q) => navigate({ search: (s) => ({ ...s, q: q || undefined, page: undefined }), replace: true })}
          placeholder="Search name or domain"
          label="Search companies"
          className="sm:flex-1"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            aria-label="Filter by tag"
            value={search.tagId ?? ''}
            onChange={(e) => navigate({ search: (s) => ({ ...s, tagId: e.target.value || undefined, page: undefined }) })}
            className="sm:w-40"
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Sort"
            value={search.sort ?? 'name'}
            onChange={(e) => navigate({ search: (s) => ({ ...s, sort: e.target.value === 'updated' ? 'updated' : undefined, page: undefined }) })}
            className="sm:w-40"
          >
            <option value="name">Name A–Z</option>
            <option value="updated">Recently updated</option>
          </Select>
        </div>
      </div>

      {error && (
        <div className="mb-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      <Card>
        {list.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<IconBuilding size={18} />}
              title="No companies match"
              body="Try another search or clear the tag filter."
              action={
                <Link to="/app/companies" className={buttonClass('secondary', 'sm')}>
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={<IconBuilding size={18} />}
              title="No companies yet"
              body="Add the organisations you work with, or import them from a spreadsheet."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link to="/app/companies/import" className={buttonClass('secondary', 'sm')}>
                    <IconUpload /> Import CSV
                  </Link>
                  <Button size="sm" variant="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>
                    New company
                  </Button>
                </div>
              }
            />
          )
        ) : (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-border text-[12px] text-fg-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">Domain</th>
                  <th scope="col" className="px-3 py-2 font-medium">Phone</th>
                  <th scope="col" className="px-3 py-2 font-medium">Contacts</th>
                  <th scope="col" className="px-4 py-2 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td className="max-w-60 truncate px-4 py-2.5" title={c.name}>
                      <Link to="/app/companies/$companyId" params={{ companyId: c.id }} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="max-w-48 truncate px-3 py-2.5 text-fg-muted" title={c.domain ?? undefined}>{c.domain || <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted tnum">{c.phone || <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2.5 text-fg-muted tnum">{c.contactCount}</td>
                    <td className="px-4 py-2.5">
                      <TagList tags={c.tags} max={3} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-border md:hidden">
              {list.rows.map((c) => (
                <li key={c.id} className="relative px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link to="/app/companies/$companyId" params={{ companyId: c.id }} title={c.name} className="min-w-0 flex-1 truncate text-sm font-medium after:absolute after:inset-0">
                      {c.name}
                    </Link>
                    <span className="shrink-0 text-[12px] text-fg-subtle tnum">
                      {c.contactCount} {c.contactCount === 1 ? 'contact' : 'contacts'}
                    </span>
                  </div>
                  {(c.domain || c.phone) && <p className="truncate text-[13px] text-fg-muted">{[c.domain, c.phone].filter(Boolean).join(' · ')}</p>}
                  {c.tags.length > 0 && (
                    <div className="mt-1.5">
                      <TagList tags={c.tags} max={4} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={(page) => navigate({ search: (s) => ({ ...s, page: page > 1 ? page : undefined }) })} />
          </>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New company">
        <CompanyForm
          fields={fields}
          tags={tags}
          onDone={(id) => {
            setCreating(false)
            if (id) navigate({ to: '/app/companies/$companyId', params: { companyId: id } })
          }}
        />
      </Modal>
    </>
  )
}
