import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { createIncome, deleteIncome, listIncomes, listSetAsides, updateIncome } from '#/features/finance/server'
import { formatMoney, parseMoney } from '#/lib/money'
import { currentMonth, errorMessage, minorToInput, formatDay, formatPercentBp, monthLabel, monthSearchSchema, todayISO } from '#/lib/format'
import { Badge, Card, Notice, PageHeader } from '#/components/Card'
import { Button, IconButton } from '#/components/Button'
import { Checkbox, CurrencySelect, Field, Input, Textarea } from '#/components/Field'
import { ConfirmDialog, Modal, ModalActions } from '#/components/Modal'
import { MonthPicker } from '#/components/MonthPicker'
import { Money } from '#/components/Money'
import { EmptyState } from '#/components/EmptyState'
import { CurrencyTotals } from '#/components/CurrencyTotals'
import { IconArrowDown, IconPencil, IconPlus, IconTrash } from '#/components/icons'
import { useApp } from '#/components/useApp'

const searchSchema = monthSearchSchema.extend({ add: z.boolean().optional().catch(undefined) })

export const Route = createFileRoute('/app/_ws/finance/incomes')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ deps }) => {
    const month = deps.month ?? currentMonth()
    const [incomes, rules] = await Promise.all([listIncomes({ data: { month } }), listSetAsides()])
    return { month, incomes, rules: rules.map((r) => ({ id: r.id, name: r.name, percentBp: r.percentBp, active: r.active })) }
  },
  head: () => ({ meta: [{ title: 'Incomes · Clientflare' }] }),
  component: IncomesPage,
})

type Income = Awaited<ReturnType<typeof listIncomes>>[number]
type Rule = { id: string; name: string; percentBp: number; active: boolean }
type Created = { amountMinor: number; currency: string; receivedOn: string; lines: { name: string; percentBp: number; amountMinor: number }[] }

