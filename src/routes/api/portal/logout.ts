import { createFileRoute } from '@tanstack/react-router'
import { appOrigin } from '#/lib/origin'
import { PORTAL_COOKIE, portalLogout } from '#/features/portal/server'

export const Route = createFileRoute('/api/portal/logout')({
  server: {
    handlers: {
      POST: async () => {
        await portalLogout()
        return new Response(null, { status: 302, headers: { location: `${appOrigin()}/portal/login`, 'set-cookie': `${PORTAL_COOKIE}=; Path=/; HttpOnly; Max-Age=0` } })
      },
    },
  },
})
