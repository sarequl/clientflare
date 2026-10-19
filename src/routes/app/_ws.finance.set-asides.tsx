import { useState, type FormEvent } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { createSetAside, deleteSetAside, listSetAsides, updateSetAside } from '#/features/finance/server'
import { errorMessage, formatPercentBp, parsePercentToBp } from '#/lib/format'
import { Badge, Card, Notice, PageHeader } from '#/components/Card'
import { Button, IconButton, buttonClass } from '#/components/Button'
import { Field, Input, Switch } from '#/components/Field'
import { ConfirmDialog, Modal, ModalActions } from '#/components/Modal'
import { Money } from '#/components/Money'
import { EmptyState } from '#/components/EmptyState'
import { IconPencil, IconPiggy, IconPlus, IconSend, IconTrash } from '#/components/icons'

export const Route = createFileRoute('/app/_ws/finance/set-asides')({
  loader: async () => ({ rules: await listSetAsides() }),
  head: () => ({ meta: [{ title: 'Set-asides · Clientflare' }] }),
  component: SetAsidesPage,
})

type Rule = Awaited<ReturnType<typeof listSetAsides>>[number]

function SetAsidesPage() {
  const { rules } = Route.useLoaderData()
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)
  const [deleting, setDeleting] = useState<Rule | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const activeBp = rules.filter((r) => r.active).reduce((sum, r) => sum + r.percentBp, 0)
  const tone = activeBp > 10_000 ? 'danger' : activeBp >= 8_000 ? 'warn' : 'accent'

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteSetAside({ data: { id: deleting.id } })
      await router.invalidate()
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Set-asides"
        description="Personal rules that split every income you record. They follow you across workspaces and only you see them."
        actions={
          <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>
            New rule
          </Button>
        }
      />

      {rules.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-fg-muted">Active rules take</span>
            <span className="text-base font-semibold tnum">{formatPercentBp(activeBp)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={activeBp / 100} aria-label="Total active percent">
            <div
              className={`h-full rounded-full ${tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn-soft-fg' : 'bg-accent'}`}
              style={{ width: `${Math.min(100, activeBp / 100)}%` }}
            />
          </div>
          {activeBp >= 8_000 && (
            <p className={`mt-2 text-[13px] ${activeBp > 10_000 ? 'text-danger' : 'text-warn-soft-fg'}`}>
              {activeBp >= 10_000
                ? 'Your active rules already claim 100% of every income. Pause or shrink one before adding another.'
                : `Only ${formatPercentBp(10_000 - activeBp)} of each income is left unallocated.`}
            </p>
          )}
        </Card>
      )}

      {rules.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPiggy size={18} />}
            title="No rules yet"
            body="Create a rule like “Tax 20%” and that share of every income you record is set aside. Pay it out later from Payouts."
            action={
              <Button variant="secondary" size="sm" icon={<IconPlus />} onClick={() => setAdding(true)}>
                New rule
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rules.map((r) => {
            const entries = Object.entries(r.balances)
            return (
              <Card key={r.id} className={r.active ? '' : 'opacity-75'}>
                <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{r.name}</span>
                      <span className="tnum text-fg-muted">{formatPercentBp(r.percentBp)}</span>
                      {r.active ? <Badge tone="accent">Active</Badge> : <Badge>Paused</Badge>}
                    </p>
                  </div>
                  <div className="-mt-1 -mr-1.5 flex shrink-0 gap-0.5">
                    <IconButton aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)} icon={<IconPencil />} />
                    <IconButton
                      aria-label={`Delete ${r.name}`}
                      onClick={() => {
                        setDeleteError(null)
                        setDeleting(r)
                      }}
                      icon={<IconTrash />}
                    />
                  </div>
                </div>
                {entries.length === 0 ? (
                  <p className="border-t border-border px-4 py-3 text-[13px] text-fg-muted">Nothing allocated yet.</p>
                ) : (
                  <table className="w-full border-t border-border text-sm">
                    <thead>
                      <tr className="text-left text-[12px] text-fg-subtle">
                        <th className="px-4 pt-2 pb-1 font-medium">Currency</th>
                        <th className="px-2 pt-2 pb-1 text-right font-medium">In</th>
                        <th className="px-2 pt-2 pb-1 text-right font-medium">Paid out</th>
                        <th className="px-4 pt-2 pb-1 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([c, b]) => (
                        <tr key={c}>
                          <td className="px-4 py-1.5 text-[12px] font-semibold text-fg-muted">{c}</td>
                          <td className="px-2 py-1.5 text-right text-fg-muted"><Money minor={b.allocated} currency={c} /></td>
                          <td className="px-2 py-1.5 text-right text-fg-muted"><Money minor={b.paidOut} currency={c} /></td>
                          <td className="px-4 py-1.5 text-right font-semibold"><Money minor={b.balance} currency={c} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="px-4 pt-1 pb-3">
                  <Link to="/app/finance/payouts" search={{ ruleId: r.id }} className={buttonClass('secondary', 'sm')}>
                    <IconSend size={14} /> Record a payout
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New set-aside rule" size="sm">
        <RuleForm otherActiveBp={activeBp} onDone={() => setAdding(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit rule" size="sm">
        {editing && (
          <RuleForm rule={editing} otherActiveBp={activeBp - (editing.active ? editing.percentBp : 0)} onDone={() => setEditing(null)} />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete “${deleting?.name ?? ''}”?`}
        body="This also deletes its allocation history and every payout recorded against it. To stop using a rule but keep its history, pause it instead."
      />
    </>
  )
}

function RuleForm({ rule, otherActiveBp, onDone }: { rule?: Rule; otherActiveBp: number; onDone: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(rule?.name ?? '')
  const [percent, setPercent] = useState(rule ? String(rule.percentBp / 100) : '')
  const [active, setActive] = useState(rule?.active ?? true)
  const [errors, setErrors] = useState<{ name?: string; percent?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  const bp = parsePercentToBp(percent)
  const projected = otherActiveBp + (active && bp ? bp : 0)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Name the bucket, e.g. Tax or Savings.'
    if (bp === null) next.percent = 'Enter a percent between 0.01 and 100.'
    else if (active && projected > 10_000)
      next.percent = `Active rules would total ${formatPercentBp(projected)}. Keep it at ${formatPercentBp(Math.max(0, 10_000 - otherActiveBp))} or less, or save it paused.`
    setErrors(next)
    if (Object.keys(next).length || bp === null) return
    setPending(true)
    try {
      const data = { name: name.trim(), percentBp: bp, active }
      if (rule) await updateSetAside({ data: { id: rule.id, ...data } })
      else await createSetAside({ data })
      await router.invalidate()
      onDone()
    } catch (err) {
      setErrors({ form: errorMessage(err, 'Could not save the rule.') })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" htmlFor="rule-name" error={errors.name}>
        <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Tax" aria-invalid={!!errors.name} />
      </Field>
      <Field
        label="Percent of each income"
        htmlFor="rule-percent"
        error={errors.percent}
        hint={bp && active ? `Active rules would total ${formatPercentBp(projected)}.` : 'Up to two decimals, e.g. 12.5'}
      >
        <div className="relative">
          <Input
            id="rule-percent"
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="20"
            className="pr-8 tnum"
            aria-invalid={!!errors.percent}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-fg-subtle">%</span>
        </div>
      </Field>
      <Switch id="rule-active" checked={active} onChange={setActive} label={active ? 'Active: applies to new incomes' : 'Paused: new incomes skip it'} />
      {rule && <p className="text-[13px] text-fg-muted">Changing the percent only affects incomes recorded from now on.</p>}
      {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      <ModalActions>
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {rule ? 'Save rule' : 'Create rule'}
        </Button>
      </ModalActions>
    </form>
  )
}
