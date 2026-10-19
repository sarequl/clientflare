import type { CSSProperties } from 'react'
import { formatMoney } from '#/lib/money'
import { formatLongDay } from '#/lib/format'
import { textOnAccent } from '#/lib/invoice-templates'
import type { InvoiceDocData } from './types'

/** "2026-10-03" → "October 3, 2026". Documents always show the full date. */
export const longDate = formatLongDay

/**
 * The calendar day (YYYY-MM-DD) a sent invoice was last revised, or null for drafts and unrevised invoices.
 * Callers should pass revisedAt already reduced to the workspace-local day ("2026-10-20"); a raw
 * timestamp still works but falls back to its UTC day.
 */
export function revisedDay(invoice: Pick<InvoiceDocData, 'status' | 'revisedAt'>): string | null {
  if (!invoice.revisedAt || invoice.status === 'draft') return null
  const d = new Date(invoice.revisedAt)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export function moneyFor(invoice: InvoiceDocData) {
  return (minor: number) => formatMoney(minor, invoice.currency)
}

/** Nothing is owed on a paid or void invoice. */
export function amountDueMinor(invoice: InvoiceDocData) {
  return invoice.status === 'paid' || invoice.status === 'void' ? 0 : invoice.totalMinor
}

export function watermarkLabel(status: InvoiceDocData['status']) {
  return status === 'paid' ? 'Paid' : status === 'void' ? 'Void' : status === 'draft' ? 'Draft' : null
}

/** Inline CSS variables every template reads: the accent and a readable text colour on top of it. */
export function accentStyle(accent: string): CSSProperties {
  return { '--inv-accent': accent, '--inv-on-accent': textOnAccent(accent) } as CSSProperties
}

/** The rotated status stamp. `stamp` is the bordered box; `text` is just the word. */
export function Watermark({ status, variant = 'stamp', className = '' }: { status: InvoiceDocData['status']; variant?: 'stamp' | 'text'; className?: string }) {
  const label = watermarkLabel(status)
  if (!label) return null
  const tone = status === 'paid' ? 'border-emerald-700 text-emerald-700' : status === 'void' ? 'border-red-700 text-red-700' : 'border-neutral-500 text-neutral-500'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
      <span
        className={
          variant === 'stamp'
            ? `-rotate-[24deg] rounded-xl border-[6px] px-8 py-2 text-[64px] font-black tracking-[0.2em] uppercase opacity-[0.13] sm:text-[96px] ${tone} ${className}`
            : `-rotate-[24deg] text-[72px] font-extralight tracking-[0.4em] text-neutral-900 uppercase opacity-[0.07] sm:text-[120px] ${className}`
        }
      >
        {label}
      </span>
    </div>
  )
}
