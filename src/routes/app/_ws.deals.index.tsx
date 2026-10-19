import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { getBoard, listDeals, moveDeal } from '#/features/deals/server'
import { listTags } from '#/features/tags/server'
import { listFields } from '#/features/custom-fields/server'
import { listMembers } from '#/features/workspaces/server'
import { errorMessage, formatDay, formatDayAt } from '#/lib/format'
import { formatMoney } from '#/lib/money'
import { Card, Notice, PageHeader } from '#/components/Card'
import { Button, buttonClass } from '#/components/Button'
import { Select, Switch } from '#/components/Field'
import { Modal } from '#/components/Modal'
import { EmptyState } from '#/components/EmptyState'
import { SearchInput } from '#/components/SearchInput'
import { Pagination } from '#/components/Pagination'
import { Money } from '#/components/Money'
import { Avatar } from '#/components/Avatar'
import { TagChip, TagDot, TagList } from '#/components/TagChip'
import { DealForm, type StageOption } from '#/components/DealForm'
import { LostReasonModal } from '#/components/LostReasonModal'
import { useApp } from '#/components/useApp'
import { IconCalendar, IconDots, IconPlus } from '#/components/icons'
import { IconHandshake, IconKanban, IconTable } from '#/components/icons2'

const VIEW_KEY = 'clientflare.deals.view'

const searchSchema = z.object({
  view: z.enum(['board', 'table']).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  open: z.boolean().optional().catch(undefined),
  status: z.enum(['open', 'won', 'lost']).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(['updated', 'value', 'close']).optional().catch(undefined),
  new: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/app/_ws/deals/')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ view: search.view, q: search.q, open: search.open, status: search.status, page: search.page, sort: search.sort }),
  loader: async ({ deps }) => {
    const q = deps.q || undefined
    const [data, tags, fields, members] = await Promise.all([
      deps.view === 'table'
        ? listDeals({ data: { q, status: deps.status, page: deps.page ?? 1, sort: deps.sort ?? 'updated' } }).then((list) => ({ mode: 'table' as const, list }))
        : getBoard({ data: { q, openOnly: !!deps.open } }).then((board) => ({ mode: 'board' as const, board })),
      listTags(),
      listFields({ data: { recordType: 'deal' } }),
      listMembers(),
    ])
    return { data, tags, fields, members: members.members.map((m) => ({ userId: m.userId, name: m.name })) }
  },
  head: () => ({ meta: [{ title: 'Deals · Clientflare' }] }),
  component: DealsPage,
})

type BoardData = Awaited<ReturnType<typeof getBoard>>
type BoardStage = BoardData['stages'][number]
type BoardDeal = BoardStage['deals'][number]
type TableData = Awaited<ReturnType<typeof listDeals>>

