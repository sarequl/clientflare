// Used only by `pnpm auth:generate` to let the Better Auth CLI see our plugin set.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { magicLink, organization } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/d1'

export const auth = betterAuth({
  database: drizzleAdapter(drizzle({} as never), { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [magicLink({ sendMagicLink: async () => {} }), organization()],
})
