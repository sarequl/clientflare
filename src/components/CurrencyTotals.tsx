import { Money } from './Money'

/** One summary line: totals of the given rows grouped by currency. */
export function CurrencyTotals({ label, rows }: { label: string; rows: { amountMinor: number; currency: string }[] }) {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amountMinor)
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-surface-2/60 px-4 py-2.5 text-sm">
      <span className="text-fg-muted">
        {label} · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
      </span>
      <span className="flex flex-wrap gap-x-3">
        {[...totals.entries()].map(([c, v]) => (
          <Money key={c} minor={v} currency={c} className="font-semibold" />
        ))}
      </span>
    </div>
  )
}
