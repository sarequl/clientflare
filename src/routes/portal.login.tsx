import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { requestPortalLink } from '#/features/portal/server'
import { errorMessage } from '#/lib/format'
import { Button } from '#/components/Button'
import { Field, Input } from '#/components/Field'
import { Notice } from '#/components/Card'
import { IconMail } from '#/components/icons'

export const Route = createFileRoute('/portal/login')({
  validateSearch: (search: Record<string, unknown>) => z.object({ error: z.enum(['expired']).optional().catch(undefined) }).parse(search),
  beforeLoad: ({ context }) => {
    if (context.portal) throw redirect({ to: '/portal' })
  },
  head: () => ({ meta: [{ title: 'Sign in · Client portal' }] }),
  component: PortalLogin,
})

function PortalLogin() {
  const { error: linkError } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address your invite was sent to.')
      return
    }
    setPending(true)
    try {
      await requestPortalLink({ data: { email: email.trim() } })
      setSentTo(email.trim())
    } catch (err) {
      setError(errorMessage(err, 'Could not send the link. Try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-[6vh]">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-pop sm:p-6">
        {sentTo ? (
          <>
            <div className="mb-3 grid size-10 place-items-center rounded-full bg-accent-soft text-accent-soft-fg">
              <IconMail size={18} />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
            <p className="mt-1 text-sm text-fg-muted">
              If {sentTo} has portal access, a sign-in link is on its way. It works once and expires in 15 minutes.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={() => send()} pending={pending} icon={<IconMail />}>
                Send it again
              </Button>
              <Button variant="ghost" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight">Sign in to your portal</h1>
            <p className="mt-1 text-sm text-fg-muted">See your invoices and shared files. We email you a one-time link, no password needed.</p>
            {linkError === 'expired' && (
              <div className="mt-4">
                <Notice tone="warn">That link has expired or was already used. Request a new one below.</Notice>
              </div>
            )}
            <form onSubmit={send} className="mt-5 flex flex-col gap-4" noValidate>
              <Field label="Email" htmlFor="portal-email" error={error}>
                <Input
                  id="portal-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  autoFocus
                />
              </Field>
              <Button type="submit" variant="primary" size="lg" pending={pending}>
                Email me a sign-in link
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
