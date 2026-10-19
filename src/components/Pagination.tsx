import { IconChevronLeft, IconChevronRight } from './icons'

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const btn =
    'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40'
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
      <p className="text-[13px] text-fg-muted tnum" aria-live="polite">
        {from}–{to} of {total}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <IconChevronLeft size={14} />
            <span className="hidden sm:inline">Prev</span>
          </button>
          <span className="px-1 text-[13px] text-fg-muted tnum">
            {page} / {pages}
          </span>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <span className="hidden sm:inline">Next</span>
            <IconChevronRight size={14} />
          </button>
        </div>
      )}
    </nav>
  )
}
