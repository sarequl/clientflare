import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { getInvoice } from '#/features/invoices/server'
import { InvoiceDocument, useAutoPrint } from '#/components/InvoiceDocument'
import { Button, buttonClass } from '#/components/Button'
import { useApp } from '#/components/useApp'
import { dayOf } from '#/lib/format'
import { IconChevronLeft } from '#/components/icons'
import { IconPrinter } from '#/components/icons-invoice'

/** Print view for any invoice, drafts included. The _ws shell renders this route bare. */
export const Route = createFileRoute('/app/_ws/invoices/$invoiceId_/print')({
  validateSearch: (search: Record<string, unknown>) => z.object({ print: z.coerce.number().optional().catch(undefined) }).parse(search),
  loader: async ({ params }) => {
    const data = await getInvoice({ data: { id: params.invoiceId } })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.invoice.number ?? 'Draft invoice'} · Print` }] }),
  component: PrintPage,
})

function PrintPage() {
  const { invoice, business } = Route.useLoaderData()
  const { print } = Route.useSearch()
  const app = useApp()
  useAutoPrint(print === 1)
  const name = !business.name || business.name === app.workspace.id ? app.workspace.name : business.name

  return (
    <div className="min-h-dvh bg-surface-3 px-2 py-4 sm:px-6 sm:py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 print:hidden">
        <Link to="/app/invoices/$invoiceId" params={{ invoiceId: invoice.id }} className={buttonClass('ghost', 'sm')}>
          <IconChevronLeft size={14} /> Back to invoice
        </Link>
        <Button size="sm" variant="primary" icon={<IconPrinter />} onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>
      <InvoiceDocument invoice={{ ...invoice, revisedAt: invoice.revisedAt ? dayOf(invoice.revisedAt, app.workspace.timezone) : null }} business={{ ...business, name }} />
    </div>
  )
}
