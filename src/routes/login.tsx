import { useState, type FormEvent } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { signIn } from '#/lib/auth-client'
import { getSession } from '#/lib/session'
import { errorMessage, redirectSearchSchema, safeRedirect } from '#/lib/format'
import { AuthShell, textLink } from '#/components/AuthShell'
import { Button } from '#/components/Button'
import { Field, Input } from '#/components/Field'
import { Notice } from '#/components/Card'
import { IconMail } from '#/components/icons'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => redirectSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    const session = await getSession()
    if (session) throw redirect({ href: safeRedirect(search.redirect) ?? '/app' })
  },
  head: () => ({ meta: [{ title: 'Sign in · Clientflare' }] }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect: rawRedirect } = Route.useSearch()
  const target = safeRedirect(rawRedirect) ?? '/app'
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'password' | 'link' | null>(null)
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending('password')
    try {
      const res = await signIn.email({ email, password })
      if (res.error) {
        setError(res.error.status === 401 ? 'Wrong email or password.' : errorMessage(res.error))
        return
      }
      await navigate({ href: target, replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(null)
    }
  }

  async function sendLink() {
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter your email first, then ask for a link.')
      return
    }
    setPending('link')
    try {
      const res = await signIn.magicLink({ email, callbackURL: target })
      if (res.error) {
        setError(errorMessage(res.error))
        return
      }
      setLinkSentTo(email)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(null)
    }
  }

  const signupSearch = rawRedirect ? { redirect: target } : {}

  if (linkSentTo) {
    return (
      <AuthShell title="Check your inbox" description={`We sent a sign-in link to ${linkSentTo}. It works once and expires in 15 minutes.`}>
        <div className="flex flex-col gap-2">
          <Button onClick={sendLink} pending={pending === 'link'} icon={<IconMail />}>
            Send it again
          </Button>
          <Button variant="ghost" onClick={() => setLinkSentTo(null)}>
            Use a password instead
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" search={signupSearch} className={textLink}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" pending={pending === 'password'} disabled={pending === 'link'}>
          Sign in
        </Button>
        <div className="flex items-center gap-3 text-[12px] text-fg-subtle">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button onClick={sendLink} pending={pending === 'link'} disabled={pending === 'password'} icon={<IconMail />}>
          Email me a sign-in link
        </Button>
      </form>
    </AuthShell>
  )
}
