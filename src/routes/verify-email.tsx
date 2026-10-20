import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { getVerificationState, resendVerificationEmail } from '#/features/instance/server'
import { signOut } from '#/lib/auth-client'
import { errorMessage, redirectSearchSchema, safeRedirect } from '#/lib/format'
import { AuthShell } from '#/components/AuthShell'
import { Button } from '#/components/Button'
import { Notice } from '#/components/Card'

export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>) => redirectSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    const target = safeRedirect(search.redirect) ?? '/app'
    const res = await getVerificationState()
    if (res.state === 'signed-out') throw redirect({ to: '/login', search: { redirect: target } })
    if (res.state === 'verified') throw redirect({ href: target })
    return { email: res.email }
  },
  head: () => ({ meta: [{ title: 'Verify your email · Clientflare' }] }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { email } = Route.useRouteContext()
  const { redirect: rawRedirect } = Route.useSearch()
  const target = safeRedirect(rawRedirect) ?? '/app'
  const navigate = useNavigate()
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The link is usually opened in another tab; poll so this one moves on by itself.
  useEffect(() => {
    const id = setInterval(async () => {
      const res = await getVerificationState().catch(() => null)
      if (res?.state === 'verified') await navigate({ href: target, replace: true })
    }, 5000)
    return () => clearInterval(id)
  }, [navigate, target])

  async function resend() {
    setError(null)
    setPending(true)
    try {
      await resendVerificationEmail()
      setSent(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not send the email.'))
    } finally {
      setPending(false)
    }
  }

  async function leave() {
    await signOut()
    await navigate({ to: '/login', replace: true })
  }

  return (
    <AuthShell
      title="Verify your email"
      description={`We sent a link to ${email}. Click it to open Clientflare. This page refreshes itself once you have.`}
      footer={
        <button type="button" onClick={leave} className="text-fg-muted underline-offset-2 hover:underline">
          Use a different account
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {sent && <Notice tone="accent">Sent again. Check spam if it is not there in a minute.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="button" variant="secondary" pending={pending} onClick={resend}>
          Send the link again
        </Button>
      </div>
    </AuthShell>
  )
}
