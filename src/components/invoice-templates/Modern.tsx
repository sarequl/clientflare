import { formatPercentBp } from '#/lib/format'
import { formatQuantity } from '../InvoiceStatusBadge'
import { Watermark, accentStyle, amountDueMinor, longDate, moneyFor, revisedDay } from './shared'
import type { InvoiceTemplateProps } from './types'

const label = 'text-[11px] font-semibold tracking-[0.12em] uppercase'

/** Accent header band, roomy body, totals in a tinted box. */
export function ModernTemplate({ invoice, business, accent }: InvoiceTemplateProps) {
  const money = moneyFor(invoice)
  const revised = revisedDay(invoice)

  return (
    <article
      style={accentStyle(accent)}
      className="invoice-sheet relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-xl bg-white font-sans text-[13px] leading-relaxed text-neutral-700 shadow-pop print:max-w-none print:rounded-none print:shadow-none"
    >
      <header className="flex flex-col gap-6 bg-(--inv-accent) px-6 py-8 text-(--inv-on-accent) sm:flex-row sm:items-start sm:justify-between sm:px-12 sm:py-11 print:rounded-xl print:px-9 print:py-8">
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-bold tracking-tight [overflow-wrap:anywhere]">{business.name || 'Your business'}</p>
          <div className="mt-2 opacity-80">
            {business.address && <p className="whitespace-pre-line">{business.address}</p>}
            {business.email && <p>{business.email}</p>}
            {business.taxId && <p>Tax ID: {business.taxId}</p>}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <h1 className={`${label} opacity-80`}>Invoice</h1>
          <p className="mt-1 text-2xl leading-tight font-bold tracking-tight tnum">{invoice.number ?? 'Draft'}</p>
        </div>
      </header>

      <div className="px-6 py-8 sm:px-12 sm:py-11 print:px-0 print:pt-9 print:pb-0">
        <section className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h2 className={`${label} text-(--inv-accent)`}>Bill to</h2>
            <p className="mt-1.5 whitespace-pre-line text-neutral-900 [overflow-wrap:anywhere]">{invoice.billTo || <span className="text-neutral-400">No recipient</span>}</p>
          </div>
          <div>
            <h2 className={`${label} text-(--inv-accent)`}>Issued</h2>
            <p className="mt-1.5 whitespace-nowrap text-neutral-900 tnum">{longDate(invoice.issuedOn)}</p>
            {revised && <p className="mt-0.5 text-[11px] whitespace-nowrap text-neutral-500 tnum">Revised {longDate(revised)}</p>}
            {invoice.status === 'paid' && invoice.paidOn && (
              <>
                <h2 className={`${label} mt-4 text-emerald-700`}>Paid</h2>
                <p className="mt-1.5 font-medium text-emerald-700 tnum">{longDate(invoice.paidOn)}</p>
              </>
            )}
          </div>
          <div>
            <h2 className={`${label} text-(--inv-accent)`}>Due</h2>
            <p className="mt-1.5 whitespace-nowrap text-neutral-900 tnum">{invoice.dueOn ? longDate(invoice.dueOn) : 'On receipt'}</p>
          </div>
        </section>

        <table className="mt-12 w-full border-collapse text-left">
          <thead>
            <tr className={`${label} border-b-2 border-(--inv-accent) text-(--inv-accent)`}>
              <th scope="col" className="pr-4 pb-3 font-semibold">Description</th>
              <th scope="col" className="hidden pr-4 pb-3 whitespace-nowrap text-right font-semibold sm:table-cell print:table-cell">Qty</th>
              <th scope="col" className="hidden pr-4 pb-3 whitespace-nowrap text-right font-semibold sm:table-cell print:table-cell">Rate</th>
              <th scope="col" className="pb-3 whitespace-nowrap text-right font-semibold">Amount</th>
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
                    <span className="block text-[12px] text-neutral-500 sm:hidden print:hidden">
                      {formatQuantity(l.quantityMilli)} × {money(l.unitMinor)}
                    </span>
                  </td>
                  <td className="hidden py-4 pr-4 text-right tnum sm:table-cell print:table-cell">{formatQuantity(l.quantityMilli)}</td>
                  <td className="hidden py-4 pr-4 text-right whitespace-nowrap tnum sm:table-cell print:table-cell">{money(l.unitMinor)}</td>
                  <td className="py-4 text-right font-medium whitespace-nowrap text-neutral-900 tnum">{money(l.amountMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-8 flex justify-end break-inside-avoid">
          <dl className="grid w-full max-w-80 grid-cols-[1fr_auto] gap-x-6 gap-y-2 rounded-xl bg-[color-mix(in_srgb,var(--inv-accent)_9%,white)] p-5 sm:p-6">
            <dt className="text-neutral-600">Subtotal</dt>
            <dd className="text-right text-neutral-900 tnum">{money(invoice.subtotalMinor)}</dd>
            {invoice.taxRateBp > 0 && (
              <>
                <dt className="text-neutral-600">Tax ({formatPercentBp(invoice.taxRateBp)})</dt>
                <dd className="text-right text-neutral-900 tnum">{money(invoice.taxMinor)}</dd>
              </>
            )}
            <div className="col-span-2 mt-2 grid grid-cols-subgrid items-baseline border-t border-[color-mix(in_srgb,var(--inv-accent)_25%,white)] pt-3">
              <dt className="font-semibold text-neutral-900">Total</dt>
              <dd className="text-right text-xl font-bold whitespace-nowrap text-(--inv-accent) tnum">
                {money(invoice.totalMinor)} <span className="text-[12px] font-medium text-neutral-500">{invoice.currency}</span>
              </dd>
            </div>
            <dt className="text-neutral-600">Amount due</dt>
            <dd className="text-right font-semibold text-neutral-900 tnum">{money(amountDueMinor(invoice))}</dd>
          </dl>
        </div>

        {invoice.notes && (
          <section className="mt-12 break-inside-avoid">
            <h2 className={`${label} text-(--inv-accent)`}>Notes</h2>
            <p className="mt-1.5 whitespace-pre-line [overflow-wrap:anywhere]">{invoice.notes}</p>
          </section>
        )}
        {invoice.footer && <footer className="mt-12 border-t border-neutral-200 pt-5 text-[12px] whitespace-pre-line text-neutral-500 [overflow-wrap:anywhere]">{invoice.footer}</footer>}
      </div>

      {/* After the band so the stamp sits on top of it. */}
      <Watermark status={invoice.status} />
    </article>
  )
}
