import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { COMMON_CURRENCIES } from '#/lib/format'

const control =
  'w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-fg placeholder:text-fg-subtle ' +
  'transition-colors hover:border-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:border-accent ' +
  'disabled:bg-surface-2 disabled:text-fg-muted disabled:hover:border-border-strong aria-invalid:border-danger'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${control} h-9 ${className}`} {...rest} />
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${control} min-h-[72px] py-2 ${className}`} {...rest} />
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select className={`${control} h-9 appearance-none pr-8 ${className}`} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M7 10l5 5 5-5" />
      </svg>
    </div>
  )
}

export function CurrencySelect({ value, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { value: string }) {
  const list: string[] = [...COMMON_CURRENCIES]
  if (value && !list.includes(value)) list.unshift(value)
  return (
    <Select value={value} {...rest}>
      {list.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  )
}

export function Checkbox({ label, hint, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" {...rest} />
      <label htmlFor={id} className="flex flex-col text-sm leading-snug">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-[13px] text-fg-muted">{hint}</span>}
      </label>
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  id: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors disabled:opacity-50 ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </button>
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  )
}
