import { useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { completeSetup, inviteMember } from '#/features/workspaces/server'
import { getInvoiceSettings, updateInvoiceSettings } from '#/features/invoices/server'
import { createSetAside, listSetAsides } from '#/features/finance/server'
import { errorMessage, formatPercentBp, parsePercentToBp } from '#/lib/format'
import { Card, CardHeader, Notice, PageHeader } from '#/components/Card'
import { Button, IconButton } from '#/components/Button'
import { Field, Input, Select, Textarea } from '#/components/Field'
import { Stepper } from '#/components/Stepper'
import { IconCheck, IconPlus, IconTrash } from '#/components/icons'
import { parseTaxPercent } from '#/components/InvoiceStatusBadge'
import { canManage, useApp } from '#/components/useApp'

const STEPS = ['Your business', 'Set-asides', 'Invite your team'] as const

const searchSchema = z.object({ step: z.number().int().min(1).max(STEPS.length).optional().catch(undefined) })

export const Route = createFileRoute('/app/_ws/setup')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loader: async () => {
    const [invoicing, rules] = await Promise.all([getInvoiceSettings(), listSetAsides()])
    return { invoicing, rules }
  },
  head: () => ({ meta: [{ title: 'Set up · Clientflare' }] }),
  component: SetupPage,
})

type InvoiceSettings = Awaited<ReturnType<typeof getInvoiceSettings>>
type Rule = Awaited<ReturnType<typeof listSetAsides>>[number]

