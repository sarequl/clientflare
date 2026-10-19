import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { createInvoice, getInvoiceStats, listInvoices } from '#/features/invoices/server'
import { errorMessage, formatDay } from '#/lib/format'
import { Card, Notice, PageHeader } from '#/components/Card'
import { Button, Spinner, buttonClass } from '#/components/Button'
import { EmptyState } from '#/components/EmptyState'
import { SearchInput } from '#/components/SearchInput'
import { Pagination } from '#/components/Pagination'
import { Money } from '#/components/Money'
import { InvoiceStatusBadge } from '#/components/InvoiceStatusBadge'
import { IconPlus } from '#/components/icons'
import { IconInvoice } from '#/components/icons-invoice'
import { TabLink, Tabs } from '#/components/Tabs'

const STATUS_TABS = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
] as const

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(['draft', 'sent', 'paid', 'void', 'overdue']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
  dealId: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/app/_ws/invoices/')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ q: search.q, status: search.status, page: search.page }),
  loader: async ({ deps }) => {
    const [list, stats] = await Promise.all([listInvoices({ data: { q: deps.q || undefined, status: deps.status, page: deps.page ?? 1 } }), getInvoiceStats()])
    return { list, stats }
  },
  head: () => ({ meta: [{ title: 'Invoices · Clientflare' }] }),
  component: InvoicesPage,
})

function InvoicesPage() {
  const { list, stats } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const filtered = !!(search.q || search.status)

  async function newInvoice(dealId?: string) {
    setError(null)
    setCreating(true)
    try {
      const { id } = await createInvoice({ data: dealId ? { dealId } : {} })
      await navigate({ to: '/app/invoices/$invoiceId', params: { invoiceId: id } })
    } catch (err) {
      setError(errorMessage(err, 'Could not create the invoice.'))
      setCreating(false)
    }
  }

  // ?new=true and ?dealId=… create a draft straight away. The ref stops a double create.
  useEffect(() => {
    if (started.current || (!search.new && !search.dealId)) return
    started.current = true
    const dealId = search.dealId
    navigate({ search: (s) => ({ ...s, new: undefined, dealId: undefined }), replace: true })
    void newInvoice(dealId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.new, search.dealId])

  const draftCount = stats.reduce((n, s) => n + (s.draftCount ?? 0), 0)
  const money = stats.filter((s) => s.outstanding || s.overdue)

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bill clients and track what's owed."
        actions={
          <Button variant="primary" icon={<IconPlus />} pending={creating} onClick={() => newInvoice()}>
            New invoice
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-[12px] text-fg-muted">Outstanding</p>
          <div className="mt-0.5 flex flex-col text-[15px] font-semibold sm:text-base">
            {money.length ? money.map((s) => <Money key={s.currency} minor={s.outstanding ?? 0} currency={s.currency} />) : <span className="text-fg-subtle">—</span>}
          </div>
        </Card>
        <Card className="p-3">
          <p className="text-[12px] text-fg-muted">Overdue</p>
          <div className="mt-0.5 flex flex-col text-[15px] font-semibold sm:text-base">
            {money.some((s) => s.overdue) ? (
              money
                .filter((s) => s.overdue)
                .map((s) => (
                  <span key={s.currency} className="text-danger">
                    <Money minor={s.overdue ?? 0} currency={s.currency} /> <span className="text-[12px] font-normal">· {s.overdueCount}</span>
                  </span>
                ))
            ) : (
              <span className="text-fg-subtle">—</span>
            )}
          </div>
        </Card>
        <Card className="p-3">
          <p className="text-[12px] text-fg-muted">Drafts</p>
          <p className="mt-0.5 text-[15px] font-semibold tnum sm:text-base">{draftCount}</p>
        </Card>
      </div>

      <Tabs label="Filter by status" className="mb-3">
        {STATUS_TABS.map((t) => (
          <TabLink key={t.label} from={Route.fullPath} search={(s) => ({ ...s, status: t.value, page: undefined })} active={search.status === t.value}>
            {t.label}
          </TabLink>
        ))}
      </Tabs>

      <div className="mb-3">
        <SearchInput
          value={search.q ?? ''}
          onChange={(q) => navigate({ search: (s) => ({ ...s, q: q || undefined, page: undefined }), replace: true })}
          placeholder="Search number or recipient"
          label="Search invoices"
        />
      </div>

      {error && (
        <div className="mb-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}

      <Card>
        {creating && list.rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted">
            <Spinner /> Creating draft
          </div>
        ) : list.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<IconInvoice size={18} />}
              title="No invoices match"
              body="Try another search or status."
              action={
                <Link to="/app/invoices" className={buttonClass('secondary', 'sm')}>
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={<IconInvoice size={18} />}
              title="No invoices yet"
              body="Draft one, send the link, and mark it paid when the money lands. Paid invoices become income automatically."
              action={
                <Button size="sm" variant="primary" icon={<IconPlus />} pending={creating} onClick={() => newInvoice()}>
                  New invoice
                </Button>
              }
            />
          )
        ) : (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-border text-[12px] text-fg-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Number</th>
                  <th scope="col" className="px-3 py-2 font-medium">Bill to</th>
                  <th scope="col" className="px-3 py-2 font-medium">Issued</th>
                  <th scope="col" className="px-3 py-2 font-medium">Due</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.rows.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link to="/app/invoices/$invoiceId" params={{ invoiceId: inv.id }} className={`font-medium hover:underline ${inv.number ? 'tnum' : 'text-fg-muted italic'}`}>
                        {inv.number ?? 'Draft'}
                      </Link>
                    </td>
                    <td className="max-w-60 truncate px-3 py-2.5">{inv.billTo.split('\n')[0] || <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted tnum">{formatDay(inv.issuedOn)}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap tnum ${inv.overdue ? 'font-medium text-danger' : 'text-fg-muted'}`}>
                      {inv.dueOn ? formatDay(inv.dueOn) : <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Money minor={inv.totalMinor} currency={inv.currency} className="font-medium" />
                    </td>
                    <td className="px-4 py-2.5">
                      <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-border md:hidden">
              {list.rows.map((inv) => (
                <li key={inv.id} className="relative flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/app/invoices/$invoiceId"
                      params={{ invoiceId: inv.id }}
                      className={`text-sm font-medium after:absolute after:inset-0 ${inv.number ? 'tnum' : 'text-fg-muted italic'}`}
                    >
                      {inv.number ?? 'Draft'}
                    </Link>
                    <p className="truncate text-[13px] text-fg-muted">{inv.billTo.split('\n')[0] || 'No recipient'}</p>
                    <p className="text-[12px] text-fg-subtle tnum">
                      {formatDay(inv.issuedOn)}
                      {inv.dueOn && <span className={inv.overdue ? 'font-medium text-danger' : ''}> · due {formatDay(inv.dueOn)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Money minor={inv.totalMinor} currency={inv.currency} className="text-sm font-semibold" />
                    <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={(page) => navigate({ search: (s) => ({ ...s, page: page > 1 ? page : undefined }) })} />
          </>
        )}
      </Card>
    </>
  )
}