function IncomesPage() {
  const { month, incomes, rules } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Income | null>(null)
  const [deleting, setDeleting] = useState<Income | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)

  useEffect(() => {
    if (search.add) {
      setAdding(true)
      navigate({ search: { month: search.month }, replace: true })
    }
  }, [search.add, search.month, navigate])

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteIncome({ data: { id: deleting.id } })
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
        title="Incomes"
        description="Money in for this workspace."
        actions={
          <>
            <MonthPicker month={month} onChange={(m) => navigate({ search: { month: m } })} />
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>
              Add income
            </Button>
          </>
        }
      />

      {created && (
        <div className="mb-4">
          <Notice tone="accent" onDismiss={() => setCreated(null)}>
            <p className="font-medium">
              Recorded {formatMoney(created.amountMinor, created.currency)}
              {created.receivedOn.slice(0, 7) !== month && ` in ${monthLabel(created.receivedOn.slice(0, 7))}`}.
            </p>
            {created.lines.length > 0 ? (
              <p className="mt-0.5">
                Set aside:{' '}
                {created.lines.map((l, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {i > 0 && ' · '}
                    {l.name} {formatPercentBp(l.percentBp)} → <span className="tnum font-medium">{formatMoney(l.amountMinor, created.currency)}</span>
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-0.5 opacity-80">No set-aside rules applied.</p>
            )}
          </Notice>
        </div>
      )}

      <Card>
        {incomes.length === 0 ? (
          <EmptyState
            icon={<IconArrowDown size={18} />}
            title={`No income in ${monthLabel(month)}`}
            body="Record payments as they land. Your set-aside rules split each one automatically."
            action={
              <Button variant="secondary" size="sm" icon={<IconPlus />} onClick={() => setAdding(true)}>
                Add income
              </Button>
            }
          />
        ) : (
          <>
            <CurrencyTotals label="Total" rows={incomes} />
            <ul className="divide-y divide-border">
              {incomes.map((inc) => (
                <li key={inc.id} className="flex gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 pt-px text-[13px] text-fg-muted tnum">{formatDay(inc.receivedOn)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {inc.clientName || <span className="text-fg-muted">No client</span>}
                        {inc.source && <span className="font-normal text-fg-muted"> · {inc.source}</span>}
                      </p>
                      <Money minor={inc.amountMinor} currency={inc.currency} className="text-sm font-semibold" />
                    </div>
                    {inc.note && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">{inc.note}</p>}
                    {inc.allocations.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {inc.allocations.map((a) => (
                          <Badge key={a.id} tone="accent">
                            {a.name} <span className="tnum">{formatMoney(a.amountMinor, inc.currency)}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="-mr-1.5 flex shrink-0 items-start gap-0.5">
                    <IconButton aria-label="Edit income" onClick={() => setEditing(inc)} icon={<IconPencil />} />
                    <IconButton
                      aria-label="Delete income"
                      onClick={() => {
                        setDeleteError(null)
                        setDeleting(inc)
                      }}
                      icon={<IconTrash />}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add income">
        <IncomeForm
          rules={rules}
          onCancel={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false)
            if (c) setCreated(c)
          }}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit income">
        {editing && <IncomeForm rules={rules} income={editing} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title="Delete this income?"
        body={
          deleting && (
            <>
              {formatMoney(deleting.amountMinor, deleting.currency)}
              {deleting.clientName ? ` from ${deleting.clientName}` : ''} on {formatDay(deleting.receivedOn)}. Its set-aside allocations are removed too.
            </>
          )
        }
      />
    </>
  )
}

function IncomeForm({
  rules,
  income,
  onCancel,
  onSaved,
}: {
  rules: Rule[]
  income?: Income
  onCancel: () => void
  onSaved: (created?: Created) => void
}) {
  const app = useApp()
  const router = useRouter()
  const [amount, setAmount] = useState(income ? minorToInput(income.amountMinor, income.currency) : '')
  const [currency, setCurrency] = useState(income?.currency ?? app.workspace.baseCurrency)
  const [receivedOn, setReceivedOn] = useState(income?.receivedOn ?? todayISO())
  const [clientName, setClientName] = useState(income?.clientName ?? '')
  const [source, setSource] = useState(income?.source ?? '')
  const [note, setNote] = useState(income?.note ?? '')
  const [apply, setApply] = useState(true)
  const [amountError, setAmountError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const activeRules = rules.filter((r) => r.active)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
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
    const fields = { amountMinor, currency, receivedOn, clientName: clientName.trim(), source: source.trim(), note: note.trim() }
    try {
      if (income) {
        await updateIncome({ data: { id: income.id, ...fields } })
        await router.invalidate()
        onSaved()
      } else {
        const res = await createIncome({ data: { ...fields, applySetAsides: apply } })
        await router.invalidate()
        const byId = new Map(rules.map((r) => [r.id, r]))
        onSaved({
          amountMinor,
          currency,
          receivedOn,
          lines: res.allocations.map((a) => ({
            name: byId.get(a.ruleId)?.name ?? 'Rule',
            percentBp: byId.get(a.ruleId)?.percentBp ?? 0,
            amountMinor: a.amountMinor,
          })),
        })
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the income.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Amount" htmlFor="inc-amount" error={amountError}>
          <Input
            id="inc-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!amountError}
            className="tnum"
          />
        </Field>
        <Field label="Currency" htmlFor="inc-currency">
          <CurrencySelect id="inc-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
      </div>
      <Field label="Received on" htmlFor="inc-date">
        <Input id="inc-date" type="date" required value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client" htmlFor="inc-client">
          <Input id="inc-client" value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={120} placeholder="Optional" />
        </Field>
        <Field label="Source" htmlFor="inc-source">
          <Input id="inc-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} placeholder="Bank transfer, Stripe…" />
        </Field>
      </div>
      <Field label="Note" htmlFor="inc-note">
        <Textarea id="inc-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} />
      </Field>
      {!income ? (
        <Checkbox
          id="inc-apply"
          checked={apply}
          onChange={(e) => setApply(e.target.checked)}
          label="Apply set-aside rules"
          hint={
            activeRules.length
              ? activeRules.map((r) => `${r.name} ${formatPercentBp(r.percentBp)}`).join(' · ')
              : 'You have no active rules, so nothing will be set aside.'
          }
        />
      ) : (
        income.allocations.length > 0 && (
          <p className="text-[13px] text-fg-muted">Changing the amount rescales this income's set-asides at their original percentages.</p>
        )
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {income ? 'Save changes' : 'Add income'}
        </Button>
      </ModalActions>
    </form>
  )
}
