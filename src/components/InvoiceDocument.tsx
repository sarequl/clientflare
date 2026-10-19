import { useEffect } from 'react'
import { formatMoney } from '#/lib/money'
import { formatPercentBp } from '#/lib/format'
import { formatQuantity } from './InvoiceStatusBadge'

export type InvoiceDocData = {
  number: string | null
  status: 'draft' | 'sent' | 'paid' | 'void'
  billTo: string
  currency: string
  issuedOn: string
  dueOn: string | null
  paidOn: string | null
  taxRateBp: number
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  notes: string | null
  footer: string | null
  lines: { id?: string; description: string; quantityMilli: number; unitMinor: number; amountMinor: number }[]
}

export type BusinessBlock = { name: string; address: string | null; email: string | null; taxId: string | null }

/** "2026-10-03" → "October 3, 2026". Documents always show the full date. */
function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)))
}

/**
 * The invoice as a printable sheet. Always light, whatever the app theme:
 * this is the thing that becomes a PDF via the browser's print dialog.
 */
export function InvoiceDocument({ invoice, business }: { invoice: InvoiceDocData; business: BusinessBlock }) {
  const money = (minor: number) => formatMoney(minor, invoice.currency)
  const watermark = invoice.status === 'paid' ? 'Paid' : invoice.status === 'void' ? 'Void' : invoice.status === 'draft' ? 'Draft' : null

  return (
    <article className="invoice-sheet relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-lg bg-white px-5 py-7 text-[13px] leading-relaxed text-neutral-800 shadow-pop sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      {watermark && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span
            className={`-rotate-[24deg] rounded-xl border-[6px] px-8 py-2 text-[64px] font-black tracking-[0.2em] uppercase opacity-[0.13] sm:text-[96px] ${
              invoice.status === 'paid' ? 'border-emerald-700 text-emerald-700' : invoice.status === 'void' ? 'border-red-700 text-red-700' : 'border-neutral-500 text-neutral-500'
            }`}
          >
            {watermark}
          </span>
        </div>
      )}

      <header className="relative flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-neutral-950">{business.name || 'Your business'}</p>
          {business.address && <p className="mt-1 whitespace-pre-line text-neutral-600">{business.address}</p>}
          {business.email && <p className="text-neutral-600">{business.email}</p>}
          {business.taxId && <p className="text-neutral-600">Tax ID: {business.taxId}</p>}
        </div>
        <div className="sm:text-right">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Invoice</h1>
          <p className="mt-0.5 font-medium text-neutral-600 tnum">{invoice.number ?? 'Draft'}</p>
        </div>
      </header>

      <section className="relative mt-8 grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Bill to</h2>
          <p className="mt-1 whitespace-pre-line text-neutral-900">{invoice.billTo || <span className="text-neutral-400">No recipient</span>}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] content-start gap-x-6 gap-y-1">
          <dt className="text-neutral-500">Issued</dt>
          <dd className="text-right text-neutral-900 tnum">{longDate(invoice.issuedOn)}</dd>
          {invoice.dueOn && (
            <>
              <dt className="text-neutral-500">Due</dt>
              <dd className="text-right text-neutral-900 tnum">{longDate(invoice.dueOn)}</dd>
            </>
          )}
          {invoice.status === 'paid' && invoice.paidOn && (
            <>
              <dt className="text-neutral-500">Paid</dt>
              <dd className="text-right font-medium text-emerald-700 tnum">{longDate(invoice.paidOn)}</dd>
            </>
          )}
          <dt className="text-neutral-500">Amount due</dt>
          <dd className="text-right font-semibold text-neutral-950 tnum">{invoice.status === 'paid' || invoice.status === 'void' ? money(0) : money(invoice.totalMinor)}</dd>
        </dl>
      </section>

      <table className="relative mt-8 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-neutral-300 text-[11px] tracking-wider text-neutral-500 uppercase">
            <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
            <th scope="col" className="hidden py-2 pr-3 text-right font-semibold sm:table-cell print:table-cell">Qty</th>
            <th scope="col" className="hidden py-2 pr-3 text-right font-semibold sm:table-cell print:table-cell">Unit price</th>
            <th scope="col" className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-neutral-400">No line items</td>
            </tr>
          ) : (
            invoice.lines.map((l, i) => (
              <tr key={l.id ?? i} className="border-b border-neutral-200 align-top break-inside-avoid">
                <td className="py-2.5 pr-3 whitespace-pre-line text-neutral-900">
                  {l.description}
                  <span className="block text-[12px] text-neutral-500 sm:hidden print:hidden">
                    {formatQuantity(l.quantityMilli)} × {money(l.unitMinor)}
                  </span>
                </td>
                <td className="hidden py-2.5 pr-3 text-right tnum sm:table-cell print:table-cell">{formatQuantity(l.quantityMilli)}</td>
                <td className="hidden py-2.5 pr-3 text-right whitespace-nowrap tnum sm:table-cell print:table-cell">{money(l.unitMinor)}</td>
                <td className="py-2.5 text-right whitespace-nowrap text-neutral-900 tnum">{money(l.amountMinor)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <dl className="relative mt-4 ml-auto grid w-full max-w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 break-inside-avoid">
        <dt className="text-neutral-500">Subtotal</dt>
        <dd className="text-right tnum">{money(invoice.subtotalMinor)}</dd>
        {invoice.taxRateBp > 0 && (
          <>
            <dt className="text-neutral-500">Tax ({formatPercentBp(invoice.taxRateBp)})</dt>
            <dd className="text-right tnum">{money(invoice.taxMinor)}</dd>
          </>
        )}
        <div className="col-span-2 mt-1 grid grid-cols-subgrid border-t border-neutral-300 pt-2">
          <dt className="text-[15px] font-semibold text-neutral-950">Total</dt>
          <dd className="text-right text-[15px] font-semibold whitespace-nowrap text-neutral-950 tnum">
            {money(invoice.totalMinor)} <span className="text-[12px] font-medium text-neutral-500">{invoice.currency}</span>
          </dd>
        </div>
      </dl>

      {invoice.notes && (
        <section className="relative mt-10 break-inside-avoid">
          <h2 className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Notes</h2>
          <p className="mt-1 whitespace-pre-line">{invoice.notes}</p>
        </section>
      )}
      {invoice.footer && <footer className="relative mt-10 border-t border-neutral-200 pt-4 text-[12px] whitespace-pre-line text-neutral-500">{invoice.footer}</footer>}
    </article>
  )
}

/** Opens the print dialog once the page has painted, when `?print=1` asked for it. */
export function useAutoPrint(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [enabled])
}
