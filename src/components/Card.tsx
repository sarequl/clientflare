import type { HTMLAttributes, ReactNode } from 'react'
import { IconX } from './icons'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-border bg-surface ${className}`} {...rest} />
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm leading-5 font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {/* Negative margin so a 32px button doesn't make a title-only header taller than the rest. */}
      {actions && <div className="-my-1.5 flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'danger' | 'warn'
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted border-border',
  accent: 'bg-accent-soft text-accent-soft-fg border-transparent',
  danger: 'bg-danger-soft text-danger-soft-fg border-transparent',
  warn: 'bg-warn-soft text-warn-soft-fg border-transparent',
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[12px] font-medium whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'neutral', children, onDismiss }: { tone?: Tone; children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${tones[tone]}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="-my-0.5 grid size-5 shrink-0 place-items-center rounded opacity-75 hover:opacity-100" aria-label="Dismiss">
          <IconX size={14} />
        </button>
      )}
    </div>
  )
}
