import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { PORTAL_COOKIE, portalLogout } from '#/features/portal/server'

export const Route = createFileRoute('/api/portal/logout')({
  server: {
    handlers: {
      POST: async () => {
        await portalLogout()
        return new Response(null, { status: 302, headers: { location: `${env.APP_URL}/portal/login`, 'set-cookie': `${PORTAL_COOKIE}=; Path=/; HttpOnly; Max-Age=0` } })
      },
    },
  },
})
