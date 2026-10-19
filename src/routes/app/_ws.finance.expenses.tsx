import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { createExpense, deleteExpense, listExpenses, updateExpense } from '#/features/finance/server'
import { formatMoney, parseMoney } from '#/lib/money'
import { currentMonth, errorMessage, formatDay, minorToInput, monthLabel, monthSearchSchema, todayISO } from '#/lib/format'
import { Badge, Card, Notice, PageHeader } from '#/components/Card'
import { Button, IconButton } from '#/components/Button'
import { CurrencySelect, Field, Input, Textarea } from '#/components/Field'
import { ConfirmDialog, Modal, ModalActions } from '#/components/Modal'
import { MonthPicker } from '#/components/MonthPicker'
import { Money } from '#/components/Money'
import { EmptyState } from '#/components/EmptyState'
import { CurrencyTotals } from '#/components/CurrencyTotals'
import { IconArrowUp, IconPencil, IconPlus, IconTrash } from '#/components/icons'
import { useApp } from '#/components/useApp'

const searchSchema = monthSearchSchema.extend({ add: z.boolean().optional().catch(undefined) })

const DEFAULT_CATEGORIES = ['Software', 'Hardware', 'Contractors', 'Travel', 'Office', 'Fees', 'Marketing', 'Taxes']

export const Route = createFileRoute('/app/_ws/finance/expenses')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ deps }) => {
    const month = deps.month ?? currentMonth()
    const expenses = await listExpenses({ data: { month } })
    return { month, expenses }
  },
  head: () => ({ meta: [{ title: 'Expenses · Clientflare' }] }),
  component: ExpensesPage,
})

type Expense = Awaited<ReturnType<typeof listExpenses>>[number]

function ExpensesPage() {
  const { month, expenses } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const categories = Array.from(new Set([...expenses.map((e) => e.category).filter((c): c is string => !!c), ...DEFAULT_CATEGORIES]))

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
      await deleteExpense({ data: { id: deleting.id } })
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
        title="Expenses"
        description="Money out for this workspace."
        actions={
          <>
            <MonthPicker month={month} onChange={(m) => navigate({ search: { month: m } })} />
            <Button variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>
              Add expense
            </Button>
          </>
        }
      />

      <Card>
        {expenses.length === 0 ? (
          <EmptyState
            icon={<IconArrowUp size={18} />}
            title={`No expenses in ${monthLabel(month)}`}
            body="Log subscriptions, contractors and the rest so the dashboard shows a real net."
            action={
              <Button variant="secondary" size="sm" icon={<IconPlus />} onClick={() => setAdding(true)}>
                Add expense
              </Button>
            }
          />
        ) : (
          <>
            <CurrencyTotals label="Total" rows={expenses} />
            <ul className="divide-y divide-border">
              {expenses.map((exp) => (
                <li key={exp.id} className="flex gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 pt-px text-[13px] text-fg-muted tnum">{formatDay(exp.spentOn)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        <span className="truncate">{exp.vendor || <span className="text-fg-muted">No vendor</span>}</span>
                        {exp.category && <Badge>{exp.category}</Badge>}
                      </p>
                      <Money minor={exp.amountMinor} currency={exp.currency} className="text-sm font-semibold" />
                    </div>
                    {exp.note && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">{exp.note}</p>}
                  </div>
                  <div className="-mr-1.5 flex shrink-0 items-start gap-0.5">
                    <IconButton aria-label="Edit expense" onClick={() => setEditing(exp)} icon={<IconPencil />} />
                    <IconButton
                      aria-label="Delete expense"
                      onClick={() => {
                        setDeleteError(null)
                        setDeleting(exp)
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

      <Modal open={adding} onClose={() => setAdding(false)} title="Add expense">
        <ExpenseForm categories={categories} onDone={() => setAdding(false)} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit expense">
        {editing && <ExpenseForm categories={categories} expense={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title="Delete this expense?"
        body={
          deleting && (
            <>
              {formatMoney(deleting.amountMinor, deleting.currency)}
              {deleting.vendor ? ` to ${deleting.vendor}` : ''} on {formatDay(deleting.spentOn)}.
            </>
          )
        }
      />
    </>
  )
}

function ExpenseForm({ categories, expense, onDone }: { categories: string[]; expense?: Expense; onDone: () => void }) {
  const app = useApp()
  const router = useRouter()
  const [amount, setAmount] = useState(expense ? minorToInput(expense.amountMinor, expense.currency) : '')
  const [currency, setCurrency] = useState(expense?.currency ?? app.workspace.baseCurrency)
  const [spentOn, setSpentOn] = useState(expense?.spentOn ?? todayISO())
  const [category, setCategory] = useState(expense?.category ?? '')
  const [vendor, setVendor] = useState(expense?.vendor ?? '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
    const fields = { amountMinor, currency, spentOn, category: category.trim(), vendor: vendor.trim(), note: note.trim() }
    try {
      if (expense) await updateExpense({ data: { id: expense.id, ...fields } })
      else await createExpense({ data: fields })
      await router.invalidate()
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the expense.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Amount" htmlFor="exp-amount" error={amountError}>
          <Input
            id="exp-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!amountError}
            className="tnum"
          />
        </Field>
        <Field label="Currency" htmlFor="exp-currency">
          <CurrencySelect id="exp-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </Field>
      </div>
      <Field label="Spent on" htmlFor="exp-date">
        <Input id="exp-date" type="date" required value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vendor" htmlFor="exp-vendor">
          <Input id="exp-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} placeholder="Optional" />
        </Field>
        <Field label="Category" htmlFor="exp-category">
          <Input id="exp-category" list="exp-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="Optional" />
          <datalist id="exp-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Note" htmlFor="exp-note">
        <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </ModalActions>
    </form>
  )
}
