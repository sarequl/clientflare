import { env } from 'cloudflare:workers'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { magicLink, organization } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { getDb, schema } from '#/db'
import { newId } from '#/lib/ids'
import { linkMail, sendMail } from '#/lib/email'
import { hashPassword, verifyPassword } from '#/lib/password'
import { appOrigin } from '#/lib/origin'
import { canCreateWorkspace, canSignUp, readInstanceSettings } from '#/lib/instance'

function createAuth() {
  const db = getDb()
  return betterAuth({
    appName: 'Clientflare',
    // Empty APP_URL: derive the base URL from each request. Cloudflare only routes
    // this Worker's own hostnames here, so trusting the request host is safe.
    baseURL: env.APP_URL || { allowedHosts: ['*'] },
    secret: env.BETTER_AUTH_SECRET,
    // Trust the origin the request came from (plus APP_URL when set).
    trustedOrigins: (request) => [request ? new URL(request.url).origin : null, env.APP_URL || null],
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    advanced: {
      database: { generateId: () => newId() },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    emailVerification: {
      // Always wired up; whether a mail actually goes out is an instance setting.
      // Enforcement lives in requireSession (src/lib/session.ts), which parks
      // unverified users at /verify-email while the setting is on.
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (!(await readInstanceSettings()).requireEmailVerification) return
        await sendMail(
          linkMail({
            to: user.email,
            subject: 'Verify your email',
            heading: 'Verify your email',
            body: 'Click the button to confirm this address and open Clientflare.',
            cta: 'Verify email',
            url,
          }),
        )
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    hooks: {
      // Invite-only signup (instance setting): password signup and magic links for
      // unknown emails are refused unless a pending invitation exists for that email.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email' && ctx.path !== '/sign-in/magic-link') return
        const email = String(ctx.body?.email ?? '').trim().toLowerCase()
        if (!email) return
        if (ctx.path === '/sign-in/magic-link') {
          const known = await db.query.user.findFirst({ where: (u, { eq }) => eq(u.email, email), columns: { id: true } })
          if (known) return
        }
        if (!(await canSignUp(email))) {
          throw new APIError('FORBIDDEN', { message: 'Signup is invite-only on this Clientflare. Ask a workspace admin for an invitation.' })
        }
      }),
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
        allowUserToCreateOrganization: (user) => canCreateWorkspace(user.id),
        organizationLimit: 20,
        creatorRole: 'owner',
        invitationExpiresIn: 60 * 60 * 24 * 7,
        // Better Auth turns this on whenever generateId is customised, assuming the
        // ids might be guessable. Ours carry 74 random bits and accepting already
        // requires the signed-in email to match, and we send no verification mail.
        requireEmailVerificationOnInvitation: false,
        sendInvitationEmail: async (data) => {
          const url = `${appOrigin()}/invite/${data.id}`
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
