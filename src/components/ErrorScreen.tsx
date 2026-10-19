import type { ReactNode } from 'react'
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Card } from './Card'
import { Button, buttonClass } from './Button'
import { Logo } from './Logo'

/** Centred message card used for errors and not-found pages. `standalone` adds the logo for pages with no app chrome. */
export function StatusScreen({
  title,
  body,
  actions,
  children,
  standalone,
  logoLinks = true,
}: {
  title: ReactNode
  body?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  standalone?: boolean
  /** Public pages for clients keep the logo but don't link into the app. */
  logoLinks?: boolean
}) {
  return (
    <main className={`flex flex-col items-center px-4 ${standalone ? 'min-h-dvh pt-[12vh] pb-10' : 'py-[10vh]'}`}>
      {standalone &&
        (logoLinks ? (
          <a href="/" className="mb-8 rounded-md">
            <Logo />
          </a>
        ) : (
          <span className="mb-8">
            <Logo />
          </span>
        ))}
      <Card className="w-full max-w-md p-5 shadow-pop sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {body && <p className="mt-1 text-sm text-fg-muted">{body}</p>}
        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        {children}
      </Card>
    </main>
  )
}

function ErrorView({ error, standalone }: { error: unknown; standalone: boolean }) {
  const router = useRouter()
  const detail = error instanceof Error ? `${error.message}${error.stack ? `\n\n${error.stack}` : ''}` : String(error)
  return (
    <StatusScreen
      standalone={standalone}
      title="Something went wrong"
      body="This page could not load. It may be a hiccup on our side; trying again usually sorts it."
      actions={
        <>
          <Button variant="primary" onClick={() => void router.invalidate()}>
            Try again
          </Button>
          <a href="/app" className={buttonClass('secondary')}>
            Go to dashboard
          </a>
        </>
      }
    >
      {/* Raw errors can carry SQL and parameters, so they only ever show in dev. */}
      {import.meta.env.DEV && (
        <details className="mt-5 rounded-md border border-border bg-surface-2 text-[12px]">
          <summary className="cursor-pointer px-3 py-2 font-medium text-fg-muted select-none">Error details (dev only)</summary>
          <pre className="max-h-72 overflow-auto border-t border-border px-3 py-2 font-mono break-words whitespace-pre-wrap text-fg-muted">{detail}</pre>
        </details>
      )}
    </StatusScreen>
  )
}

/** Router-wide default: renders inside whatever layout is above the failing route. */
export function RouteError({ error }: ErrorComponentProps) {
  return <ErrorView error={error} standalone={false} />
}

/** Root-level: nothing above it, so it brings its own logo. */
export function RootError({ error }: ErrorComponentProps) {
  return <ErrorView error={error} standalone />
}

export function NotFoundScreen({ standalone = true }: { standalone?: boolean }) {
  return (
    <StatusScreen
      standalone={standalone}
      title="Page not found"
      body="The link may be old, or the page was moved or deleted."
      actions={
        // "/" sends signed-in people to the dashboard and everyone else to sign in.
        <Link to="/" className={buttonClass('primary')}>
          Go to dashboard
        </Link>
      }
    />
  )
}
