import { createAuthClient } from 'better-auth/react'
import { magicLinkClient, organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), organizationClient()],
})

export const { useSession, signIn, signUp, signOut } = authClient
