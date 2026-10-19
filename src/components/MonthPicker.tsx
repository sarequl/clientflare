import { currentMonth, monthLabel, shiftMonth } from '#/lib/format'
import { IconChevronLeft, IconChevronRight } from './icons'

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const isCurrent = month === currentMonth()
  const btn =
    'grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg'
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded-md border border-border-strong bg-surface">
        <button type="button" className={btn} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
          <IconChevronLeft />
        </button>
        <span className="w-[9.5rem] px-1 text-center whitespace-nowrap text-sm font-medium tnum" aria-live="polite">
          {monthLabel(month)}
        </span>
        <button type="button" className={btn} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
          <IconChevronRight />
        </button>
      </div>
      {!isCurrent && (
        <button type="button" onClick={() => onChange(currentMonth())} className="h-8 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
          Today
        </button>
      )}
    </div>
  )
}
