import { createFileRoute, redirect } from '@tanstack/react-router'
import { formatDay } from '#/lib/format'
import { Card, CardHeader } from '#/components/Card'
import { EmptyState } from '#/components/EmptyState'
import { Money } from '#/components/Money'
import { InvoiceStatusBadge } from '#/components/InvoiceStatusBadge'
import { buttonClass } from '#/components/Button'
import { IconDownload, IconNote } from '#/components/icons'
import { IconFile, IconInvoice } from '#/components/icons-invoice'

export const Route = createFileRoute('/portal/')({
  loader: ({ context }) => {
    if (!context.portal) throw redirect({ to: '/portal/login' })
    return context.portal
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.business.name || 'Client'} portal` }] }),
  component: PortalHome,
})

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const noteDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function PortalHome() {
  const { contact, invoices, files, notes, business } = Route.useLoaderData()
  const open = invoices.filter((i) => i.status === 'sent')
  const owed = new Map<string, number>()
  for (const i of open) owed.set(i.currency, (owed.get(i.currency) ?? 0) + i.totalMinor)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hi {contact.firstName}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {open.length === 0 ? (
            'Nothing to pay right now.'
          ) : (
            <>
              {open.length} open {open.length === 1 ? 'invoice' : 'invoices'} ·{' '}
              {[...owed.entries()].map(([c, v], i) => (
                <span key={c}>
                  {i > 0 && ', '}
                  <Money minor={v} currency={c} className="font-medium text-fg" />
                </span>
              ))}{' '}
              due
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader title="Invoices" />
        {invoices.length === 0 ? (
          <EmptyState icon={<IconInvoice size={18} />} title="No invoices yet" body={`Invoices from ${business.name || 'us'} will appear here.`} />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id} className="relative flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <a href={`/i/${inv.publicToken}?from=portal`} className="text-sm font-medium tnum after:absolute after:inset-0">
                      {inv.number}
                    </a>
                    <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
                  </div>
                  <p className="mt-0.5 text-[13px] text-fg-muted tnum">
                    Issued {formatDay(inv.issuedOn)}
                    {inv.status === 'paid' && inv.paidOn ? (
                      <> · paid {formatDay(inv.paidOn)}</>
                    ) : (
                      inv.dueOn && <span className={inv.overdue ? 'font-medium text-danger' : ''}> · due {formatDay(inv.dueOn)}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <Money minor={inv.totalMinor} currency={inv.currency} className="text-sm font-semibold" />
                  <span className="text-[12px] font-medium text-accent">View</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Files" />
        {files.length === 0 ? (
          <EmptyState icon={<IconFile size={18} />} title="No shared files" body="Documents shared with you will show up here." />
        ) : (
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <IconFile className="shrink-0 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-[12px] text-fg-muted tnum">
                    {formatSize(f.size)} · {noteDate.format(new Date(f.createdAt))}
                  </p>
                </div>
                <a href={`/api/files/${f.id}?download=1`} className={buttonClass('secondary', 'sm')} aria-label={`Download ${f.name}`}>
                  <IconDownload /> <span className="hidden sm:inline">Download</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Notes" />
        {notes.length === 0 ? (
          <EmptyState icon={<IconNote size={18} />} title="No notes yet" body="Updates shared with you will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="px-4 py-3">
                <p className="text-[12px] text-fg-muted">
                  {n.author ?? business.name} · {noteDate.format(new Date(n.occurredAt))}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {business.email && (
        <p className="text-center text-[13px] text-fg-muted">
          Questions? Email{' '}
          <a href={`mailto:${business.email}`} className="font-medium text-accent hover:underline">
            {business.email}
          </a>
        </p>
      )}
    </div>
  )
}
