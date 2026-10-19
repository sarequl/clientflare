import { Fragment } from 'react'
import { IconCheck } from '#/components/icons'

/**
 * Numbered progress indicator for multi-step flows. Steps before `current` show a check
 * and, when `onSelect` is given, are clickable so people can jump back.
 */
export function Stepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (index: number) => void }) {
  return (
    <ol aria-label="Progress" className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        const dot = (
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold tnum transition-colors ${
              done ? 'bg-accent text-accent-fg' : active ? 'bg-accent-soft text-accent-soft-fg ring-2 ring-accent' : 'bg-surface-2 text-fg-subtle'
            }`}
          >
            {done ? <IconCheck size={14} /> : i + 1}
          </span>
        )
        const text = (
          <span className={`truncate text-sm ${active ? 'font-medium text-fg' : 'hidden text-fg-muted sm:inline'}`}>
            {label}
          </span>
        )
        return (
          <Fragment key={label}>
            {i > 0 && <li aria-hidden className={`h-px min-w-3 flex-1 ${i <= current ? 'bg-accent' : 'bg-border'}`} />}
            <li aria-current={active ? 'step' : undefined} className="flex min-w-0 items-center gap-2">
              {done && onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className="flex min-w-0 items-center gap-2 rounded-md hover:[&>span:last-child]:text-fg"
                  aria-label={`Back to step ${i + 1}: ${label}`}
                >
                  {dot}
                  {text}
                </button>
              ) : (
                <>
                  {dot}
                  {text}
                  <span className="sr-only">{done ? '(done)' : active ? '(current)' : ''}</span>
                </>
              )}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
