import { useEffect, useState, type FormEvent } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import {
  cancelInvitation,
  inviteMember,
  listMembers,
  removeMember,
  updatePersonalSettings,
  updateWorkspaceSettings,
} from '#/features/workspaces/server'
import { errorMessage, formatDay } from '#/lib/format'
import { Badge, Card, CardHeader, Notice, PageHeader } from '#/components/Card'
import { Button, buttonClass } from '#/components/Button'
import { CurrencySelect, Field, Input, Select, Textarea } from '#/components/Field'
import { ConfirmDialog } from '#/components/Modal'
import { EmptyState } from '#/components/EmptyState'
import { ThemeToggle } from '#/components/ThemeToggle'
import { TimezoneSelect } from '#/components/TimezoneSelect'
import { canManage, useApp } from '#/components/useApp'
import { TagSettings } from '#/components/TagSettings'
import { FieldSettings } from '#/components/FieldSettings'
import { listTags } from '#/features/tags/server'
import { listFields } from '#/features/custom-fields/server'
import { getInvoiceSettings, updateInvoiceSettings } from '#/features/invoices/server'
import { StageSettings } from '#/components/StageSettings'
import { parseTaxPercent } from '#/components/InvoiceStatusBadge'
import { createApiToken, listApiTokens, revokeApiToken } from '#/features/api-tokens/server'
import { IconCheck } from '#/components/icons'
import { IconCopy } from '#/components/icons-invoice'
import { IconLock } from '#/components/icons2'

const TABS = ['workspace', 'members', 'pipeline', 'invoicing', 'tags', 'fields', 'personal', 'api'] as const
type Tab = (typeof TABS)[number]

const searchSchema = z.object({ tab: z.enum(TABS).optional().catch(undefined) })

export const Route = createFileRoute('/app/_ws/settings')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'workspace' }),
  loader: async ({ deps }) => {
    const [members, tags, fields, invoicing, apiTokens] = await Promise.all([
      deps.tab === 'members' ? listMembers() : null,
      deps.tab === 'tags' ? listTags() : null,
      deps.tab === 'fields'
        ? Promise.all([listFields({ data: { recordType: 'contact' } }), listFields({ data: { recordType: 'company' } })]).then(([contact, company]) => ({ contact, company }))
        : null,
      deps.tab === 'invoicing' ? getInvoiceSettings() : null,
      deps.tab === 'api' ? listApiTokens() : null,
    ])
    return { members, tags, fields, invoicing, apiTokens }
  },
  head: () => ({ meta: [{ title: 'Settings · Clientflare' }] }),
  component: SettingsPage,
})

const TAB_LABELS: Record<Tab, string> = {
  workspace: 'Workspace',
  members: 'Members',
  pipeline: 'Pipeline',
  invoicing: 'Invoicing',
  tags: 'Tags',
  fields: 'Custom fields',
  personal: 'Personal',
  api: 'API & MCP',
}

function SettingsPage() {
  const { tab = 'workspace' } = Route.useSearch()
  const { members, tags, fields, invoicing, apiTokens } = Route.useLoaderData()

  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link
            key={t}
            from={Route.fullPath}
            search={{ tab: t === 'workspace' ? undefined : t }}
            aria-current={tab === t ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              tab === t ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>
      {tab === 'workspace' && <WorkspaceTab />}
      {tab === 'members' && members && <MembersTab data={members} />}
      {tab === 'pipeline' && <StageSettings />}
      {tab === 'invoicing' && invoicing && <InvoicingTab settings={invoicing} />}
      {tab === 'tags' && tags && <TagSettings tags={tags} />}
      {tab === 'fields' && fields && <FieldSettings fields={fields} />}
      {tab === 'personal' && <PersonalTab />}
      {tab === 'api' && apiTokens && <ApiTab tokens={apiTokens} />}
    </>
  )
}

