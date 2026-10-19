import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, Outlet, createFileRoute, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { getAppContext, switchWorkspace } from '#/features/workspaces/server'
import { signOut } from '#/lib/auth-client'
import { Logo } from '#/components/Logo'
import { ThemeToggle } from '#/components/ThemeToggle'
import { Spinner } from '#/components/Button'
import {
  IconArrowDown,
  IconArrowUp,
  IconBolt,
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconHome,
  IconLogout,
  IconMenu,
  IconPiggy,
  IconPlus,
  IconSearch,
  IconSend,
  IconSettings,
  IconUsers,
  IconX,
} from '#/components/icons'
import { IconBriefcase, IconCheckSquare, IconInvoice } from '#/components/icons-invoice'
import { CommandSearch, useCommandShortcut } from '#/components/CommandSearch'

export const Route = createFileRoute('/app/_ws')({
  beforeLoad: async () => {
    // Throws a redirect to /app/workspaces/new when there is no active workspace.
    const app = await getAppContext()
    return { app }
  },
  component: WorkspaceShell,
})

type AppCtx = Awaited<ReturnType<typeof getAppContext>>

type NavItem = { to: string; label: string; Icon: ComponentType<{ size?: number }>; exact?: boolean }

const NAV: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/app', label: 'Dashboard', Icon: IconHome, exact: true },
      { to: '/app/contacts', label: 'Contacts', Icon: IconUsers },
      { to: '/app/companies', label: 'Companies', Icon: IconBuilding },
      { to: '/app/deals', label: 'Deals', Icon: IconBriefcase },
      { to: '/app/tasks', label: 'Tasks', Icon: IconCheckSquare },
      { to: '/app/invoices', label: 'Invoices', Icon: IconInvoice },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/app/finance/incomes', label: 'Incomes', Icon: IconArrowDown },
      { to: '/app/finance/expenses', label: 'Expenses', Icon: IconArrowUp },
      { to: '/app/finance/set-asides', label: 'Set-asides', Icon: IconPiggy },
      { to: '/app/finance/payouts', label: 'Payouts', Icon: IconSend },
    ],
  },
  { items: [{ to: '/app/settings', label: 'Settings', Icon: IconSettings }] },
]

function WorkspaceShell() {
  const { app } = Route.useRouteContext()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useCommandShortcut(() => setSearchOpen(true))

  useEffect(() => setDrawerOpen(false), [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [drawerOpen])

  // Print views (e.g. /app/invoices/:id/print) render without any app chrome.
  if (pathname.endsWith('/print')) return <Outlet />

  const openSearch = () => {
    setDrawerOpen(false)
    setSearchOpen(true)
  }

  return (
    <div className="min-h-dvh lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <SidebarContent app={app} onSearch={openSearch} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="-ml-2 grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <IconMenu size={20} />
        </button>
        <span className="min-w-0 truncate text-sm font-semibold">{app.workspace.name}</span>
        <div className="-mr-2 flex items-center">
          <button type="button" onClick={openSearch} aria-label="Search" className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg">
            <IconSearch size={19} />
          </button>
          <Link to="/app/quick" aria-label="Quick add" className="grid size-9 place-items-center rounded-md text-accent hover:bg-surface-2">
            <IconPlus size={20} />
          </Link>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-overlay anim-fade" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border bg-surface shadow-pop anim-slide">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-2"
            >
              <IconX />
            </button>
            <SidebarContent app={app} autoFocus onSearch={openSearch} />
          </aside>
        </div>
      )}

      {/* Query container: full-bleed pieces (the deals board) size themselves against the content area with cqw. */}
      <div className="@container">
        <main id="main" className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>

      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

function SidebarContent({ app, autoFocus, onSearch }: { app: AppCtx; autoFocus?: boolean; onSearch: () => void }) {
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function onSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      await navigate({ to: '/login' })
    }
  }

  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link to="/app" className="rounded-md">
          <Logo />
        </Link>
      </div>
      <div className="px-3">
        <WorkspaceSwitcher app={app} autoFocus={autoFocus} />
        <button
          type="button"
          onClick={onSearch}
          className="mt-2 flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-sm text-fg-subtle hover:border-border-strong hover:text-fg-muted"
        >
          <IconSearch size={15} />
          <span className="flex-1">Search</span>
          <kbd className="rounded border border-border px-1 text-[11px] font-sans">⌘K</kbd>
        </button>
      </div>
      <nav aria-label="Main" className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {NAV.map((group, g) => (
          <div key={g} className={`flex flex-col gap-0.5 ${g > 0 ? 'mt-3' : ''}`}>
            {group.label && <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{group.label}</p>}
            {group.items.map(({ to, label, Icon, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: !!exact }}
                className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                activeProps={{ className: '!bg-surface-2 !text-fg font-medium', 'aria-current': 'page' }}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </div>
        ))}
        <Link
          to="/app/quick"
          className="mt-3 flex h-9 items-center gap-2.5 rounded-md border border-dashed border-border-strong px-2.5 text-sm text-fg-muted hover:border-accent hover:text-accent"
          activeProps={{ className: '!border-solid !border-transparent !bg-surface-2 !text-fg font-medium', 'aria-current': 'page' }}
        >
          <IconBolt size={16} />
          Quick add
        </Link>
      </nav>
      <div className="border-t border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] text-fg-subtle">Theme</span>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-soft-fg uppercase">
            {(app.user.name || app.user.email).slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{app.user.name}</p>
            <p className="truncate text-[12px] text-fg-muted">{app.user.email}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            {signingOut ? <Spinner /> : <IconLogout />}
          </button>
        </div>
      </div>
    </>
  )
}

function WorkspaceSwitcher({ app, autoFocus }: { app: AppCtx; autoFocus?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (autoFocus) trigger.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    root.current?.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  async function choose(id: string) {
    if (id === app.workspace.id) {
      setOpen(false)
      return
    }
    setError(null)
    setSwitching(id)
    try {
      await switchWorkspace({ data: { organizationId: id } })
      await router.invalidate()
      setOpen(false)
    } catch {
      setError('Could not switch workspace.')
    } finally {
      setSwitching(null)
    }
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
    next?.focus()
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-left hover:border-border-strong"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded bg-fg text-[11px] font-semibold text-bg uppercase">
          {app.workspace.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{app.workspace.name}</span>
          <span className="block text-[11px] text-fg-subtle capitalize">
            {app.role} · {app.workspace.baseCurrency}
          </span>
        </span>
        <IconChevronDown className="shrink-0 text-fg-subtle" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Workspaces"
          onKeyDown={onMenuKey}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-pop anim-fade"
        >
          {app.workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={w.id === app.workspace.id}
              onClick={() => choose(w.id)}
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {switching === w.id ? <Spinner /> : w.id === app.workspace.id ? <IconCheck className="text-accent" /> : null}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <Link
            to="/app/workspaces/new"
            role="menuitem"
            className="flex h-8 items-center gap-2 rounded px-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:bg-surface-2"
          >
            <IconPlus />
            New workspace
          </Link>
          {error && <p className="px-2 py-1 text-[12px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
