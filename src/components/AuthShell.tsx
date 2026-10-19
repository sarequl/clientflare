import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Logo } from './Logo'

export function AuthShell({ title, description, children, footer }: { title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[12vh] pb-10">
      <Link to="/" className="mb-8 rounded-md">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-pop sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-fg-muted">{footer}</div>}
    </main>
  )
}

export const textLink = 'font-medium text-accent hover:underline underline-offset-2 rounded-sm'
