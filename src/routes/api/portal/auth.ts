import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { PORTAL_COOKIE, redeemPortalLink } from '#/features/portal/server'

/** Magic-link landing: sets the portal cookie and redirects into /portal. */
export const Route = createFileRoute('/api/portal/auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const token = url.searchParams.get('token') ?? ''
        const result = token.length >= 32 ? await redeemPortalLink(token) : null
        if (!result) return Response.redirect(`${env.APP_URL}/portal/login?error=expired`, 302)
        const secure = env.APP_URL.startsWith('https://') ? '; Secure' : ''
        return new Response(null, {
          status: 302,
          headers: {
            location: `${env.APP_URL}/portal`,
            'set-cookie': `${PORTAL_COOKIE}=${result.sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${result.maxAge}${secure}`,
          },
        })
      },
    },
  },
})
