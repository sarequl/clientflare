import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getPublicInvoice } from '#/features/invoices/server'
import { InvoiceDocument, useAutoPrint } from '#/components/InvoiceDocument'
import { Button } from '#/components/Button'
import { StatusScreen } from '#/components/ErrorScreen'
import { IconChevronLeft } from '#/components/icons'
import { IconPrinter } from '#/components/icons-invoice'

const searchSchema = z.object({
  print: z.coerce.number().optional().catch(undefined),
  from: z.enum(['portal']).optional().catch(undefined),
})

/** Public share link. No auth, no app shell. Printing this page is the PDF. */
export const Route = createFileRoute('/i/$token')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loader: async ({ params }) => {
    if (params.token.length < 20 || params.token.length > 80) return null
    return getPublicInvoice({ data: { token: params.token } })
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Invoice ${loaderData.invoice.number ?? ''} · ${loaderData.business.name}` : 'Invoice not found' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PublicInvoicePage,
})

function PublicInvoicePage() {
  const data = Route.useLoaderData()
  const { print, from } = Route.useSearch()
  useAutoPrint(print === 1 && !!data)

  if (!data) {
    return (
      <StatusScreen
        standalone
        logoLinks={false}
        title="This invoice link doesn't work"
        body="It may have been mistyped, or the invoice was withdrawn. Ask the sender for a fresh link."
      />
    )
  }

  return (
    <main className="min-h-dvh bg-surface-3 px-2 py-4 sm:px-6 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 print:hidden">
        {from === 'portal' ? (
          <a href="/portal" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
            <IconChevronLeft size={14} /> Back to portal
          </a>
        ) : (
          <span className="truncate px-1 text-[13px] text-fg-muted">From {data.business.name}</span>
        )}
        <Button size="sm" variant="primary" icon={<IconPrinter />} onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>
      <InvoiceDocument invoice={data.invoice} business={data.business} />
    </main>
  )
}