function WorkspaceTab() {
  const app = useApp()
  const router = useRouter()
  const editable = canManage(app.role)
  const [name, setName] = useState(app.workspace.name)
  const [currency, setCurrency] = useState(app.workspace.baseCurrency)
  const [timezone, setTimezone] = useState(app.workspace.timezone)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!name.trim()) {
      setError('The workspace needs a name.')
      return
    }
    setPending(true)
    try {
      await updateWorkspaceSettings({ data: { name: name.trim(), baseCurrency: currency, timezone } })
      await router.invalidate()
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save settings.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Workspace"
        description={editable ? 'Applies to everyone in this workspace.' : 'Only owners and admins can change these.'}
        actions={
          <Link to="/app/setup" className={buttonClass('ghost', 'sm')}>
            Run setup again
          </Link>
        }
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
        <Field label="Name" htmlFor="ws-name">
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!editable} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base currency" htmlFor="ws-currency" hint="Default for new income and expenses.">
            <CurrencySelect id="ws-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Timezone" htmlFor="ws-tz">
            <TimezoneSelect id="ws-tz" value={timezone} onChange={setTimezone} disabled={!editable} />
          </Field>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {saved && !error && <Notice tone="accent">Saved.</Notice>}
        {editable && (
          <div>
            <Button type="submit" variant="primary" pending={pending}>
              Save changes
            </Button>
          </div>
        )}
      </form>
    </Card>
  )
}

type InvoiceSettings = Awaited<ReturnType<typeof getInvoiceSettings>>

function InvoicingTab({ settings }: { settings: InvoiceSettings }) {
  const app = useApp()
  const router = useRouter()
  const editable = canManage(app.role)
  const [form, setForm] = useState({
    businessName: settings.businessName,
    businessAddress: settings.businessAddress,
    businessEmail: settings.businessEmail,
    taxId: settings.taxId,
    invoicePrefix: settings.invoicePrefix,
    nextInvoiceNumber: String(settings.nextInvoiceNumber),
    defaultTax: String(settings.defaultTaxRateBp / 100),
    defaultPaymentTermsDays: String(settings.defaultPaymentTermsDays),
    invoiceFooter: settings.invoiceFooter,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const preview = `${form.invoicePrefix}${String(Number(form.nextInvoiceNumber) || 1).padStart(4, '0')}`

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    const errs: Record<string, string> = {}
    const next = Number(form.nextInvoiceNumber)
    const terms = Number(form.defaultPaymentTermsDays)
    const tax = parseTaxPercent(form.defaultTax)
    if (!Number.isInteger(next) || next < 1) errs.next = 'Use a whole number from 1.'
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
          nextInvoiceNumber: next,
          defaultTaxRateBp: tax ?? 0,
          defaultPaymentTermsDays: terms,
          invoiceFooter: form.invoiceFooter.trim(),
        },
      })
      await router.invalidate()
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save invoicing settings.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4" noValidate>
      <Card>
        <CardHeader title="Business details" description="Printed at the top of every invoice." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="biz-name" hint={`Leave blank to use “${app.workspace.name}”.`} className="sm:col-span-2">
            <Input id="biz-name" value={form.businessName} onChange={set('businessName')} maxLength={120} disabled={!editable} />
          </Field>
          <Field label="Address" htmlFor="biz-address" className="sm:col-span-2">
            <Textarea id="biz-address" rows={3} value={form.businessAddress} onChange={set('businessAddress')} maxLength={500} disabled={!editable} />
          </Field>
          <Field label="Billing email" htmlFor="biz-email" error={errors.email}>
            <Input id="biz-email" type="email" inputMode="email" value={form.businessEmail} onChange={set('businessEmail')} aria-invalid={!!errors.email} disabled={!editable} />
          </Field>
          <Field label="Tax ID" htmlFor="biz-tax-id" hint="VAT, GST or similar. Optional.">
            <Input id="biz-tax-id" value={form.taxId} onChange={set('taxId')} maxLength={60} disabled={!editable} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Numbering and defaults" description={editable ? 'Numbers are assigned when an invoice is marked sent.' : 'Only owners and admins can change these.'} />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Number prefix" htmlFor="inv-prefix" hint={`Next invoice: ${preview}`}>
            <Input id="inv-prefix" value={form.invoicePrefix} onChange={set('invoicePrefix')} maxLength={10} disabled={!editable} />
          </Field>
          <Field label="Next number" htmlFor="inv-next" error={errors.next}>
            <Input id="inv-next" inputMode="numeric" value={form.nextInvoiceNumber} onChange={set('nextInvoiceNumber')} aria-invalid={!!errors.next} className="tnum" disabled={!editable} />
          </Field>
          <Field label="Default tax rate" htmlFor="inv-default-tax" error={errors.tax}>
            <div className="relative">
              <Input id="inv-default-tax" inputMode="decimal" value={form.defaultTax} onChange={set('defaultTax')} aria-invalid={!!errors.tax} className="pr-8 tnum" disabled={!editable} />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle">%</span>
            </div>
          </Field>
          <Field label="Payment terms" htmlFor="inv-terms" error={errors.terms} hint="Days from issue to due date.">
            <div className="relative">
              <Input id="inv-terms" inputMode="numeric" value={form.defaultPaymentTermsDays} onChange={set('defaultPaymentTermsDays')} aria-invalid={!!errors.terms} className="pr-12 tnum" disabled={!editable} />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle">days</span>
            </div>
          </Field>
          <Field label="Default footer" htmlFor="inv-default-footer" hint="Bank details, late fee terms. Copied onto new invoices." className="sm:col-span-2">
            <Textarea id="inv-default-footer" rows={3} value={form.invoiceFooter} onChange={set('invoiceFooter')} maxLength={2000} disabled={!editable} />
          </Field>
        </div>
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      {saved && !error && <Notice tone="accent">Saved.</Notice>}
      {editable && (
        <div>
          <Button type="submit" variant="primary" pending={pending}>
            Save invoicing settings
          </Button>
        </div>
      )}
    </form>
  )
}

