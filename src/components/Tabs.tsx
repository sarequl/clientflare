import { forwardRef, useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { createLink } from '@tanstack/react-router'

/**
 * Underlined tab strip. Scrolls sideways on narrow screens with the scrollbar
 * hidden, wraps onto a second row from sm up; the border sits on the container
 * and the underline on each link, so nothing overflows vertically.
 */
export function Tabs({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  // Which edges have tabs scrolled out of view; those edges fade out as a hint.
  const [more, setMore] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.querySelector<HTMLElement>('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const update = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  const fade = more.left && more.right ? 'tabs-fade-both' : more.right ? 'tabs-fade-right' : more.left ? 'tabs-fade-left' : ''

  return (
    <nav
      ref={ref}
      aria-label={label}
      className={`-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden ${fade} ${className}`}
    >
      {children}
    </nav>
  )
}

/**
 * Renders the label twice in one grid cell, the bold copy invisible, so the
 * tab keeps the same width whether or not it is selected.
 */
export function StableLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-grid">
      <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">
        {children}
      </span>
      <span className="col-start-1 row-start-1">{children}</span>
    </span>
  )
}

type TabAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { active?: boolean }

const TabAnchor = forwardRef<HTMLAnchorElement, TabAnchorProps>(function TabAnchor({ active, className = '', children, ...rest }, ref) {
  return (
    <a
      ref={ref}
      aria-current={active ? 'page' : undefined}
      className={`relative flex shrink-0 items-center px-3 pt-2 pb-2.5 text-sm whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full ${
        active ? 'font-medium text-fg after:bg-accent' : 'text-fg-muted after:bg-transparent hover:text-fg'
      } ${className}`}
      {...rest}
    >
      <StableLabel>{children}</StableLabel>
    </a>
  )
})

/** A router Link styled as a tab. Pass `active` yourself; search-param tabs don't match by path. */
export const TabLink = createLink(TabAnchor)
