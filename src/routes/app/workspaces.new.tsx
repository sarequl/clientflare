import { useEffect, useState, type FormEvent } from 'react'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { createWorkspace } from '#/features/workspaces/server'
import { errorMessage } from '#/lib/format'
import { AuthShell, textLink } from '#/components/AuthShell'
import { Button } from '#/components/Button'
import { CurrencySelect, Field, Input } from '#/components/Field'
import { Notice } from '#/components/Card'
import { TimezoneSelect } from '#/components/TimezoneSelect'

export const Route = createFileRoute('/app/workspaces/new')({
  head: () => ({ meta: [{ title: 'New workspace · Clientflare' }] }),
  component: NewWorkspacePage,
})

function NewWorkspacePage() {
  const navigate = useNavigate()
  const router = useRouter()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('UTC')
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setNameError('Give the workspace a name.')
      return
    }
    setNameError(null)
    setPending(true)
    try {
      await createWorkspace({ data: { name: name.trim(), baseCurrency: currency, timezone } })
      await router.invalidate()
      await navigate({ to: '/app/setup' })
    } catch (err) {
      setError(errorMessage(err, 'Could not create the workspace.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title="New workspace"
      description="A workspace holds one business: its clients, income and expenses. You can invite people later."
      footer={
        <Link to="/app" className={textLink}>
          Back to the app
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" htmlFor="ws-name" error={nameError}>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Studio" maxLength={80} aria-invalid={!!nameError} autoFocus />
        </Field>
        <Field label="Base currency" htmlFor="ws-currency" hint="Default for new income and expenses.">
          <CurrencySelect id="ws-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
        <Field label="Timezone" htmlFor="ws-tz">
          <TimezoneSelect id="ws-tz" value={timezone} onChange={setTimezone} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" pending={pending}>
          Create workspace
        </Button>
      </form>
    </AuthShell>
  )
}
