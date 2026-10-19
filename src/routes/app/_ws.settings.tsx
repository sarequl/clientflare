import { useState, type FormEvent } from 'react'
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
import { Button } from '#/components/Button'
import { CurrencySelect, Field, Input, Select } from '#/components/Field'
import { ConfirmDialog } from '#/components/Modal'
import { EmptyState } from '#/components/EmptyState'
import { ThemeToggle } from '#/components/ThemeToggle'
import { TimezoneSelect } from '#/components/TimezoneSelect'
import { canManage, useApp } from '#/components/useApp'
import { TagSettings } from '#/components/TagSettings'
import { FieldSettings } from '#/components/FieldSettings'
import { listTags } from '#/features/tags/server'
import { listFields } from '#/features/custom-fields/server'

const TABS = ['workspace', 'members', 'tags', 'fields', 'personal'] as const
type Tab = (typeof TABS)[number]

const searchSchema = z.object({ tab: z.enum(TABS).optional().catch(undefined) })

export const Route = createFileRoute('/app/_ws/settings')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'workspace' }),
  loader: async ({ deps }) => {
    const [members, tags, fields] = await Promise.all([
      deps.tab === 'members' ? listMembers() : null,
      deps.tab === 'tags' ? listTags() : null,
      deps.tab === 'fields'
        ? Promise.all([listFields({ data: { recordType: 'contact' } }), listFields({ data: { recordType: 'company' } })]).then(([contact, company]) => ({ contact, company }))
        : null,
    ])
    return { members, tags, fields }
  },
  head: () => ({ meta: [{ title: 'Settings · Clientflare' }] }),
  component: SettingsPage,
})

const TAB_LABELS: Record<Tab, string> = { workspace: 'Workspace', members: 'Members', tags: 'Tags', fields: 'Custom fields', personal: 'Personal' }

function SettingsPage() {
  const { tab = 'workspace' } = Route.useSearch()
  const { members, tags, fields } = Route.useLoaderData()

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
      {tab === 'tags' && tags && <TagSettings tags={tags} />}
      {tab === 'fields' && fields && <FieldSettings fields={fields} />}
      {tab === 'personal' && <PersonalTab />}
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
