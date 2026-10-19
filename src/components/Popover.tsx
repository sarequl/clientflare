import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { IconDots } from './icons'

/** Close on outside pointer-down and Escape (Escape returns focus to the trigger). */
export function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, trigger?: RefObject<HTMLElement | null>) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        trigger?.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, root, trigger])
}

export const popoverPanel = 'absolute top-full z-30 mt-1 rounded-md border border-border bg-surface p-1 shadow-pop anim-fade'

const itemClass =
  'flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none'

export type MenuItem =
  | { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }
  | { label: string; icon?: ReactNode; link: LinkProps }

/** Icon-button overflow menu with arrow-key navigation. */
export function OverflowMenu({ items, label = 'More actions', align = 'right' }: { items: MenuItem[]; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useDismiss(open, () => setOpen(false), root, trigger)

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [open])

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const list = Array.from(root.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])
    const i = list.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    list[next]?.focus()
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-md border border-border-strong bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <IconDots />
      </button>
      {open && (
        <div role="menu" aria-label={label} onKeyDown={onKey} className={`${popoverPanel} w-48 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {items.map((item) =>
            'link' in item ? (
              <Link key={item.label} {...item.link} role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
                <span className="text-fg-muted">{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={`${itemClass} disabled:opacity-50`}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                <span className="text-fg-muted">{item.icon}</span>
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
