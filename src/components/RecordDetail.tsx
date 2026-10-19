import { Fragment, type ReactNode } from 'react'

/**
 * Text with soft break points after "@", ".", "-" and "/" so long emails and
 * URLs wrap at a boundary instead of mid-word. The full value is in the title.
 */
export function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=[.\-/_])|(?=@)/)
  return (
    <span title={text}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </span>
  )
}

/** Title block for contact and company pages. */
export function RecordHeader({
  title,
  subtitle,
  meta,
  tags,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  tags?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
        {meta && <p className="mt-0.5 text-[13px] text-fg-subtle">{meta}</p>}
        {tags && <div className="mt-2 flex flex-wrap items-center gap-1">{tags}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Label/value list; empty values render a muted dash. */
export function DetailList({ items }: { items: { label: ReactNode; value: ReactNode; wide?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-4 text-sm">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className={`text-fg-muted ${item.wide ? 'col-span-2' : ''}`}>{item.label}</dt>
          <dd className={`min-w-0 break-words ${item.wide ? 'col-span-2 -mt-1.5' : ''}`}>{item.value || item.value === 0 ? item.value : <span className="text-fg-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
