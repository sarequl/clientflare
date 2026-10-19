import { formatPercentBp } from '#/lib/format'
import { formatQuantity } from '../InvoiceStatusBadge'
import { Watermark, accentStyle, amountDueMinor, longDate, moneyFor } from './shared'
import type { InvoiceTemplateProps } from './types'

/** Small-caps label. */
const label = 'text-[12px] font-medium tracking-[0.14em] text-neutral-400 [font-variant-caps:all-small-caps]'

/** Hairlines, lots of air, monochrome. The accent only touches the total. */
export function MinimalTemplate({ invoice, business, accent }: InvoiceTemplateProps) {
  const money = moneyFor(invoice)

  return (
    <article
      style={accentStyle(accent)}
      className="invoice-sheet relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-lg bg-white px-6 py-10 text-[13px] leading-relaxed font-light text-neutral-600 shadow-pop sm:px-16 sm:py-16 print:max-w-none print:rounded-none print:p-0 print:shadow-none"
    >
      <Watermark status={invoice.status} variant="text" />

      <header className="relative flex flex-col gap-6 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="min-w-0 text-[15px] font-normal tracking-tight text-neutral-950 [overflow-wrap:anywhere]">{business.name || 'Your business'}</p>
        <div className="shrink-0 sm:text-right">
          <h1 className={label}>Invoice</h1>
          <p className="text-neutral-950 tnum">{invoice.number ?? 'Draft'}</p>
        </div>
      </header>

      <section className="relative mt-14 grid gap-8 border-t border-neutral-200 pt-6 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] print:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h2 className={label}>Billed to</h2>
          <p className="mt-1 whitespace-pre-line text-neutral-900 [overflow-wrap:anywhere]">{invoice.billTo || <span className="text-neutral-400">No recipient</span>}</p>
        </div>
        <div className="min-w-0">
          <h2 className={label}>From</h2>
          <div className="mt-1 [overflow-wrap:anywhere]">
            {business.address && <p className="whitespace-pre-line">{business.address}</p>}
            {business.email && <p>{business.email}</p>}
            {business.taxId && <p>Tax ID {business.taxId}</p>}
            {!business.address && !business.email && !business.taxId && <p className="text-neutral-400">{business.name || 'Your business'}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-4 gap-y-0.5">
          <dt className={label}>Issued</dt>
          <dd className="text-right whitespace-nowrap text-neutral-900 tnum">{longDate(invoice.issuedOn)}</dd>
          {invoice.dueOn && (
            <>
              <dt className={label}>Due</dt>
              <dd className="text-right whitespace-nowrap text-neutral-900 tnum">{longDate(invoice.dueOn)}</dd>
            </>
          )}
          {invoice.status === 'paid' && invoice.paidOn && (
            <>
              <dt className={label}>Paid</dt>
              <dd className="text-right whitespace-nowrap text-neutral-900 tnum">{longDate(invoice.paidOn)}</dd>
            </>
          )}
        </dl>
      </section>

      <table className="relative mt-16 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-neutral-200">
            <th scope="col" className={`${label} pr-4 pb-2 font-medium`}>Description</th>
            <th scope="col" className={`${label} hidden pr-4 pb-2 whitespace-nowrap text-right font-medium sm:table-cell print:table-cell`}>Qty</th>
            <th scope="col" className={`${label} hidden pr-4 pb-2 whitespace-nowrap text-right font-medium sm:table-cell print:table-cell`}>Price</th>
            <th scope="col" className={`${label} pb-2 whitespace-nowrap text-right font-medium`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-5 text-neutral-400">No line items</td>
            </tr>
          ) : (
            invoice.lines.map((l, i) => (
              <tr key={l.id ?? i} className="border-b border-neutral-100 align-top break-inside-avoid">
                <td className="py-4 pr-4 whitespace-pre-line text-neutral-900 [overflow-wrap:anywhere]">
                  {l.description}
                  <span className="block text-[12px] text-neutral-400 sm:hidden print:hidden">
                    {formatQuantity(l.quantityMilli)} × {money(l.unitMinor)}
                  </span>
                </td>
                <td className="hidden py-4 pr-4 text-right tnum sm:table-cell print:table-cell">{formatQuantity(l.quantityMilli)}</td>
                <td className="hidden py-4 pr-4 text-right whitespace-nowrap tnum sm:table-cell print:table-cell">{money(l.unitMinor)}</td>
                <td className="py-4 text-right whitespace-nowrap text-neutral-900 tnum">{money(l.amountMinor)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <dl className="relative mt-8 ml-auto grid w-full grid-cols-[1fr_auto] gap-x-6 gap-y-1 break-inside-avoid sm:max-w-72 print:max-w-72">
        <dt className={label}>Subtotal</dt>
        <dd className="text-right tnum">{money(invoice.subtotalMinor)}</dd>
        {invoice.taxRateBp > 0 && (
          <>
            <dt className={label}>Tax {formatPercentBp(invoice.taxRateBp)}</dt>
            <dd className="text-right tnum">{money(invoice.taxMinor)}</dd>
          </>
        )}
        <div className="col-span-2 mt-3 grid grid-cols-subgrid items-baseline border-t border-neutral-200 pt-3">
          <dt className={label}>Total</dt>
          <dd className="text-right text-2xl font-normal tracking-tight whitespace-nowrap text-(--inv-accent) tnum">
            {money(invoice.totalMinor)} <span className="text-[11px] text-neutral-400">{invoice.currency}</span>
          </dd>
        </div>
        {amountDueMinor(invoice) !== invoice.totalMinor && (
          <>
            <dt className={label}>Amount due</dt>
            <dd className="text-right text-neutral-900 tnum">{money(amountDueMinor(invoice))}</dd>
          </>
        )}
      </dl>

      {invoice.notes && (
        <section className="relative mt-16 max-w-prose break-inside-avoid">
          <h2 className={label}>Notes</h2>
          <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{invoice.notes}</p>
        </section>
      )}
      {invoice.footer && <footer className="relative mt-16 border-t border-neutral-100 pt-4 text-[11px] whitespace-pre-line text-neutral-400 [overflow-wrap:anywhere]">{invoice.footer}</footer>}
    </article>
  )
}
