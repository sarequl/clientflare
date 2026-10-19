import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { getSession } from '#/lib/session'

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ location }) => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } })
    return { user: { id: session.user.id, name: session.user.name, email: session.user.email } }
  },
  component: Outlet,
})
