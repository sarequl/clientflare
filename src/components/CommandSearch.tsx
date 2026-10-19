import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { globalSearch } from '#/features/search/server'
import { formatMoney } from '#/lib/money'
import { Spinner } from './Button'
import { IconBuilding, IconSearch, IconUsers } from './icons'
import { IconBriefcase, IconInvoice } from './icons-invoice'

type Results = Awaited<ReturnType<typeof globalSearch>>
type Item = { key: string; href: string; title: string; subtitle?: string | null; meta?: ReactNode }
type Group = { label: string; Icon: ComponentType<{ size?: number; className?: string }>; items: Item[] }

function toGroups(r: Results): Group[] {
  const groups: Group[] = [
    {
      label: 'Contacts',
      Icon: IconUsers,
      items: r.contacts.map((c) => ({
        key: `c-${c.id}`,
        href: `/app/contacts/${c.id}`,
        title: [c.firstName, c.lastName].filter(Boolean).join(' '),
        subtitle: [c.companyName, c.email].filter(Boolean).join(' · '),
      })),
    },
    { label: 'Companies', Icon: IconBuilding, items: r.companies.map((c) => ({ key: `co-${c.id}`, href: `/app/companies/${c.id}`, title: c.name, subtitle: c.domain })) },
    {
      label: 'Deals',
      Icon: IconBriefcase,
      items: r.deals.map((d) => ({ key: `d-${d.id}`, href: `/app/deals/${d.id}`, title: d.title, subtitle: d.status, meta: formatMoney(d.valueMinor, d.currency) })),
    },
    {
      label: 'Invoices',
      Icon: IconInvoice,
      items: r.invoices.map((i) => ({
        key: `i-${i.id}`,
        href: `/app/invoices/${i.id}`,
        title: i.number ?? 'Draft',
        subtitle: [i.billTo.split('\n')[0], i.status].filter(Boolean).join(' · '),
        meta: formatMoney(i.totalMinor, i.currency),
      })),
    },
  ]
  return groups.filter((g) => g.items.length)
}

/** ⌘K palette over contacts, companies, deals and invoices. */
export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const listId = useId()

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setQ('')
    setGroups([])
    setActive(0)
    const previous = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => input.current?.focus())
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const term = q.trim()
    const n = ++seq.current
    if (!term) {
      setGroups([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await globalSearch({ data: { q: term } })
        if (n !== seq.current) return
        setGroups(toGroups(r))
        setError(false)
        setActive(0)
      } catch {
        if (n === seq.current) setError(true)
      } finally {
        if (n === seq.current) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [q, open])

  const flat = groups.flatMap((g) => g.items)

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(item: Item | undefined) {
    if (!item) return
    onClose()
    void navigate({ href: item.href })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!flat.length) return
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[active])
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  if (!open || !mounted) return null

  let index = -1
  const optionId = (i: number) => `${listId}-${i}`

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-overlay anim-fade" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown} className="relative flex max-h-[80dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop anim-rise">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <IconSearch className="shrink-0 text-fg-subtle" />
          <input
            ref={input}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(active) : undefined}
            aria-label="Search contacts, companies, deals and invoices"
            placeholder="Search contacts, companies, deals, invoices"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-subtle focus-visible:outline-none"
          />
          {loading && <Spinner className="text-fg-subtle" />}
          <kbd className="hidden rounded border border-border px-1.5 py-px text-[11px] text-fg-subtle sm:inline">Esc</kbd>
        </div>
        <div ref={list} id={listId} role="listbox" aria-label="Results" className="overflow-y-auto p-1.5">
          {!q.trim() ? (
            <p className="px-2.5 py-6 text-center text-[13px] text-fg-subtle">Type a name, email, company, deal or invoice number.</p>
          ) : error ? (
            <p className="px-2.5 py-6 text-center text-[13px] text-danger">Search failed. Try again.</p>
          ) : !loading && groups.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-[13px] text-fg-subtle">No matches for “{q.trim()}”.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} role="group" aria-label={g.label} className="mb-1 last:mb-0">
                <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{g.label}</p>
                {g.items.map((item) => {
                  index++
                  const i = index
                  return (
                    <div
                      key={item.key}
                      id={optionId(i)}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(item)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 ${i === active ? 'bg-surface-2' : ''}`}
                    >
                      <g.Icon size={15} className="shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        {item.subtitle && <span className="block truncate text-[12px] text-fg-muted">{item.subtitle}</span>}
                      </span>
                      {item.meta && <span className="shrink-0 text-[12px] text-fg-muted tnum">{item.meta}</span>}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="hidden items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-fg-subtle sm:flex">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Global ⌘K / Ctrl+K shortcut. */
export function useCommandShortcut(onOpen: () => void) {
  const ref = useRef(onOpen)
  ref.current = onOpen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ref.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
