import { useEffect, useId, useRef, useState } from 'react'
import { searchCompanies } from '#/features/companies/server'
import { Spinner } from './Button'
import { IconBuilding, IconX } from './icons'
import { useDismiss } from './Popover'

export type CompanyRef = { id: string; name: string }

/** Async combobox over the workspace's companies. Pass `id` so a Field label points at the input. */
export function CompanyPicker({ id, value, onChange }: { id: string; value: CompanyRef | null; onChange: (c: CompanyRef | null) => void }) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<CompanyRef[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const seq = useRef(0)

  useEffect(() => setQuery(value?.name ?? ''), [value?.id, value?.name])

  const close = () => {
    setOpen(false)
    setQuery(value?.name ?? '')
  }
  useDismiss(open, close, root)

  useEffect(() => {
    if (!open) return
    const q = query === value?.name ? '' : query.trim()
    const n = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const rows = await searchCompanies({ data: { q } })
        if (n === seq.current) {
          setResults(rows)
          setActive(0)
        }
      } catch {
        if (n === seq.current) setResults([])
      } finally {
        if (n === seq.current) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [open, query, value?.name])

  function select(c: CompanyRef | null) {
    onChange(c)
    setQuery(c?.name ?? '')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      if (!results.length) return
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
    } else if (e.key === 'Enter') {
      if (!open) return
      e.preventDefault()
      const r = results[active]
      if (r) select(r)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const optionId = (i: number) => `${listId}-${i}`

  return (
    <div ref={root} className="relative min-w-0">
      <IconBuilding className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results.length ? optionId(active) : undefined}
        autoComplete="off"
        placeholder="Search companies"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface pr-8 pl-8 text-fg placeholder:text-fg-subtle transition-colors hover:border-fg-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear company"
          onClick={() => {
            select(null)
            input.current?.focus()
          }}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
        >
          <IconX size={14} />
        </button>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Companies"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-pop"
        >
          {loading && results.length === 0 ? (
            <li className="flex items-center gap-2 px-2 py-2 text-[13px] text-fg-muted">
              <Spinner /> Searching
            </li>
          ) : results.length === 0 ? (
            <li className="px-2 py-2 text-[13px] text-fg-subtle">No companies match. Create it from Companies first.</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={value?.id === c.id}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(c)}
                className={`flex h-8 cursor-pointer items-center rounded px-2 text-sm ${i === active ? 'bg-surface-2' : ''} ${
                  value?.id === c.id ? 'font-medium' : ''
                }`}
              >
                <span className="truncate">{c.name}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
