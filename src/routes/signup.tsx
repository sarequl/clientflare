import { useState, type FormEvent } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { signUp } from '#/lib/auth-client'
import { getSession } from '#/lib/session'
import { getSignupPolicy } from '#/features/instance/server'
import { errorMessage, redirectSearchSchema, safeRedirect } from '#/lib/format'
import { AuthShell, textLink } from '#/components/AuthShell'
import { Button } from '#/components/Button'
import { Field, Input } from '#/components/Field'
import { Notice } from '#/components/Card'

const MIN_PASSWORD = 10

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>) => redirectSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    const session = await getSession()
    if (session) throw redirect({ href: safeRedirect(search.redirect) ?? '/app' })
  },
  loader: () => getSignupPolicy(),
  head: () => ({ meta: [{ title: 'Create account · Clientflare' }] }),
  component: SignupPage,
})

function SignupPage() {
  const { redirect: rawRedirect } = Route.useSearch()
  const { openSignup } = Route.useLoaderData()
  const target = safeRedirect(rawRedirect) ?? '/app'
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Tell us what to call you.'
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Enter a valid email.'
    if (password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    try {
      const res = await signUp.email({ name: name.trim(), email, password })
      if (res.error) {
        setErrors({ form: errorMessage(res.error) })
        return
      }
      await navigate({ href: target, replace: true })
    } catch (err) {
      setErrors({ form: errorMessage(err) })
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="You'll set up your first workspace next."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" search={rawRedirect ? { redirect: target } : {}} className={textLink}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {!openSignup && (
          <Notice tone="warn">Signup is invite-only here. Use the email address your invitation was sent to.</Notice>
        )}
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} autoFocus />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Field label="Password" htmlFor="password" hint={`At least ${MIN_PASSWORD} characters.`} error={errors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : 'password-hint'}
          />
        </Field>
        {errors.form && <Notice tone="danger">{errors.form}</Notice>}
        <Button type="submit" variant="primary" pending={pending}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
