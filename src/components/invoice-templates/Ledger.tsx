import { formatPercentBp } from '#/lib/format'
import { formatQuantity } from '../InvoiceStatusBadge'
import { Watermark, accentStyle, amountDueMinor, longDate, moneyFor, revisedDay } from './shared'
import type { InvoiceTemplateProps } from './types'

const cellLabel = 'text-[10px] font-semibold tracking-[0.1em] text-neutral-500 uppercase'

/** Compact and table-forward with serif headings. Built for long itemised invoices. */
export function LedgerTemplate({ invoice, business, accent }: InvoiceTemplateProps) {
  const money = moneyFor(invoice)
  const revised = revisedDay(invoice)

  return (
    <article
      style={accentStyle(accent)}
      className="invoice-sheet relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-md bg-white px-4 py-6 text-[12px] leading-snug text-neutral-800 shadow-pop sm:px-10 sm:py-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none"
    >
      <header className="relative flex flex-col gap-4 border-b-2 border-(--inv-accent) pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight font-semibold text-neutral-950 [overflow-wrap:anywhere]">{business.name || 'Your business'}</p>
          <div className="mt-1 text-[11px] text-neutral-600">
            {business.address && <p className="whitespace-pre-line">{business.address}</p>}
            {(business.email || business.taxId) && (
              <p>
                {business.email}
                {business.email && business.taxId && <span className="px-1.5 text-neutral-300">|</span>}
                {business.taxId && <>Tax ID {business.taxId}</>}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <h1 className="font-serif text-3xl leading-none font-semibold tracking-tight text-(--inv-accent)">Invoice</h1>
          <p className="mt-1 font-medium text-neutral-600 tnum">{invoice.number ?? 'Draft'}</p>
        </div>
      </header>

      <section className="relative mt-4 grid border border-neutral-300 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] print:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="min-w-0 border-b border-neutral-300 px-3 py-2 sm:border-r sm:border-b-0 print:border-r print:border-b-0">
          <h2 className={cellLabel}>Bill to</h2>
          <p className="mt-0.5 whitespace-pre-line text-neutral-900 [overflow-wrap:anywhere]">{invoice.billTo || <span className="text-neutral-400">No recipient</span>}</p>
        </div>
        <div className="border-b border-neutral-300 px-3 py-2 sm:min-w-28 sm:border-r sm:border-b-0 print:border-r print:border-b-0">
          <h2 className={cellLabel}>Issued</h2>
          <p className="mt-0.5 whitespace-nowrap text-neutral-900 tnum">{longDate(invoice.issuedOn)}</p>
          {revised && <p className="text-[10px] whitespace-nowrap text-neutral-500 tnum">Revised {longDate(revised)}</p>}
        </div>
        <div className="border-b border-neutral-300 px-3 py-2 sm:min-w-28 sm:border-r sm:border-b-0 print:border-r print:border-b-0">
          <h2 className={cellLabel}>{invoice.status === 'paid' && invoice.paidOn ? 'Paid' : 'Due'}</h2>
          <p className={`mt-0.5 whitespace-nowrap tnum ${invoice.status === 'paid' && invoice.paidOn ? 'font-medium text-emerald-700' : 'text-neutral-900'}`}>
            {invoice.status === 'paid' && invoice.paidOn ? longDate(invoice.paidOn) : invoice.dueOn ? longDate(invoice.dueOn) : 'On receipt'}
          </p>
        </div>
        <div className="bg-neutral-50 px-3 py-2">
          <h2 className={cellLabel}>Amount due</h2>
          <p className="mt-0.5 font-semibold whitespace-nowrap text-neutral-950 tnum">{money(amountDueMinor(invoice))}</p>
        </div>
      </section>

      <table className="relative mt-4 w-full border-collapse border border-neutral-300 text-left">
        <thead>
          <tr className="border-b border-neutral-300 bg-neutral-100 font-serif text-[11px] text-neutral-700">
            <th scope="col" className="hidden w-px border-r border-neutral-200 px-2 py-1.5 whitespace-nowrap text-right font-semibold sm:table-cell print:table-cell">#</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Description</th>
            <th scope="col" className="hidden border-l border-neutral-200 px-2 py-1.5 whitespace-nowrap text-right font-semibold sm:table-cell print:table-cell">Qty</th>
            <th scope="col" className="hidden border-l border-neutral-200 px-2 py-1.5 whitespace-nowrap text-right font-semibold sm:table-cell print:table-cell">Unit price</th>
            <th scope="col" className="border-l border-neutral-200 px-2 py-1.5 whitespace-nowrap text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-2 py-3 text-neutral-400">No line items</td>
            </tr>
          ) : (
            invoice.lines.map((l, i) => (
              <tr key={l.id ?? i} className="border-b border-neutral-200 align-top break-inside-avoid even:bg-neutral-50">
                <td className="hidden border-r border-neutral-200 px-2 py-1.5 text-right whitespace-nowrap text-neutral-400 tnum sm:table-cell print:table-cell">{i + 1}</td>
                <td className="px-2 py-1.5 whitespace-pre-line text-neutral-900 [overflow-wrap:anywhere]">
                  {l.description}
                  <span className="block text-[11px] text-neutral-500 sm:hidden print:hidden">
                    {formatQuantity(l.quantityMilli)} × {money(l.unitMinor)}
                  </span>
                </td>
                <td className="hidden border-l border-neutral-200 px-2 py-1.5 text-right tnum sm:table-cell print:table-cell">{formatQuantity(l.quantityMilli)}</td>
                <td className="hidden border-l border-neutral-200 px-2 py-1.5 text-right whitespace-nowrap tnum sm:table-cell print:table-cell">{money(l.unitMinor)}</td>
                <td className="border-l border-neutral-200 px-2 py-1.5 text-right whitespace-nowrap text-neutral-900 tnum">{money(l.amountMinor)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="relative mt-3 flex flex-col gap-4 break-inside-avoid sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
        <p className="text-[11px] text-neutral-500 tnum">
          {invoice.lines.length} {invoice.lines.length === 1 ? 'item' : 'items'}
        </p>
        <dl className="grid w-full grid-cols-[1fr_auto] border border-neutral-300 sm:max-w-72 print:max-w-72">
          <dt className="border-b border-neutral-200 px-2 py-1 text-neutral-600">Subtotal</dt>
          <dd className="border-b border-neutral-200 px-2 py-1 text-right tnum">{money(invoice.subtotalMinor)}</dd>
          {invoice.taxRateBp > 0 && (
            <>
              <dt className="border-b border-neutral-200 px-2 py-1 text-neutral-600">Tax ({formatPercentBp(invoice.taxRateBp)})</dt>
              <dd className="border-b border-neutral-200 px-2 py-1 text-right tnum">{money(invoice.taxMinor)}</dd>
            </>
          )}
          <dt className="border-t-2 border-(--inv-accent) bg-neutral-100 px-2 py-1.5 font-serif text-[14px] font-semibold text-neutral-950">Total</dt>
          <dd className="border-t-2 border-(--inv-accent) bg-neutral-100 px-2 py-1.5 text-right font-serif text-[14px] font-semibold whitespace-nowrap text-neutral-950 tnum">
            {money(invoice.totalMinor)} <span className="font-sans text-[11px] font-medium text-neutral-500">{invoice.currency}</span>
          </dd>
        </dl>
      </div>

      {(invoice.notes || invoice.footer) && (
        <div className="relative mt-6 grid gap-4 border-t border-neutral-300 pt-3 sm:grid-cols-2 print:grid-cols-2">
          {invoice.notes && (
            <section className="min-w-0 break-inside-avoid">
              <h2 className="font-serif text-[12px] font-semibold text-neutral-900">Notes</h2>
              <p className="mt-0.5 whitespace-pre-line [overflow-wrap:anywhere]">{invoice.notes}</p>
            </section>
          )}
          {invoice.footer && (
            <footer className={`min-w-0 text-[11px] whitespace-pre-line text-neutral-500 [overflow-wrap:anywhere] break-inside-avoid ${invoice.notes ? '' : 'sm:col-span-2 print:col-span-2'}`}>{invoice.footer}</footer>
          )}
        </div>
      )}

      {/* Last, so the zebra rows don't paint over the stamp. */}
      <Watermark status={invoice.status} className="font-serif" />
    </article>
  )
}
