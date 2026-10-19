import { Badge } from './Card'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

/** Status pill. An overdue sent invoice reads "Overdue" in red. */
export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (status === 'sent' && overdue) return <Badge tone="danger">Overdue</Badge>
  if (status === 'paid') return <Badge tone="accent">Paid</Badge>
  if (status === 'sent') return <Badge tone="warn">Sent</Badge>
  if (status === 'void') return <Badge className="line-through">Void</Badge>
  return <Badge>Draft</Badge>
}

/** Thousandths → "1.5" for display and input prefill. */
export function formatQuantity(milli: number): string {
  return String(milli / 1000)
}

/** "1.5" → 1500. Up to three decimals, never negative. Returns null when invalid. */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null
  const milli = Math.round(Number(s) * 1000)
  return Number.isSafeInteger(milli) ? milli : null
}

/** "10" / "12.5" / "0" → basis points. Returns null outside 0–100. */
export function parseTaxPercent(input: string): number | null {
  const s = input.trim().replace(/%$/, '')
  if (s === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const bp = Math.round(Number(s) * 100)
  return bp <= 10_000 ? bp : null
}
