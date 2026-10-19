import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { magicLink, organization } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { linkMail, sendMail } from '#/lib/email'
import { hashPassword, verifyPassword } from '#/lib/password'

function createAuth() {
  const db = getDb()
  return betterAuth({
    appName: 'Clientflare',
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    advanced: {
      database: { generateId: () => newId() },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    databaseHooks: {
      session: {
        create: {
          // Land the user in their first workspace instead of a "pick one" screen.
          before: async (session) => {
            const first = await db.query.member.findFirst({
              where: (m, { eq }) => eq(m.userId, session.userId),
              orderBy: (m, { asc }) => asc(m.createdAt),
            })
            return { data: { ...session, activeOrganizationId: first?.organizationId ?? null } }
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          await sendMail(
            linkMail({
              to: email,
              subject: 'Your sign-in link',
              heading: 'Sign in to Clientflare',
              body: 'This link works once and expires in 15 minutes.',
              cta: 'Sign in',
              url,
            }),
          )
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 20,
        creatorRole: 'owner',
        invitationExpiresIn: 60 * 60 * 24 * 7,
        sendInvitationEmail: async (data) => {
          const url = `${env.APP_URL}/invite/${data.id}`
          await sendMail(
            linkMail({
              to: data.email,
              subject: `${data.inviter.user.name} invited you to ${data.organization.name}`,
              heading: `Join ${data.organization.name}`,
              body: `${data.inviter.user.name} (${data.inviter.user.email}) invited you as ${data.role}.`,
              cta: 'Accept invitation',
              url,
            }),
          )
        },
      }),
      tanstackStartCookies(), // must stay last
    ],
  })
}

let cached: ReturnType<typeof createAuth> | undefined
export function getAuth() {
  cached ??= createAuth()
  return cached
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth['$Infer']['Session']
