import { useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { getSession } from '#/lib/session'
import { acceptInvitation, getInvitation } from '#/features/workspaces/server'
import { getVerificationState } from '#/features/instance/server'
import { errorMessage } from '#/lib/format'
import { AuthShell, textLink } from '#/components/AuthShell'
import { Button, buttonClass } from '#/components/Button'
import { Badge, Notice } from '#/components/Card'
import { signOut } from '#/lib/auth-client'

export const Route = createFileRoute('/invite/$invitationId')({
  loader: async ({ params }) => {
    const [invitation, session, verification] = await Promise.all([
      getInvitation({ data: { invitationId: params.invitationId } }),
      getSession(),
      getVerificationState(),
    ])
    // Accepting needs a verified email when the instance requires one; park them first and come back.
    if (verification.state === 'pending') throw redirect({ to: '/verify-email', search: { redirect: `/invite/${params.invitationId}` } })
    return { invitation, user: session ? { email: session.user.email, name: session.user.name } : null }
  },
  head: () => ({ meta: [{ title: 'Invitation · Clientflare' }] }),
  component: InvitePage,
})

function InvitePage() {
  const { invitation, user } = Route.useLoaderData()
  const { invitationId } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const here = `/invite/${invitationId}`

  if (!invitation) {
    return (
      <AuthShell title="Invitation not found" description="This link is wrong or the invitation was removed. Ask the person who invited you for a new one.">
        <Link to="/" className={buttonClass('secondary', 'md', 'w-full')}>
          Go to Clientflare
        </Link>
      </AuthShell>
    )
  }

  const unusable =
    invitation.status === 'accepted'
      ? { title: 'Already accepted', body: `This invitation to ${invitation.workspaceName} has already been used.` }
      : invitation.status === 'canceled' || invitation.status === 'rejected'
        ? { title: 'Invitation withdrawn', body: `This invitation to ${invitation.workspaceName} is no longer valid.` }
        : invitation.expired
          ? { title: 'Invitation expired', body: `Ask ${invitation.inviterName} to send you a fresh invite to ${invitation.workspaceName}.` }
          : null

  if (unusable) {
    return (
      <AuthShell title={unusable.title} description={unusable.body}>
        <Link to={user ? '/app' : '/login'} className={buttonClass('secondary', 'md', 'w-full')}>
          {user ? 'Open Clientflare' : 'Sign in'}
        </Link>
      </AuthShell>
    )
  }

  const emailMismatch = user && user.email.toLowerCase() !== invitation.email.toLowerCase()

  async function accept() {
    setError(null)
    setPending(true)
    try {
      await acceptInvitation({ data: { invitationId } })
      await router.invalidate()
      await navigate({ to: '/app' })
    } catch (err) {
      setError(errorMessage(err, 'Could not accept the invitation.'))
    } finally {
      setPending(false)
    }
  }

  async function switchAccount() {
    await signOut()
    await navigate({ to: '/login', search: { redirect: here } })
  }

  return (
    <AuthShell title={`Join ${invitation.workspaceName}`} description={`${invitation.inviterName} invited ${invitation.email} to this workspace.`}>
      <div className="mb-5 flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
        <span className="text-fg-muted">Role</span>
        <Badge tone="accent" className="capitalize">
          {invitation.role}
        </Badge>
      </div>

      {!user ? (
        <div className="flex flex-col gap-2">
          <Link to="/login" search={{ redirect: here }} className={buttonClass('primary', 'md', 'w-full')}>
            Sign in to accept
          </Link>
          <Link to="/signup" search={{ redirect: here }} className={buttonClass('secondary', 'md', 'w-full')}>
            Create an account
          </Link>
          <p className="mt-2 text-center text-[13px] text-fg-muted">Use {invitation.email} so the invite matches.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {emailMismatch && (
            <Notice tone="warn">
              You're signed in as {user.email}, but this invite is for {invitation.email}.{' '}
              <button type="button" onClick={switchAccount} className={textLink}>
                Switch account
              </button>
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button variant="primary" onClick={accept} pending={pending}>
            Accept invitation
          </Button>
          <Link to="/app" className={buttonClass('ghost', 'md', 'w-full')}>
            Not now
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
