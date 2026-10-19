import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { getFinanceSummary, listSetAsides } from '#/features/finance/server'
import { getInvoiceStats } from '#/features/invoices/server'
import { getPipelineSummary } from '#/features/deals/server'
import { getTaskCounts } from '#/features/tasks/server'
import { currentMonth, formatPercentBp, monthLabel, monthSearchSchema } from '#/lib/format'
import { Card, CardHeader, PageHeader } from '#/components/Card'
import { MonthPicker } from '#/components/MonthPicker'
import { Money } from '#/components/Money'
import { EmptyState } from '#/components/EmptyState'
import { buttonClass } from '#/components/Button'
import { IconArrowDown, IconArrowUp, IconBolt, IconPiggy, IconUsers } from '#/components/icons'
import { IconBriefcase, IconCheckSquare, IconInvoice } from '#/components/icons-invoice'
import { useApp } from '#/components/useApp'

export const Route = createFileRoute('/app/_ws/')({
  beforeLoad: ({ context }) => {
    // First-run wizard. Only the dashboard redirects so every other page stays reachable.
    if (!context.app.setupDone) throw redirect({ to: '/app/setup' })
  },
  validateSearch: (search: Record<string, unknown>) => monthSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ deps }) => {
    const month = deps.month ?? currentMonth()
    const [summary, setAsides, invoiceStats, pipeline, tasks] = await Promise.all([
      getFinanceSummary({ data: { month } }),
      listSetAsides(),
      getInvoiceStats(),
      getPipelineSummary(),
      getTaskCounts(),
    ])
    return { month, summary, setAsides, invoiceStats, pipeline, tasks }
  },
  head: () => ({ meta: [{ title: 'Dashboard · Clientflare' }] }),
  component: Dashboard,
})

function Dashboard() {
  const { month, summary, setAsides, invoiceStats, pipeline, tasks } = Route.useLoaderData()
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

      <section aria-label="Work" className="mb-6 grid gap-3 lg:grid-cols-3">
        <InvoicesCard stats={invoiceStats} />
        <PipelineCard pipeline={pipeline} />
        <TasksCard tasks={tasks} />
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

function InvoicesCard({ stats }: { stats: Awaited<ReturnType<typeof getInvoiceStats>> }) {
  const outstanding = stats.filter((s) => s.outstanding)
  const overdueCount = stats.reduce((n, s) => n + (s.overdueCount ?? 0), 0)
  const drafts = stats.reduce((n, s) => n + (s.draftCount ?? 0), 0)
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Invoices"
        actions={
          <Link to="/app/invoices" className={buttonClass('ghost', 'sm')}>
            View all
          </Link>
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[12px] text-fg-muted">Outstanding</p>
          {outstanding.length ? (
            outstanding.map((s) => <Money key={s.currency} minor={s.outstanding} currency={s.currency} className="block text-lg font-semibold" />)
          ) : (
            <p className="text-lg font-semibold text-fg-subtle">Nothing owed</p>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <Link to="/app/invoices" search={{ status: 'overdue' }} className={`hover:underline ${overdueCount ? 'font-medium text-danger' : 'text-fg-muted'}`}>
            {overdueCount} overdue
          </Link>
          <Link to="/app/invoices" search={{ status: 'draft' }} className="text-fg-muted hover:underline">
            {drafts} {drafts === 1 ? 'draft' : 'drafts'}
          </Link>
        </div>
        <div className="mt-auto">
          <Link to="/app/invoices" search={{ new: true }} className={buttonClass('secondary', 'sm')}>
            <IconInvoice /> New invoice
          </Link>
        </div>
      </div>
    </Card>
  )
}

function PipelineCard({ pipeline }: { pipeline: Awaited<ReturnType<typeof getPipelineSummary>> }) {
  const stages = new Map<string, { name: string; color: string | null; totals: { currency: string; total: number; count: number }[] }>()
  for (const r of pipeline.byStage) {
    const s = stages.get(r.stageId) ?? { name: r.stageName, color: r.color ?? null, totals: [] }
    if (r.currency) s.totals.push({ currency: r.currency, total: r.total, count: r.count })
    stages.set(r.stageId, s)
  }
  const openByCurrency = new Map<string, number>()
  for (const r of pipeline.byStage) if (r.currency) openByCurrency.set(r.currency, (openByCurrency.get(r.currency) ?? 0) + r.total)

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Pipeline"
        description="Open deal value by stage."
        actions={
          <Link to="/app/deals" className={buttonClass('ghost', 'sm')}>
            Deals
          </Link>
        }
      />
      {stages.size === 0 ? (
        <EmptyState icon={<IconBriefcase size={18} />} title="No open deals" body="Deals you're working on show up here by stage." />
      ) : (
        <div className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap gap-x-3">
            {[...openByCurrency.entries()].map(([c, v]) => (
              <Money key={c} minor={v} currency={c} className="text-lg font-semibold" />
            ))}
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {[...stages.entries()].map(([id, s]) => (
              <li key={id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-fg-muted">{s.name}</span>
                <span className="flex flex-wrap justify-end gap-x-2">
                  {s.totals.map((t) => (
                    <span key={t.currency} className="whitespace-nowrap">
                      <Money minor={t.total} currency={t.currency} className="font-medium" /> <span className="text-[12px] text-fg-subtle">· {t.count}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function TasksCard({ tasks }: { tasks: Awaited<ReturnType<typeof getTaskCounts>> }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Tasks"
        actions={
          <Link to="/app/tasks" className={buttonClass('ghost', 'sm')}>
            View all
          </Link>
        }
      />
      <dl className="grid flex-1 grid-cols-3 gap-2 p-4 text-center">
        <div className="rounded-md bg-surface-2 px-2 py-3">
          <dt className="text-[12px] text-fg-muted">Overdue</dt>
          <dd className={`text-lg font-semibold tnum ${tasks.overdue ? 'text-danger' : ''}`}>{tasks.overdue}</dd>
        </div>
        <div className="rounded-md bg-surface-2 px-2 py-3">
          <dt className="text-[12px] text-fg-muted">Due today</dt>
          <dd className="text-lg font-semibold tnum">{tasks.dueToday}</dd>
        </div>
        <div className="rounded-md bg-surface-2 px-2 py-3">
          <dt className="text-[12px] text-fg-muted">Open</dt>
          <dd className="text-lg font-semibold tnum">{tasks.open}</dd>
        </div>
      </dl>
      {tasks.open === 0 && (
        <p className="-mt-2 flex items-center gap-1.5 px-4 pb-4 text-[13px] text-fg-subtle">
          <IconCheckSquare size={14} /> All clear.
        </p>
      )}
    </Card>
  )
}
