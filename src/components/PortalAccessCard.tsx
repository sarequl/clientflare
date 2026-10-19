import { useCallback, useEffect, useState } from 'react'
import { disablePortal, getPortalAccess, invitePortal } from '#/features/portal/server'
import { errorMessage } from '#/lib/format'
import { Badge, Card, CardHeader, Notice } from './Card'
import { Button, Spinner } from './Button'
import { ConfirmDialog } from './Modal'
import { IconMail } from './icons'

type Access = Awaited<ReturnType<typeof getPortalAccess>>

const seen = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Client portal controls for one contact. Drop it into the contact detail sidebar. */
export function PortalAccessCard({ contactId, email }: { contactId: string; email: string | null | undefined }) {
  const [access, setAccess] = useState<Access | undefined>(undefined)
  const [pending, setPending] = useState<'invite' | 'disable' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      setAccess(await getPortalAccess({ data: { contactId } }))
    } catch (err) {
      setError(errorMessage(err, 'Could not load portal access.'))
      setAccess(null)
    }
  }, [contactId])

  useEffect(() => {
    setAccess(undefined)
    setSentTo(null)
    void load()
  }, [load])

  const enabled = !!access?.enabled
  // Invites go to the contact's current email; the stored one may be older.
  const target = email || access?.email || null

  async function invite() {
    if (!target) return
    setPending('invite')
    setError(null)
    setSentTo(null)
    try {
      await invitePortal({ data: { contactId, email: target } })
      setSentTo(target)
      await load()
    } catch (err) {
      setError(errorMessage(err, 'Could not send the portal link.'))
    } finally {
      setPending(null)
    }
  }

  async function disable() {
    setPending('disable')
    setError(null)
    try {
      await disablePortal({ data: { contactId } })
      setConfirming(false)
      setSentTo(null)
      await load()
    } catch (err) {
      setError(errorMessage(err, 'Could not disable portal access.'))
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Client portal"
        description="Lets them see their invoices, shared files and notes."
        actions={access === undefined ? <Spinner className="text-fg-subtle" /> : enabled ? <Badge tone="accent">Active</Badge> : access ? <Badge>Disabled</Badge> : <Badge>Not invited</Badge>}
      />
      <div className="flex flex-col gap-3 p-4 text-sm">
        {access && (
          <p className="text-[13px] text-fg-muted">
            {enabled ? 'Signs in as' : 'Was invited as'} <span className="font-medium text-fg">{access.email}</span>
            <br />
            {access.lastSeenAt ? `Last visit ${seen.format(new Date(access.lastSeenAt))}` : 'Has not signed in yet'}
          </p>
        )}
        {!target && <p className="text-[13px] text-fg-muted">Add an email to this contact to invite them.</p>}
        {sentTo && (
          <Notice tone="accent" onDismiss={() => setSentTo(null)}>
            Sign-in link sent to {sentTo}.
          </Notice>
        )}
        {error && (
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={enabled ? 'secondary' : 'primary'} icon={<IconMail />} pending={pending === 'invite'} disabled={!target || access === undefined} onClick={invite}>
            {enabled ? 'Resend link' : access ? 'Re-enable and invite' : 'Invite to portal'}
          </Button>
          {enabled && (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} disabled={!!pending}>
              Disable
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={disable}
        pending={pending === 'disable'}
        confirmLabel="Disable access"
        title="Disable portal access?"
        body="They are signed out everywhere and their open links stop working. You can invite them again later."
      />
    </Card>
  )
}