function SetupPage() {
  const { step = 1 } = Route.useSearch()
  const { invoicing, rules } = Route.useLoaderData()
  const app = useApp()
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const [finishing, setFinishing] = useState(false)
  const [skipError, setSkipError] = useState<string | null>(null)

  const goTo = (n: number) => navigate({ search: { step: n === 1 ? undefined : n } })
  const next = () => goTo(step + 1)
  const back = () => goTo(step - 1)

  async function finish() {
    await completeSetup()
    await router.invalidate()
    await navigate({ to: '/app' })
  }

  async function skipAll() {
    setSkipError(null)
    setFinishing(true)
    try {
      await finish()
    } catch (err) {
      setSkipError(errorMessage(err, 'Could not skip setup.'))
      setFinishing(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={`Set up ${app.workspace.name}`}
        description="Three quick steps. Skip anything and come back to it from Settings."
        actions={
          <Button size="sm" onClick={skipAll} pending={finishing}>
            Skip setup
          </Button>
        }
      />
      {skipError && <Notice tone="danger">{skipError}</Notice>}
      <div className="flex flex-col gap-1.5">
        <p className="text-[12px] font-medium text-fg-subtle">
          Step {step} of {STEPS.length}
        </p>
        <Stepper steps={[...STEPS]} current={step - 1} onSelect={(i) => goTo(i + 1)} />
      </div>
      {step === 1 && <BusinessStep key="business" settings={invoicing} onNext={next} />}
      {step === 2 && <SetAsideStep key="set-asides" rules={rules} onBack={back} onNext={next} />}
      {step === 3 && <InviteStep key="invite" onBack={back} onFinish={finish} />}
    </div>
  )
}

function StepActions({ onBack, onSkip, skipLabel = 'Skip this step', pending, submitLabel }: {
  onBack?: () => void
  onSkip: () => void
  skipLabel?: string
  pending: boolean
  submitLabel: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
      <div>
        {onBack && (
          <Button onClick={onBack} disabled={pending}>
            Back
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onSkip} disabled={pending}>
          {skipLabel}
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

/* ---------- Step 1: business details ---------- */

function BusinessStep({ settings, onNext }: { settings: InvoiceSettings; onNext: () => void }) {
  const app = useApp()
  const router = useRouter()
  const editable = canManage(app.role)
  const [form, setForm] = useState({
    businessName: settings.businessName || app.workspace.name,
    businessAddress: settings.businessAddress,
    businessEmail: settings.businessEmail,
    taxId: settings.taxId,
    invoicePrefix: settings.invoicePrefix || 'INV-',
    defaultTax: String(settings.defaultTaxRateBp / 100),
    defaultPaymentTermsDays: String(settings.defaultPaymentTermsDays),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const preview = `${form.invoicePrefix.trim()}${String(settings.nextInvoiceNumber).padStart(4, '0')}`

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!editable) return onNext()
    const errs: Record<string, string> = {}
    const terms = Number(form.defaultPaymentTermsDays)
    const tax = parseTaxPercent(form.defaultTax)
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) errs.terms = 'Use 0 to 365 days.'
    if (tax === null) errs.tax = 'Use a percent between 0 and 100.'
    if (form.businessEmail.trim() && !/^\S+@\S+\.\S+$/.test(form.businessEmail.trim())) errs.email = 'Enter a valid email.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setPending(true)
    try {
      await updateInvoiceSettings({
        data: {
          businessName: form.businessName.trim(),
          businessAddress: form.businessAddress.trim(),
          businessEmail: form.businessEmail.trim(),
          taxId: form.taxId.trim(),
          invoicePrefix: form.invoicePrefix.trim(),
          nextInvoiceNumber: settings.nextInvoiceNumber,
          defaultTaxRateBp: tax ?? 0,
          defaultPaymentTermsDays: terms,
          invoiceFooter: settings.invoiceFooter,
        },
      })
      await router.invalidate()
      onNext()
    } catch (err) {
      setError(errorMessage(err, 'Could not save your business details.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader title="Your business" description="Printed on every invoice. You can change all of this later in Settings → Invoicing." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {!editable && (
            <div className="sm:col-span-2">
              <Notice>Only owners and admins can change business details. Continue to the next step.</Notice>
            </div>
          )}
          <Field label="Business name" htmlFor="setup-biz-name" className="sm:col-span-2">
            <Input id="setup-biz-name" value={form.businessName} onChange={set('businessName')} maxLength={120} disabled={!editable} autoFocus={editable} />
          </Field>
          <Field label="Address" htmlFor="setup-biz-address" className="sm:col-span-2">
            <Textarea id="setup-biz-address" rows={3} value={form.businessAddress} onChange={set('businessAddress')} maxLength={500} disabled={!editable} />
          </Field>
          <Field label="Billing email" htmlFor="setup-biz-email" error={errors.email}>
            <Input
              id="setup-biz-email"
              type="email"
              inputMode="email"
              value={form.businessEmail}
              onChange={set('businessEmail')}
              placeholder="billing@studio.com"
              aria-invalid={!!errors.email}
              disabled={!editable}
            />
          </Field>
          <Field label="Tax ID" htmlFor="setup-biz-tax-id" hint="VAT, GST or similar. Optional.">
            <Input id="setup-biz-tax-id" value={form.taxId} onChange={set('taxId')} maxLength={60} disabled={!editable} />
          </Field>
          <Field label="Invoice prefix" htmlFor="setup-inv-prefix" hint={`First invoice: ${preview}`}>
            <Input id="setup-inv-prefix" value={form.invoicePrefix} onChange={set('invoicePrefix')} maxLength={10} disabled={!editable} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default tax" htmlFor="setup-inv-tax" error={errors.tax}>
              <div className="relative">
                <Input
                  id="setup-inv-tax"
                  inputMode="decimal"
                  value={form.defaultTax}
                  onChange={set('defaultTax')}
                  aria-invalid={!!errors.tax}
                  className="pr-8 tnum"
                  disabled={!editable}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle">%</span>
              </div>
            </Field>
            <Field label="Payment terms" htmlFor="setup-inv-terms" error={errors.terms}>
              <div className="relative">
                <Input
                  id="setup-inv-terms"
                  inputMode="numeric"
                  value={form.defaultPaymentTermsDays}
                  onChange={set('defaultPaymentTermsDays')}
                  aria-invalid={!!errors.terms}
                  className="pr-12 tnum"
                  disabled={!editable}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle">days</span>
              </div>
            </Field>
          </div>
          {error && (
            <div className="sm:col-span-2">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}
        </div>
        <StepActions onSkip={onNext} pending={pending} submitLabel="Continue" />
      </form>
    </Card>
  )
}

/* ---------- Step 2: set-asides ---------- */

const SUGGESTIONS = [
  { key: 'tax', name: 'Tax', percent: '20' },
  { key: 'savings', name: 'Savings', percent: '10' },
  { key: 'giving', name: 'Giving', percent: '2.5' },
] as const

type Row = { id: string; suggestion?: string; name: string; percent: string }

let rowSeq = 0
const rowId = () => `row-${++rowSeq}`
const norm = (s: string) => s.trim().toLowerCase()

function SetAsideStep({ rules, onBack, onNext }: { rules: Rule[]; onBack: () => void; onNext: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, { name?: string; percent?: string }>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = new Set(rules.map((r) => norm(r.name)))
  const suggestions = SUGGESTIONS.filter((s) => !existing.has(norm(s.name)))
  const existingBp = rules.filter((r) => r.active).reduce((sum, r) => sum + r.percentBp, 0)
  const newBp = rows.reduce((sum, r) => (existing.has(norm(r.name)) ? sum : sum + (parsePercentToBp(r.percent) ?? 0)), 0)
  const totalBp = existingBp + newBp

  function toggle(s: (typeof SUGGESTIONS)[number]) {
    setRows((rs) =>
      rs.some((r) => r.suggestion === s.key)
        ? rs.filter((r) => r.suggestion !== s.key)
        : [...rs, { id: rowId(), suggestion: s.key, name: s.name, percent: s.percent }],
    )
  }

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const filled = rows.filter((r) => r.name.trim() || r.percent.trim())
    const errs: typeof rowErrors = {}
    const seen = new Set<string>()
    for (const r of filled) {
      const n = norm(r.name)
      if (!n) errs[r.id] = { name: 'Name the bucket.' }
      else if (seen.has(n)) errs[r.id] = { name: 'Already in the list.' }
      if (parsePercentToBp(r.percent) === null) errs[r.id] = { ...errs[r.id], percent: '0.01 to 100.' }
      seen.add(n)
    }
    setRowErrors(errs)
    if (Object.keys(errs).length) return

    const toCreate = filled.filter((r) => !existing.has(norm(r.name)))
    if (toCreate.length === 0) return onNext()
    setPending(true)
    try {
      for (const r of toCreate) {
        await createSetAside({ data: { name: r.name.trim(), percentBp: parsePercentToBp(r.percent)!, active: true } })
        // Drop saved rows as we go so a later failure doesn't re-create earlier ones on retry.
        setRows((rs) => rs.filter((x) => x.id !== r.id))
      }
      await router.invalidate()
      onNext()
    } catch (err) {
      await router.invalidate()
      setError(errorMessage(err, 'Could not save your set-asides.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader title="Set-asides" description="Put a slice of every income into buckets like Tax or Savings. Private to you." />
        <div className="flex flex-col gap-4 p-4">
          {rules.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">You already have</p>
              <ul className="flex flex-wrap gap-1.5">
                {rules.map((r) => (
                  <li key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[13px] text-fg-muted">
                    {r.name} <span className="tnum">{formatPercentBp(r.percentBp)}</span>
                    {!r.active && <span className="text-fg-subtle">(paused)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => {
                  const on = rows.some((r) => r.suggestion === s.key)
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                        on ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg'
                      }`}
                    >
                      {on ? <IconCheck size={14} /> : <IconPlus size={14} />}
                      {s.name} {s.percent}%
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div>
            <p className="mb-1.5 text-[13px] font-medium">New buckets</p>
            <ul className="flex flex-col gap-3">
              {rows.map((r, i) => (
                <li key={r.id} className="flex items-start gap-2">
                  <Field label={<span className={i > 0 ? 'sr-only' : ''}>Name</span>} htmlFor={`sa-name-${r.id}`} error={rowErrors[r.id]?.name} className="flex-1">
                    <Input
                      id={`sa-name-${r.id}`}
                      value={r.name}
                      onChange={(e) => update(r.id, { name: e.target.value })}
                      maxLength={60}
                      placeholder="Bucket name"
                      aria-invalid={!!rowErrors[r.id]?.name}
                      autoFocus={!r.suggestion && i === rows.length - 1}
                    />
                  </Field>
                  <Field label={<span className={i > 0 ? 'sr-only' : ''}>Percent</span>} htmlFor={`sa-pct-${r.id}`} error={rowErrors[r.id]?.percent} className="w-24 shrink-0">
                    <div className="relative">
                      <Input
                        id={`sa-pct-${r.id}`}
                        inputMode="decimal"
                        value={r.percent}
                        onChange={(e) => update(r.id, { percent: e.target.value })}
                        placeholder="10"
                        className="pr-7 tnum"
                        aria-invalid={!!rowErrors[r.id]?.percent}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-fg-subtle">%</span>
                    </div>
                  </Field>
                  <IconButton aria-label={`Remove ${r.name || 'row'}`} title="Remove" onClick={() => remove(r.id)} icon={<IconTrash />} className={i === 0 ? 'mt-7' : 'mt-0.5'} />
                </li>
              ))}
            </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" icon={<IconPlus />} onClick={() => setRows((rs) => [...rs, { id: rowId(), name: '', percent: '' }])}>
              Add your own
            </Button>
            {(rows.length > 0 || rules.length > 0) && (
              <p className={`text-[13px] tnum ${totalBp > 10_000 ? 'text-danger' : 'text-fg-muted'}`}>
                Active total: {formatPercentBp(totalBp)}
              </p>
            )}
          </div>

          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <StepActions onBack={onBack} onSkip={onNext} pending={pending} submitLabel="Continue" />
      </form>
    </Card>
  )
}

/* ---------- Step 3: invites ---------- */

type Invite = { id: string; email: string; role: 'admin' | 'member' }
const MAX_INVITES = 3

function InviteStep({ onBack, onFinish }: { onBack: () => void; onFinish: () => Promise<void> }) {
  const app = useApp()
  const editable = canManage(app.role)
  const [rows, setRows] = useState<Invite[]>(() => [{ id: rowId(), email: '', role: 'member' }])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (id: string, patch: Partial<Invite>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  async function finish(sendInvites: boolean) {
    setError(null)
    const filled = sendInvites && editable ? rows.filter((r) => r.email.trim()) : []
    const errs: Record<string, string> = {}
    for (const r of filled) if (!/^\S+@\S+\.\S+$/.test(r.email.trim())) errs[r.id] = 'Enter a valid email.'
    setRowErrors(errs)
    if (Object.keys(errs).length) return
    setPending(true)
    try {
      for (const r of filled) {
        await inviteMember({ data: { email: r.email.trim(), role: r.role } })
        setSent((s) => [...s, r.email.trim()])
        setRows((rs) => {
          const left = rs.filter((x) => x.id !== r.id)
          return left.length ? left : [{ id: rowId(), email: '', role: 'member' }]
        })
      }
      await onFinish()
    } catch (err) {
      setError(errorMessage(err, 'Could not send the invite.'))
      setPending(false)
    }
  }

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void finish(true)
        }}
        noValidate
      >
        <CardHeader title="Invite your team" description="Optional. They get an email with a link to join this workspace." />
        <div className="flex flex-col gap-3 p-4">
          {!editable ? (
            <Notice>Only owners and admins can invite people. Finish to go to your dashboard.</Notice>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {rows.map((r, i) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <Field label={<span className={i > 0 ? 'sr-only' : ''}>Email</span>} htmlFor={`inv-email-${r.id}`} error={rowErrors[r.id]} className="flex-1">
                      <Input
                        id={`inv-email-${r.id}`}
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        value={r.email}
                        onChange={(e) => update(r.id, { email: e.target.value })}
                        placeholder="name@company.com"
                        aria-invalid={!!rowErrors[r.id]}
                        autoFocus={i === rows.length - 1}
                      />
                    </Field>
                    <Field label={<span className={i > 0 ? 'sr-only' : ''}>Role</span>} htmlFor={`inv-role-${r.id}`} className="w-28 shrink-0">
                      <Select id={`inv-role-${r.id}`} value={r.role} onChange={(e) => update(r.id, { role: e.target.value as Invite['role'] })}>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </Field>
                    {rows.length > 1 && (
                      <IconButton
                        aria-label={`Remove ${r.email || 'row'}`}
                        onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                        icon={<IconTrash />}
                        className={i === 0 ? 'mt-7' : 'mt-2'}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {rows.length < MAX_INVITES && (
                <div>
                  <Button size="sm" icon={<IconPlus />} onClick={() => setRows((rs) => [...rs, { id: rowId(), email: '', role: 'member' }])}>
                    Add another
                  </Button>
                </div>
              )}
            </>
          )}
          {sent.length > 0 && <Notice tone="accent">Invite sent to {sent.join(', ')}.</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <StepActions onBack={onBack} onSkip={() => void finish(false)} skipLabel="Skip" pending={pending} submitLabel="Finish" />
      </form>
    </Card>
  )
}