function DealsPage() {
  const { data, tags, fields, members } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [creating, setCreating] = useState(false)
  const view = search.view ?? 'board'

  useEffect(() => {
    if (search.new) {
      setCreating(true)
      navigate({ search: (s) => ({ ...s, new: undefined }), replace: true })
    }
  }, [search.new, navigate])

  // Restore the last view when the URL does not say.
  useEffect(() => {
    if (search.view) return
    let saved: string | null = null
    try {
      saved = localStorage.getItem(VIEW_KEY)
    } catch {
      /* storage blocked */
    }
    if (saved === 'table') navigate({ search: (s) => ({ ...s, view: 'table' }), replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setView(next: 'board' | 'table') {
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* storage blocked */
    }
    navigate({ search: (s) => ({ q: s.q, view: next, open: next === 'board' ? s.open : undefined }) })
  }

  const stages: StageOption[] = (data.mode === 'board' ? data.board.stages : data.list.stages).map((s) => ({ id: s.id, name: s.name, kind: s.kind }))

  return (
    <>
      <PageHeader
        title="Deals"
        description="Work in progress, from first contact to signed."
        actions={
          <>
            <ViewToggle value={view} onChange={setView} />
            <Button variant="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>
              New deal
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search.q ?? ''}
          onChange={(q) => navigate({ search: (s) => ({ ...s, q: q || undefined, page: undefined }), replace: true })}
          placeholder="Search title, contact, company"
          label="Search deals"
          className="sm:flex-1"
        />
        {view === 'board' ? (
          <div className="sm:pl-2">
            <Switch id="deals-hide-closed" checked={!!search.open} onChange={(on) => navigate({ search: (s) => ({ ...s, open: on || undefined }), replace: true })} label="Hide closed" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select
              aria-label="Filter by status"
              value={search.status ?? ''}
              onChange={(e) => navigate({ search: (s) => ({ ...s, status: (e.target.value || undefined) as typeof s.status, page: undefined }) })}
              className="sm:w-36"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </Select>
            <Select
              aria-label="Sort"
              value={search.sort ?? 'updated'}
              onChange={(e) => navigate({ search: (s) => ({ ...s, sort: e.target.value === 'updated' ? undefined : (e.target.value as typeof s.sort), page: undefined }) })}
              className="sm:w-40"
            >
              <option value="updated">Recently updated</option>
              <option value="value">Highest value</option>
              <option value="close">Closing soonest</option>
            </Select>
          </div>
        )}
      </div>

      {data.mode === 'board' ? <Board board={data.board} /> : <DealsTable list={data.list} filtered={!!(search.q || search.status)} onNew={() => setCreating(true)} />}

      <Modal open={creating} onClose={() => setCreating(false)} title="New deal">
        <DealForm
          stages={stages}
          fields={fields}
          members={members}
          tags={tags}
          onDone={(id) => {
            setCreating(false)
            if (id && view === 'table') navigate({ to: '/app/deals/$dealId', params: { dealId: id } })
          }}
        />
      </Modal>
    </>
  )
}

function ViewToggle({ value, onChange }: { value: 'board' | 'table'; onChange: (v: 'board' | 'table') => void }) {
  const opts = [
    { v: 'board' as const, label: 'Board', Icon: IconKanban },
    { v: 'table' as const, label: 'Table', Icon: IconTable },
  ]
  return (
    <div role="radiogroup" aria-label="View" className="inline-flex h-9 items-center rounded-md border border-border bg-surface-2 p-0.5">
      {opts.map(({ v, label, Icon }) => (
        <label
          key={v}
          className={`inline-flex h-full cursor-pointer items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${
            value === v ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <input type="radio" name="deals-view" value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
          <Icon size={14} />
          {label}
        </label>
      ))}
    </div>
  )
}

function totalsText(totals: Record<string, number>) {
  const entries = Object.entries(totals).filter(([, v]) => v)
  return entries.length ? entries.map(([c, v]) => formatMoney(v, c)).join(' · ') : null
}

/** Today in the workspace timezone, YYYY-MM-DD. */
function todayInTz(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Move a deal in local board state: out of its column, into `stageId` at `index` (index among the other deals). */
function applyMove(stages: BoardStage[], dealId: string, stageId: string, index: number): BoardStage[] {
  let moved: BoardDeal | undefined
  const without = stages.map((s) => {
    const i = s.deals.findIndex((d) => d.id === dealId)
    if (i === -1) return s
    moved = s.deals[i]
    return { ...s, deals: s.deals.filter((d) => d.id !== dealId) }
  })
  if (!moved) return stages
  return without.map((s) => {
    const list = s.deals.slice()
    if (s.id === stageId) list.splice(Math.min(index, list.length), 0, { ...moved!, stageId, status: s.kind })
    const totals: Record<string, number> = {}
    for (const d of list) totals[d.currency] = (totals[d.currency] ?? 0) + d.valueMinor
    return { ...s, deals: list, totals }
  })
}

function Board({ board }: { board: BoardData }) {
  const app = useApp()
  const router = useRouter()
  const [stages, setStages] = useState(board.stages)
  const [drag, setDrag] = useState<{ id: string; stageId: string; from: number } | null>(null)
  const [drop, setDrop] = useState<{ stageId: string; index: number } | null>(null)
  const [losing, setLosing] = useState<{ deal: BoardDeal; stageId: string; index: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const today = todayInTz(app.workspace.timezone)

  useEffect(() => setStages(board.stages), [board])

  async function move(dealId: string, stageId: string, index: number, lostReason?: string) {
    const prev = stages
    const target = stages.find((s) => s.id === stageId)
    const deal = stages.flatMap((s) => s.deals).find((d) => d.id === dealId)
    setStages(applyMove(stages, dealId, stageId, index))
    setAnnounce(`${deal?.title ?? 'Deal'} moved to ${target?.name ?? 'stage'}`)
    try {
      await moveDeal({ data: { id: dealId, stageId, index, lostReason: lostReason || undefined } })
      await router.invalidate()
    } catch (err) {
      setStages(prev)
      setError(errorMessage(err, 'Could not move the deal.'))
    }
  }

  function requestMove(dealId: string, stageId: string, index: number) {
    const from = stages.find((s) => s.deals.some((d) => d.id === dealId))
    const target = stages.find((s) => s.id === stageId)
    if (!from || !target) return
    const deal = from.deals.find((d) => d.id === dealId)!
    if (from.id === stageId && from.deals.findIndex((d) => d.id === dealId) === index) return
    if (target.kind === 'lost' && from.id !== stageId) setLosing({ deal, stageId, index })
    else void move(dealId, stageId, index)
  }

  function dropIndex(e: DragEvent<HTMLElement>, draggedId: string) {
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-deal-id]')).filter((el) => el.dataset.dealId !== draggedId)
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i]!.getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) return i
    }
    return cards.length
  }

  return (
    <>
      {error && (
        <div className="mb-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {/*
        Full bleed: the scroller spans the whole content area (sidebar edge to viewport edge) while
        its padding keeps the first column in line with the page header. (100cqw - 100%) / 2 is the
        gap between the page column and the content area's edge, on either side. Snapping only
        runs below sm, where that gap is the 16px page gutter, hence the fixed scroll-px-4
        (a % scroll-padding would resolve against the scroller, not the page column).
      */}
      <div className="mx-[calc((100%-100cqw)/2)] snap-x snap-mandatory scroll-px-4 overflow-x-auto px-[calc((100cqw-100%)/2)] pb-3 sm:snap-none">
        <div className="flex w-max gap-3">
          {stages.map((stage) => {
            const target = drop && drop.stageId === stage.id ? drop : null
            const isTarget = !!target
            const noop = (index: number) => drag?.stageId === stage.id && drag.from === index
            const total = totalsText(stage.totals)
            let otherIdx = -1
            const indicator = <div key="__drop" aria-hidden className="h-1 shrink-0 rounded-full bg-accent" />
            return (
              <section
                key={stage.id}
                aria-label={`${stage.name}, ${stage.deals.length} ${stage.deals.length === 1 ? 'deal' : 'deals'}`}
                className={`flex w-[17rem] shrink-0 snap-start flex-col rounded-lg border bg-surface-2/60 transition-colors ${isTarget ? 'border-accent' : 'border-border'}`}
              >
                <header className="border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <TagDot color={stage.color} />
                    <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{stage.name}</h2>
                    <span className="rounded bg-surface-3 px-1.5 text-[12px] font-medium text-fg-muted tnum">{stage.deals.length}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-fg-muted tnum" title={total ?? undefined}>
                    {total ?? <span className="text-fg-subtle">No value</span>}
                  </p>
                </header>
                <div
                  className="flex min-h-28 flex-1 flex-col gap-2 p-2"
                  onDragOver={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    const index = dropIndex(e, drag.id)
                    if (drop?.stageId !== stage.id || drop.index !== index) setDrop({ stageId: stage.id, index })
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.stageId === stage.id ? null : d))
                  }}
                  onDrop={(e) => {
                    if (!drag) return
                    e.preventDefault()
                    const index = dropIndex(e, drag.id)
                    setDrop(null)
                    setDrag(null)
                    requestMove(drag.id, stage.id, index)
                  }}
                >
                  {stage.deals.map((deal, i) => {
                    const dragged = drag?.id === deal.id
                    if (!dragged) otherIdx++
                    const showIndicator = !!target && !dragged && target.index === otherIdx && !noop(target.index)
                    return (
                      <FragmentWith key={deal.id} before={showIndicator ? indicator : null}>
                        <DealCard
                          deal={deal}
                          today={today}
                          dragging={dragged}
                          stages={stages}
                          positionInStage={i}
                          stageCount={stage.deals.length}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', deal.id)
                            e.dataTransfer.effectAllowed = 'move'
                            requestAnimationFrame(() => setDrag({ id: deal.id, stageId: stage.id, from: i }))
                          }}
                          onDragEnd={() => {
                            setDrag(null)
                            setDrop(null)
                          }}
                          onMove={(stageId, index) => requestMove(deal.id, stageId, index)}
                        />
                      </FragmentWith>
                    )
                  })}
                  {target && target.index === otherIdx + 1 && !noop(target.index) && indicator}
                  {stage.deals.length === 0 && !isTarget && (
                    <p className="grid flex-1 place-items-center rounded-md border border-dashed border-border-strong px-2 py-6 text-center text-[12px] text-fg-subtle">No deals</p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <LostReasonModal
        deal={losing?.deal ?? null}
        onClose={() => setLosing(null)}
        onConfirm={(reason) => {
          if (!losing) return
          const l = losing
          setLosing(null)
          void move(l.deal.id, l.stageId, l.index, reason)
        }}
      />
    </>
  )
}

function FragmentWith({ before, children }: { before: ReactNode; children: ReactNode }) {
  return (
    <>
      {before}
      {children}
    </>
  )
}

function DealCard({
  deal,
  today,
  dragging,
  stages,
  positionInStage,
  stageCount,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  deal: BoardDeal
  today: string
  dragging: boolean
  stages: BoardStage[]
  positionInStage: number
  stageCount: number
  onDragStart: (e: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onMove: (stageId: string, index: number) => void
}) {
  const party = [deal.companyName, deal.contactName].filter(Boolean).join(' · ')
  const late = deal.status === 'open' && !!deal.expectedCloseOn && deal.expectedCloseOn < today
  const items: MenuEntry[] = [
    ...(positionInStage > 0 ? [{ label: 'Move up', onSelect: () => onMove(deal.stageId, positionInStage - 1) }] : []),
    ...(positionInStage < stageCount - 1 ? [{ label: 'Move down', onSelect: () => onMove(deal.stageId, positionInStage + 1) }] : []),
    ...stages
      .filter((s) => s.id !== deal.stageId)
      .map((s) => ({ label: s.name, color: s.color, group: 'Move to', onSelect: () => onMove(s.id, 0) })),
  ]
  return (
    <article
      data-deal-id={deal.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative cursor-grab rounded-md border border-border bg-surface p-2.5 shadow-sm transition-[opacity,border-color] hover:border-border-strong active:cursor-grabbing ${
        dragging ? 'opacity-40' : ''
      } ${deal.status !== 'open' ? 'bg-surface/70' : ''}`}
    >
      <div className="flex items-start gap-1">
        <Link
          to="/app/deals/$dealId"
          params={{ dealId: deal.id }}
          draggable={false}
          className="min-w-0 flex-1 text-sm leading-snug font-medium break-words after:absolute after:inset-0 after:rounded-md hover:underline"
        >
          {deal.title}
        </Link>
        <div className="relative z-10 -mt-1 -mr-1">
          <CardMenu label={`Move ${deal.title}`} items={items} />
        </div>
      </div>
      {party && <p className="mt-0.5 truncate text-[12px] text-fg-muted">{party}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Money minor={deal.valueMinor} currency={deal.currency} className="text-[13px] font-medium" />
        <span className="flex min-w-0 items-center gap-1.5">
          {deal.expectedCloseOn && (
            <span className={`inline-flex items-center gap-1 text-[12px] tnum ${late ? 'text-danger' : 'text-fg-muted'}`} title={late ? 'Expected close date has passed' : 'Expected close'}>
              <IconCalendar size={12} />
              {formatDay(deal.expectedCloseOn)}
            </span>
          )}
          <Avatar name={deal.ownerName} size="xs" />
        </span>
      </div>
      {deal.tags.length > 0 && (
        <div className="mt-1.5">
          <TagList tags={deal.tags} max={2} />
        </div>
      )}
    </article>
  )
}

type MenuEntry = { label: string; onSelect: () => void; color?: string; group?: string }

/**
 * Card overflow menu rendered in a portal with fixed positioning, so the board's
 * horizontal scroll container never clips it. Arrow keys move, Escape closes.
 */
function CardMenu({ label, items }: { label: string; items: MenuEntry[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const width = 200
    const height = panel.current?.offsetHeight ?? 240
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
    const below = r.bottom + 4
    const top = below + height > window.innerHeight - 8 && r.top - height - 4 > 8 ? r.top - height - 4 : below
    setPos({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    const close = () => setOpen(false)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open, pos])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const list = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])
    const i = list.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    list[next]?.focus()
  }

  const item = 'flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none'
  let lastGroup: string | undefined

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title="Move to…"
        onClick={() => setOpen((o) => !o)}
        className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
      >
        <IconDots />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: 200 }}
            className="z-50 max-h-[60dvh] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-pop anim-fade"
          >
            {items.map((it) => {
              const heading = it.group && it.group !== lastGroup ? it.group : null
              lastGroup = it.group
              return (
                <div key={it.label + (it.group ?? '')}>
                  {heading && <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{heading}…</p>}
                  <button
                    type="button"
                    role="menuitem"
                    className={item}
                    onClick={() => {
                      setOpen(false)
                      trigger.current?.focus()
                      it.onSelect()
                    }}
                  >
                    {it.color && <TagDot color={it.color} />}
                    <span className="truncate">{it.label}</span>
                  </button>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}


function DealsTable({ list, filtered, onNew }: { list: TableData; filtered: boolean; onNew: () => void }) {
  const app = useApp()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <Card>
      {list.rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<IconHandshake size={18} />}
            title="No deals match"
            body="Try another search or status."
            action={
              <Link to="/app/deals" search={{ view: 'table' }} className={buttonClass('secondary', 'sm')}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<IconHandshake size={18} />}
            title="No deals yet"
            body="Track each piece of potential work from first chat to signed."
            action={
              <Button size="sm" variant="primary" icon={<IconPlus />} onClick={onNew}>
                New deal
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[12px] text-fg-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Title</th>
                  <th scope="col" className="px-3 py-2 font-medium">Stage</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
                  <th scope="col" className="px-3 py-2 font-medium">Contact</th>
                  <th scope="col" className="px-3 py-2 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 font-medium">Close</th>
                  <th scope="col" className="px-3 py-2 font-medium">Owner</th>
                  <th scope="col" className="px-4 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.rows.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-2/60">
                    <td className="max-w-56 px-4 py-2.5">
                      <Link to="/app/deals/$dealId" params={{ dealId: d.id }} title={d.title} className="line-clamp-2 font-medium hover:underline">
                        {d.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <TagChip tag={{ id: d.stageId, name: d.stageName, color: d.stageColor }} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Money minor={d.valueMinor} currency={d.currency} />
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5" title={d.contactName ?? undefined}>
                      {d.contactId && d.contactName ? (
                        <Link to="/app/contacts/$contactId" params={{ contactId: d.contactId }} className="text-fg-muted hover:text-fg hover:underline">
                          {d.contactName}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5" title={d.companyName ?? undefined}>
                      {d.companyId && d.companyName ? (
                        <Link to="/app/companies/$companyId" params={{ companyId: d.companyId }} className="text-fg-muted hover:text-fg hover:underline">
                          {d.companyName}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted tnum">{d.expectedCloseOn ? formatDay(d.expectedCloseOn) : <span className="text-fg-subtle">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <Avatar name={d.ownerName} size="xs" />
                        <span className="max-w-28 truncate text-fg-muted">{d.ownerName ?? '—'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-fg-muted tnum">{formatDayAt(d.updatedAt, app.workspace.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {list.rows.map((d) => (
              <li key={d.id} className="relative px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <Link to="/app/deals/$dealId" params={{ dealId: d.id }} className="min-w-0 text-sm font-medium break-words after:absolute after:inset-0">
                    {d.title}
                  </Link>
                  <Money minor={d.valueMinor} currency={d.currency} className="shrink-0 text-sm" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-muted">
                  <TagChip tag={{ id: d.stageId, name: d.stageName, color: d.stageColor }} />
                  {[d.companyName, d.contactName].filter(Boolean).join(' · ')}
                  {d.expectedCloseOn && <span className="tnum">· {formatDay(d.expectedCloseOn)}</span>}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={(page) => navigate({ search: (s) => ({ ...s, page: page > 1 ? page : undefined }) })} />
        </>
      )}
    </Card>
  )
}
