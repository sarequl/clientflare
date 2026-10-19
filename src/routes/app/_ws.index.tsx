import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { getFinanceSummary, listSetAsides } from '#/features/finance/server'
import { currentMonth, formatPercentBp, monthLabel, monthSearchSchema } from '#/lib/format'
import { Card, CardHeader, PageHeader } from '#/components/Card'
import { MonthPicker } from '#/components/MonthPicker'
import { Money } from '#/components/Money'
import { EmptyState } from '#/components/EmptyState'
import { buttonClass } from '#/components/Button'
import { IconArrowDown, IconArrowUp, IconBolt, IconPiggy, IconUsers } from '#/components/icons'
import { useApp } from '#/components/useApp'

export const Route = createFileRoute('/app/_ws/')({
  validateSearch: (search: Record<string, unknown>) => monthSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ deps }) => {
    const month = deps.month ?? currentMonth()
    const [summary, setAsides] = await Promise.all([getFinanceSummary({ data: { month } }), listSetAsides()])
    return { month, summary, setAsides }
  },
  head: () => ({ meta: [{ title: 'Dashboard · Clientflare' }] }),
  component: Dashboard,
})

function Dashboard() {
  const { month, summary, setAsides } = Route.useLoaderData()
  const app = useApp()
  const navigate = useNavigate({ from: Route.fullPath })

  const currencies = Array.from(new Set([...summary.income.map((r) => r.currency), ...summary.expense.map((r) => r.currency)])).sort()
  const incomeBy = Object.fromEntries(summary.income.map((r) => [r.currency, r]))
  const expenseBy = Object.fromEntries(summary.expense.map((r) => [r.currency, r]))
  const firstName = app.user.name.split(' ')[0]

  const balances = setAsides.flatMap((r) =>
    Object.entries(r.balances).map(([currency, b]) => ({ rule: r, currency, ...b })),
  )

  return (
    <>
      <PageHeader
        title={firstName ? `Hi, ${firstName}` : 'Dashboard'}
        description={`${app.workspace.name} · ${monthLabel(month)}`}
        actions={<MonthPicker month={month} onChange={(m) => navigate({ search: { month: m } })} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link to="/app/finance/incomes" search={{ month, add: true }} className={buttonClass('secondary', 'md')}>
          <IconArrowDown /> Add income
        </Link>
        <Link to="/app/finance/expenses" search={{ month, add: true }} className={buttonClass('secondary', 'md')}>
          <IconArrowUp /> Add expense
        </Link>
        <Link to="/app/contacts" search={{ new: true }} className={buttonClass('secondary', 'md')}>
          <IconUsers /> New contact
        </Link>
        <Link to="/app/quick" className={buttonClass('primary', 'md')}>
          <IconBolt /> Quick add
        </Link>
      </div>

      <section aria-label="This month" className="mb-6">
        {currencies.length === 0 ? (
          <Card>
            <EmptyState
              title={`Nothing recorded in ${monthLabel(month)}`}
              body="Income and expenses you add for this month will show up here, totalled per currency."
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currencies.map((c) => {
              const inc = incomeBy[c]
              const exp = expenseBy[c]
              const net = (inc?.total ?? 0) - (exp?.total ?? 0)
              return (
                <Card key={c} className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-semibold tracking-wide text-fg-subtle">{c}</span>
                    <span className="text-[12px] text-fg-subtle">
                      {(inc?.count ?? 0) + (exp?.count ?? 0)} entries
                    </span>
                  </div>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-fg-muted">Income</dt>
                      <dd><Money minor={inc?.total ?? 0} currency={c} className="font-medium" /></dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-fg-muted">Expenses</dt>
                      <dd><Money minor={exp?.total ?? 0} currency={c} /></dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                      <dt className="font-medium">Net</dt>
                      <dd>
                        <Money
                          minor={Math.abs(net)}
                          currency={c}
                          sign={net < 0 ? '-' : undefined}
                          className={`text-base font-semibold ${net < 0 ? 'text-danger' : ''}`}
                        />
                      </dd>
                    </div>
                  </dl>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeader
          title="Set-aside balances"
          description="Your personal buckets across all workspaces. Only you see these."
          actions={
            <Link to="/app/finance/set-asides" className={buttonClass('ghost', 'sm')}>
              Manage
            </Link>
          }
        />
        {setAsides.length === 0 ? (
          <EmptyState
            icon={<IconPiggy size={18} />}
            title="No set-aside rules yet"
            body="Rules like “Tax 20%” put part of every income aside automatically."
            action={
              <Link to="/app/finance/set-asides" className={buttonClass('secondary', 'sm')}>
                Create a rule
              </Link>
            }
          />
        ) : balances.length === 0 ? (
          <ul className="divide-y divide-border">
            {setAsides.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  {r.name} <span className="text-fg-subtle">{formatPercentBp(r.percentBp)}</span>
                </span>
                <span className="text-fg-subtle">Nothing allocated yet</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-border">
            {balances.map((b) => (
              <li key={`${b.rule.id}-${b.currency}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{b.rule.name}</span>{' '}
                  <span className="text-fg-subtle">{formatPercentBp(b.rule.percentBp)}</span>
                  {!b.rule.active && <span className="ml-1.5 text-[12px] text-fg-subtle">(paused)</span>}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="hidden text-[12px] text-fg-subtle sm:inline">
                    <Money minor={b.allocated} currency={b.currency} /> in · <Money minor={b.paidOut} currency={b.currency} /> out
                  </span>
                  <Money minor={b.balance} currency={b.currency} className="font-semibold" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
