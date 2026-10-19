export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <path d="M43 22.5a14 14 0 1 0 0 19" fill="none" stroke="var(--accent-fg)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="46" cy="32" r="4" fill="var(--accent-fg)" />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <LogoMark size={22} />
      Clientflare
    </span>
  )
}
