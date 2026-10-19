import { useEffect, useState, type FormEvent } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { createPayout, deletePayout, listPayouts, listSetAsides } from '#/features/finance/server'
import { formatMoney, parseMoney } from '#/lib/money'
import { errorMessage, formatDay, todayISO } from '#/lib/format'
import { Card, Notice, PageHeader } from '#/components/Card'
import { Button, IconButton, buttonClass } from '#/components/Button'
import { CurrencySelect, Field, Input, Select, Textarea } from '#/components/Field'
import { ConfirmDialog, Modal, ModalActions } from '#/components/Modal'
import { Money } from '#/components/Money'
import { EmptyState } from '#/components/EmptyState'
import { IconPlus, IconSend, IconTrash } from '#/components/icons'
import { useApp } from '#/components/useApp'

const searchSchema = z.object({ ruleId: z.string().optional().catch(undefined) })

export const Route = createFileRoute('/app/_ws/finance/payouts')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loader: async () => {
    const [payouts, rules] = await Promise.all([listPayouts(), listSetAsides()])
    return { payouts, rules }
  },
  head: () => ({ meta: [{ title: 'Payouts · Clientflare' }] }),
  component: PayoutsPage,
})

type Payout = Awaited<ReturnType<typeof listPayouts>>[number]
type Rule = Awaited<ReturnType<typeof listSetAsides>>[number]

function PayoutsPage() {
  const { payouts, rules } = Route.useLoaderData()
  const { ruleId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Payout | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Arriving from a rule card ("Record a payout") opens the form preselected.
  useEffect(() => {
    if (ruleId && rules.some((r) => r.id === ruleId)) setAdding(true)
  }, [ruleId, rules])

  function closeAdd() {
    setAdding(false)
    if (ruleId) navigate({ search: {}, replace: true })
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deletePayout({ data: { id: deleting.id } })
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
        title="Payouts"
        description="Money you moved out of a set-aside bucket: the tax payment, the transfer to savings."
        actions={
          rules.length > 0 && (
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>
              Record payout
            </Button>
          )
        }
      />

      <Card>
        {rules.length === 0 ? (
          <EmptyState
            icon={<IconSend size={18} />}
            title="Create a set-aside rule first"
            body="Payouts come out of a set-aside bucket, so you need at least one rule."
            action={
              <Link to="/app/finance/set-asides" className={buttonClass('secondary', 'sm')}>
                Go to set-asides
              </Link>
            }
          />
        ) : payouts.length === 0 ? (
          <EmptyState
            icon={<IconSend size={18} />}
            title="No payouts yet"
            body="When you pay your taxes or move savings, record it here to bring that bucket's balance down."
            action={
              <Button variant="secondary" size="sm" icon={<IconPlus />} onClick={() => setAdding(true)}>
                Record payout
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {payouts.map((p) => (
              <li key={p.id} className="flex gap-3 px-4 py-3">
                <span className="w-12 shrink-0 pt-px text-[13px] text-fg-muted tnum">{formatDay(p.paidOn)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="truncate text-sm font-medium">{p.rule.name}</p>
                    <Money minor={p.amountMinor} currency={p.currency} className="text-sm font-semibold" />
                  </div>
                  {p.note && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">{p.note}</p>}
                </div>
                {/* Same width as the edit + delete pair on incomes/expenses so amounts line up across pages. */}
                <div className="-mr-1.5 flex w-[66px] shrink-0 items-start justify-end">
                  <IconButton
                    aria-label="Delete payout"
                    onClick={() => {
                      setDeleteError(null)
                      setDeleting(p)
                    }}
                    icon={<IconTrash />}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={adding} onClose={closeAdd} title="Record payout">
        <PayoutForm rules={rules} initialRuleId={ruleId} onDone={closeAdd} />
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title="Delete this payout?"
        body={
          deleting && (
            <>
              {formatMoney(deleting.amountMinor, deleting.currency)} from {deleting.rule.name} on {formatDay(deleting.paidOn)}. The amount goes back into
              the bucket's balance.
            </>
          )
        }
      />
    </>
  )
}

function PayoutForm({ rules, initialRuleId, onDone }: { rules: Rule[]; initialRuleId?: string; onDone: () => void }) {
  const app = useApp()
  const router = useRouter()
  const [ruleId, setRuleId] = useState(initialRuleId && rules.some((r) => r.id === initialRuleId) ? initialRuleId : (rules[0]?.id ?? ''))
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(app.personalCurrency)
  const [paidOn, setPaidOn] = useState(todayISO())
  const [note, setNote] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const rule = rules.find((r) => r.id === ruleId)
  const balance = rule?.balances[currency]?.balance ?? 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!ruleId) {
      setError('Pick a set-aside bucket.')
      return
    }
    let amountMinor: number
    try {
      amountMinor = parseMoney(amount, currency)
      if (amountMinor <= 0) throw new Error('Enter an amount above zero.')
    } catch (err) {
      setAmountError(amount.trim() ? errorMessage(err) : 'Enter an amount.')
      return
    }
    setAmountError(null)
    setPending(true)
    try {
      await createPayout({ data: { ruleId, amountMinor, currency, paidOn, note: note.trim() } })
      await router.invalidate()
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the payout.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="From bucket" htmlFor="po-rule">
        <Select id="po-rule" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field
          label="Amount"
          htmlFor="po-amount"
          error={amountError}
          hint={
            <>
              Available in {currency}: <span className="tnum">{formatMoney(balance, currency)}</span>
            </>
          }
        >
          <Input
            id="po-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!amountError}
            className="tnum"
          />
        </Field>
        <Field label="Currency" htmlFor="po-currency">
          <CurrencySelect id="po-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
      </div>
      <Field label="Paid on" htmlFor="po-date">
        <Input id="po-date" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </Field>
      <Field label="Note" htmlFor="po-note">
        <Textarea id="po-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} placeholder="Q3 estimated tax" />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Record payout
        </Button>
      </ModalActions>
    </form>
  )
}
