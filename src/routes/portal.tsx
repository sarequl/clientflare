import { Outlet, createFileRoute } from '@tanstack/react-router'
import { getPortalData } from '#/features/portal/server'
import { IconLogout } from '#/components/icons'

/** Client portal shell. No app chrome: a slim header with the business name and sign-out. */
export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const portal = await getPortalData()
    return { portal }
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: PortalShell,
})

function PortalShell() {
  const { portal } = Route.useRouteContext()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        {/* Signed out there's no business to name yet, so the label centres over the sign-in card. */}
        <div className={`mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 ${portal ? 'justify-between' : 'justify-center'}`}>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{portal?.business.name || 'Client portal'}</p>
            {portal && <p className="truncate text-[12px] text-fg-muted">Client portal</p>}
          </div>
          {portal && (
            <form method="post" action="/api/portal/logout">
              <button
                type="submit"
                className="-mr-2.5 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <IconLogout size={15} /> Sign out
              </button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
