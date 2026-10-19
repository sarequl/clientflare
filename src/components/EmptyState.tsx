import type { ReactNode } from 'react'

export function EmptyState({ title, body, action, icon }: { title: ReactNode; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="mb-1 grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-fg-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