type MembersData = Awaited<ReturnType<typeof listMembers>>

function MembersTab({ data }: { data: MembersData }) {
  const app = useApp()
  const router = useRouter()
  const manage = canManage(app.role)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)
  const [invitePending, setInvitePending] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<MembersData['members'][number] | null>(null)
  const [removePending, setRemovePending] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    setInviteError(null)
    setInvited(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setInviteError('Enter a valid email.')
      return
    }
    setInvitePending(true)
    try {
      await inviteMember({ data: { email: email.trim(), role } })
      await router.invalidate()
      setInvited(email.trim())
      setEmail('')
    } catch (err) {
      setInviteError(errorMessage(err, 'Could not send the invite.'))
    } finally {
      setInvitePending(false)
    }
  }

  async function onCancelInvite(id: string) {
    setListError(null)
    setCancelling(id)
    try {
      await cancelInvitation({ data: { invitationId: id } })
      await router.invalidate()
    } catch (err) {
      setListError(errorMessage(err, 'Could not cancel the invite.'))
    } finally {
      setCancelling(null)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setRemovePending(true)
    setRemoveError(null)
    try {
      await removeMember({ data: { memberId: removing.id } })
      await router.invalidate()
      setRemoving(null)
    } catch (err) {
      setRemoveError(errorMessage(err, 'Could not remove the member.'))
    } finally {
      setRemovePending(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {manage && (
        <Card>
          <CardHeader title="Invite someone" description="They get an email with a link to join this workspace." />
          <form onSubmit={onInvite} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end" noValidate>
            <Field label="Email" htmlFor="inv-email" className="flex-1" error={inviteError}>
              <Input
                id="inv-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                aria-invalid={!!inviteError}
              />
            </Field>
            <Field label="Role" htmlFor="inv-role" className="sm:w-32">
              <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" pending={invitePending} className={inviteError ? 'sm:mb-[26px]' : ''}>
              Send invite
            </Button>
          </form>
          {invited && (
            <div className="px-4 pb-4">
              <Notice tone="accent" onDismiss={() => setInvited(null)}>
                Invite sent to {invited}.
              </Notice>
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Members" description={`${data.members.length} ${data.members.length === 1 ? 'person' : 'people'}`} />
        <ul className="divide-y divide-border">
          {data.members.map((m) => {
            const isMe = m.userId === app.user.id
            const removable = manage && !isMe && m.role !== 'owner'
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-fg-muted uppercase">
                  {(m.name || m.email).slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {isMe && <span className="font-normal text-fg-subtle">(you)</span>}
                  </p>
                  <p className="truncate text-[13px] text-fg-muted">{m.email}</p>
                </div>
                <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'} className="capitalize">
                  {m.role}
                </Badge>
                {removable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRemoveError(null)
                      setRemoving(m)
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Pending invites" />
        {listError && (
          <div className="px-4 pt-3">
            <Notice tone="danger">{listError}</Notice>
          </div>
        )}
        {data.invitations.length === 0 ? (
          <EmptyState title="No pending invites" />
        ) : (
          <ul className="divide-y divide-border">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.email}</p>
                  <p className="text-[13px] text-fg-muted">
                    <span className="capitalize">{i.role}</span> · expires {formatDay(new Date(i.expiresAt).toISOString().slice(0, 10))}
                  </p>
                </div>
                {manage && (
                  <Button size="sm" variant="ghost" pending={cancelling === i.id} onClick={() => onCancelInvite(i.id)}>
                    Cancel invite
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        pending={removePending}
        error={removeError}
        confirmLabel="Remove"
        title={`Remove ${removing?.name ?? 'member'}?`}
        body="They lose access to this workspace right away. Income and expenses they recorded stay."
      />
    </div>
  )
}

function PersonalTab() {
  const app = useApp()
  const router = useRouter()
  const [currency, setCurrency] = useState(app.personalCurrency)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setPending(true)
    try {
      await updatePersonalSettings({ data: { baseCurrency: currency } })
      await router.invalidate()
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <CardHeader title="Personal" description="Only affects you, in every workspace." />
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
          <Field label="Personal currency" htmlFor="me-currency" hint="Default currency for payouts from your set-aside buckets.">
            <CurrencySelect id="me-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          {saved && !error && <Notice tone="accent">Saved.</Notice>}
          <div>
            <Button type="submit" variant="primary" pending={pending}>
              Save
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Account" />
        <dl className="grid gap-3 p-4 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-fg-muted">Name</dt>
          <dd>{app.user.name}</dd>
          <dt className="text-fg-muted">Email</dt>
          <dd>{app.user.email}</dd>
          <dt className="self-center text-fg-muted">Theme</dt>
          <dd>
            <ThemeToggle />
          </dd>
        </dl>
      </Card>
    </div>
  )
}

type ApiTokenRow = Awaited<ReturnType<typeof listApiTokens>>[number]

function toDay(value: Date | string | number): string {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function copy() {
    setFailed(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setFailed(true)
    }
  }

  return (
    <Button size="sm" icon={copied ? <IconCheck /> : <IconCopy />} onClick={copy} title={failed ? 'Could not copy. Select the text and copy it by hand.' : undefined}>
      {copied ? 'Copied' : failed ? 'Copy failed' : label}
    </Button>
  )
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium">{label}</p>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 px-3 py-2.5 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap">{code}</pre>
    </div>
  )
}

function ApiTab({ tokens }: { tokens: ApiTokenRow[] }) {
  const app = useApp()
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; name: string; token: string } | null>(null)
  const [revoking, setRevoking] = useState<ApiTokenRow | null>(null)
  const [revokePending, setRevokePending] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  useEffect(() => setOrigin(window.location.origin), [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the token a name so you can recognise it later.')
      return
    }
    setPending(true)
    try {
      const res = await createApiToken({ data: { name: trimmed } })
      setCreated({ id: res.id, name: trimmed, token: res.token })
      setName('')
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err, 'Could not create the token.'))
    } finally {
      setPending(false)
    }
  }

  async function confirmRevoke() {
    if (!revoking) return
    setRevokePending(true)
    setRevokeError(null)
    try {
      await revokeApiToken({ data: { id: revoking.id } })
      if (created?.id === revoking.id) setCreated(null)
      await router.invalidate()
      setRevoking(null)
    } catch (err) {
      setRevokeError(errorMessage(err, 'Could not revoke the token.'))
    } finally {
      setRevokePending(false)
    }
  }

  const mcpUrl = `${origin}/api/mcp`
  const claudeCode = created ? `claude mcp add --transport http clientflare ${mcpUrl} --header "Authorization: Bearer ${created.token}"` : ''
  const jsonConfig = created
    ? JSON.stringify({ mcpServers: { clientflare: { url: mcpUrl, headers: { Authorization: `Bearer ${created.token}` } } } }, null, 2)
    : ''
  const desktopConfig = created
    ? JSON.stringify(
        { mcpServers: { clientflare: { command: 'npx', args: ['-y', 'mcp-remote', mcpUrl, '--header', `Authorization: Bearer ${created.token}`] } } },
        null,
        2,
      )
    : ''

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader
          title="API & MCP"
          description="Personal tokens let Claude, Cursor or any MCP client act as you in this workspace."
        />
        <div className="flex flex-col gap-2 p-4 text-sm text-fg-muted">
          <p>
            Each token is tied to you and to <span className="font-medium text-fg">{app.workspace.name}</span>. It can do what you can do here, nothing more.
            Revoking a token cuts access immediately.
          </p>
          <p>
            <span className="font-medium text-fg">What it can do:</span> search, contacts, companies, deals, tasks, timeline notes, draft invoices and a finance
            summary. Invoices are only ever created as drafts over MCP, so nothing gets sent without you.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Create a token" description="Name it after the app that will use it." />
        <form onSubmit={onCreate} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end" noValidate>
          <Field label="Name" htmlFor="api-token-name" className="flex-1" error={error}>
            <Input
              id="api-token-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude Desktop"
              maxLength={60}
              aria-invalid={!!error}
            />
          </Field>
          <Button type="submit" variant="primary" pending={pending} className={error ? 'sm:mb-[26px]' : ''}>
            Create token
          </Button>
        </form>
        {created && (
          <div className="flex flex-col gap-4 border-t border-border p-4">
            <div className="flex flex-col gap-2 rounded-md border border-transparent bg-accent-soft p-3 text-accent-soft-fg">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">New token: {created.name}</p>
                <CopyButton text={created.token} label="Copy token" />
              </div>
              <code className="block rounded border border-border bg-surface px-2.5 py-2 font-mono text-[12px] break-all text-fg select-all">{created.token}</code>
            </div>
            <Notice tone="warn">Copy it now. This token will not be shown again.</Notice>
            {origin && (
              <>
                <CodeBlock label="Claude Code" code={claudeCode} />
                <CodeBlock label="Cursor, Windsurf, VS Code" code={jsonConfig} />
                <CodeBlock label="Claude Desktop" code={desktopConfig} />
                <p className="text-[13px] text-fg-muted">
                  Claude Desktop only runs local (stdio) servers, so this goes through <span className="font-mono">mcp-remote</span>. claude.ai web connectors need
                  OAuth, which is not supported yet.
                </p>
              </>
            )}
            <div>
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Done, hide it
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Your tokens" description={`${tokens.length} ${tokens.length === 1 ? 'token' : 'tokens'} in this workspace`} />
        {tokens.length === 0 ? (
          <EmptyState icon={<IconLock />} title="No tokens yet" body="Create one above to connect Claude, Cursor or another MCP client." />
        ) : (
          <ul className="divide-y divide-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-[13px] text-fg-muted">
                    <span className="font-mono">{t.tokenPrefix}…</span> · created {formatDay(toDay(t.createdAt))} · last used{' '}
                    {t.lastUsedAt ? formatDay(toDay(t.lastUsedAt)) : 'Never'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRevokeError(null)
                    setRevoking(t)
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={confirmRevoke}
        pending={revokePending}
        error={revokeError}
        confirmLabel="Revoke"
        title={`Revoke ${revoking?.name ?? 'token'}?`}
        body="Anything using this token loses access right away. This can't be undone."
      />
    </div>
  )
}
