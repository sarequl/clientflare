import type { ReactNode } from 'react'
import { IconX } from './icons'

export type TagLike = { id: string; name: string; color: string }

const KNOWN = new Set(['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'])

/** `tag-<color>` class; unknown colours fall back to gray. Hues and theme lightness live in styles.css. */
export function tagColorClass(color: string) {
  return `tag-${KNOWN.has(color) ? color : 'gray'}`
}

export function TagDot({ color, className = '' }: { color: string; className?: string }) {
  return <span aria-hidden className={`tag-dot inline-block size-2 shrink-0 rounded-full ${tagColorClass(color)} ${className}`} />
}

export function TagChip({ tag, onRemove, children }: { tag: TagLike; onRemove?: () => void; children?: ReactNode }) {
  return (
    <span
      className={`tag-chip inline-flex max-w-full items-center gap-1 rounded px-1.5 py-px text-[12px] font-medium whitespace-nowrap ${tagColorClass(tag.color)}`}
    >
      <span className="truncate">{tag.name}</span>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag.name}`} className="-mr-0.5 rounded-sm opacity-70 hover:opacity-100">
          <IconX size={12} />
        </button>
      )}
    </span>
  )
}

export function TagList({ tags, max }: { tags: TagLike[]; max?: number }) {
  if (!tags.length) return null
  const shown = max ? tags.slice(0, max) : tags
  const rest = tags.length - shown.length
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {shown.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
      {rest > 0 && <span className="text-[12px] text-fg-subtle">+{rest}</span>}
    </span>
  )
}
