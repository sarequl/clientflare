import { useRef, useState, type FormEvent } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { createExpense, createIncome, listSetAsides } from '#/features/finance/server'
import { formatMoney, parseMoney } from '#/lib/money'
import { errorMessage, formatPercentBp, todayISO } from '#/lib/format'
import { Button } from '#/components/Button'
import { CurrencySelect, Input } from '#/components/Field'
import { Notice, PageHeader } from '#/components/Card'
import { IconCheck } from '#/components/icons'
import { useApp } from '#/components/useApp'

export const Route = createFileRoute('/app/_ws/quick')({
  loader: async () => {
    const rules = await listSetAsides()
    return { rules: rules.map((r) => ({ id: r.id, name: r.name, percentBp: r.percentBp })) }
  },
  head: () => ({ meta: [{ title: 'Quick add · Clientflare' }] }),
  component: QuickAdd,
})

type Kind = 'income' | 'expense'

function QuickAdd() {
  const app = useApp()
  const { rules } = Route.useLoaderData()
  const router = useRouter()
  const amountRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<Kind>('income')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(app.workspace.baseCurrency)
  const [party, setParty] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ text: string; detail?: string } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    let amountMinor: number
    try {
      amountMinor = parseMoney(amount, currency)
      if (amountMinor <= 0) throw new Error('Enter an amount above zero.')
    } catch (err) {
      setError(amount.trim() ? errorMessage(err) : 'Enter an amount.')
      amountRef.current?.focus()
      return
    }
    setPending(true)
    const today = todayISO()
    const who = party.trim()
    try {
      if (kind === 'income') {
        const res = await createIncome({ data: { amountMinor, currency, receivedOn: today, clientName: who, applySetAsides: true } })
        const byId = new Map(rules.map((r) => [r.id, r]))
        const detail = res.allocations
          .map((a) => {
            const r = byId.get(a.ruleId)
            return `${r?.name ?? 'Rule'} ${r ? formatPercentBp(r.percentBp) : ''} → ${formatMoney(a.amountMinor, currency)}`
          })
          .join(' · ')
        setDone({ text: `Income of ${formatMoney(amountMinor, currency)} saved${who ? ` from ${who}` : ''}.`, detail: detail ? `Set aside: ${detail}` : undefined })
      } else {
        await createExpense({ data: { amountMinor, currency, spentOn: today, vendor: who } })
        setDone({ text: `Expense of ${formatMoney(amountMinor, currency)} saved${who ? ` to ${who}` : ''}.` })
      }
      setAmount('')
      setParty('')
      await router.invalidate()
      amountRef.current?.focus()
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    } finally {
      setPending(false)
    }
  }

  const tabBase = 'flex-1 h-10 rounded-md text-sm font-medium transition-colors'

  return (
    <div className="flex w-full max-w-md flex-col">
      <PageHeader title="Quick add" description="Log income or an expense for today." />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div role="radiogroup" aria-label="Type" className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {(['income', 'expense'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`${tabBase} ${kind === k ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
            >
              {k === 'income' ? 'Income' : 'Expense'}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 pt-5 pb-4">
          <label htmlFor="q-amount" className="block text-center text-[13px] text-fg-muted">
            {kind === 'income' ? 'Amount received' : 'Amount spent'}
          </label>
          <input
            id="q-amount"
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            autoFocus
            className="mt-1 w-full bg-transparent text-center text-5xl font-semibold tracking-tight tnum placeholder:text-fg-subtle/60 focus-visible:outline-none"
          />
          <div className="mx-auto mt-3 w-28">
            <CurrencySelect id="q-currency" aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="text-center" />
          </div>
        </div>

        <div>
          <label htmlFor="q-party" className="sr-only">
            {kind === 'income' ? 'Client' : 'Vendor'}
          </label>
          <Input
            id="q-party"
            value={party}
            onChange={(e) => setParty(e.target.value)}
            maxLength={120}
            placeholder={kind === 'income' ? 'Client (optional)' : 'Vendor (optional)'}
            className="h-11"
          />
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        <Button type="submit" variant="primary" size="lg" pending={pending} className="w-full">
          Save {kind}
        </Button>

        {done && (
          <Notice tone="accent" onDismiss={() => setDone(null)}>
            <p className="flex items-center gap-1.5 font-medium">
              <IconCheck /> {done.text}
            </p>
            {done.detail && <p className="mt-0.5 tnum">{done.detail}</p>}
          </Notice>
        )}

        <p className="text-center text-[13px] text-fg-muted">
          Dated today in {app.workspace.name}.{' '}
          <Link to={kind === 'income' ? '/app/finance/incomes' : '/app/finance/expenses'} className="text-accent hover:underline">
            See all {kind === 'income' ? 'incomes' : 'expenses'}
          </Link>
        </p>
      </form>
    </div>
  )
}
