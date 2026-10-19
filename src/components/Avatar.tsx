export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const s = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2)
  return s.toUpperCase()
}

/** Initials bubble with the full name as tooltip and accessible label. */
export function Avatar({ name, size = 'sm', className = '' }: { name: string | null | undefined; size?: 'xs' | 'sm'; className?: string }) {
  return (
    <span
      role="img"
      aria-label={name ?? 'Unassigned'}
      title={name ?? 'Unassigned'}
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold select-none ${
        name ? 'bg-accent-soft text-accent-soft-fg' : 'border border-dashed border-border-strong text-fg-subtle'
      } ${size === 'xs' ? 'size-5 text-[9px]' : 'size-6 text-[10px]'} ${className}`}
    >
      {initials(name)}
    </span>
  )
}
