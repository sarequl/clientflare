import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import {
  deleteInvoice,
  duplicateInvoice,
  getInvoice,
  markInvoicePaid,
  markInvoiceSent,
  markInvoiceUnpaid,
  updateInvoice,
  voidInvoice,
} from '#/features/invoices/server'
import { listSetAsides } from '#/features/finance/server'
import { computeTotals } from '#/lib/invoice-math'
import { formatMoney, parseMoney } from '#/lib/money'
import { errorMessage, formatDay, formatLongDay, formatPercentBp, minorToInput, todayISO } from '#/lib/format'
import { Card, CardHeader, Notice } from '#/components/Card'
import { Button, IconButton, buttonClass } from '#/components/Button'
import { Checkbox, CurrencySelect, Field, Input, Textarea } from '#/components/Field'
import { ConfirmDialog, Modal, ModalActions } from '#/components/Modal'
import { OverflowMenu } from '#/components/Popover'
import { CompanyPicker, type CompanyRef } from '#/components/CompanyPicker'
import { ContactPicker, type ContactRef } from '#/components/ContactPicker'
import { InvoiceDocument, type BusinessBlock } from '#/components/InvoiceDocument'
import { InvoiceStatusBadge, formatQuantity, parseQuantity, parseTaxPercent } from '#/components/InvoiceStatusBadge'
import { Money } from '#/components/Money'
import { useApp } from '#/components/useApp'
import { IconArrowDown, IconArrowUp, IconCheck, IconChevronLeft, IconPencil, IconPlus, IconSend, IconTrash, IconX } from '#/components/icons'
import { IconBan, IconCopy, IconExternal, IconPrinter, IconUndo } from '#/components/icons-invoice'

export const Route = createFileRoute('/app/_ws/invoices/$invoiceId')({
  loader: async ({ params }) => {
    const [data, rules] = await Promise.all([getInvoice({ data: { id: params.invoiceId } }), listSetAsides()])
    if (!data) throw notFound()
    return { ...data, rules: rules.map((r) => ({ id: r.id, name: r.name, percentBp: r.percentBp, active: r.active })) }
  },
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.invoice.number ?? 'Draft invoice'} · Clientflare` }] }),
  component: InvoicePage,
})

type Loaded = Awaited<ReturnType<typeof getInvoice>> & {}
type Invoice = Loaded['invoice']
type Rule = { id: string; name: string; percentBp: number; active: boolean }
type Flash =
  | { kind: 'sent'; number: string }
  | { kind: 'paid'; amountMinor: number; currency: string; lines: { name: string; percentBp: number; amountMinor: number }[] }
  | { kind: 'info'; text: string }

const contactName = (c: { firstName: string; lastName: string | null }) => [c.firstName, c.lastName].filter(Boolean).join(' ')

/** getInvoice falls back to the workspace id when no business name is set; show the workspace name instead. */
function useBusiness(business: Loaded['business']): BusinessBlock {
  const app = useApp()
  return { ...business, name: !business.name || business.name === app.workspace.id ? app.workspace.name : business.name }
}

function InvoicePage() {
  const { invoice, business: rawBusiness, rules } = Route.useLoaderData()
  const business = useBusiness(rawBusiness)
  const [flash, setFlash] = useState<Flash | null>(null)

  useEffect(() => setFlash(null), [invoice.id])

  return (
    <>
      <Link to="/app/invoices" className="mb-3 inline-flex items-center gap-1 rounded text-[13px] text-fg-muted hover:text-fg">
        <IconChevronLeft size={14} /> Invoices
      </Link>
      {flash && (
        <div className="mb-4">
          <FlashNotice flash={flash} onDismiss={() => setFlash(null)} />
        </div>
      )}
      {invoice.status === 'draft' ? (
        <DraftEditor key={invoice.id} invoice={invoice} onFlash={setFlash} />
      ) : (
        <IssuedView key={`${invoice.id}-${invoice.status}`} invoice={invoice} business={business} rules={rules} onFlash={setFlash} />
      )}
    </>
  )
}

function FlashNotice({ flash, onDismiss }: { flash: Flash; onDismiss: () => void }) {
  if (flash.kind === 'info') return <Notice tone="accent" onDismiss={onDismiss}>{flash.text}</Notice>
  if (flash.kind === 'sent')
    return (
      <Notice tone="accent" onDismiss={onDismiss}>
        <p className="font-medium">
          Marked as sent. This is invoice <span className="tnum">{flash.number}</span>.
        </p>
        <p className="mt-0.5">Copy the share link below and send it to your client.</p>
      </Notice>
    )
  return (
    <Notice tone="accent" onDismiss={onDismiss}>
      <p className="font-medium">Paid. Recorded {formatMoney(flash.amountMinor, flash.currency)} as income.</p>
      {flash.lines.length > 0 ? (
        <p className="mt-0.5">
          Set aside:{' '}
          {flash.lines.map((l, i) => (
            <span key={i} className="whitespace-nowrap">
              {i > 0 && ' · '}
              {l.name} {formatPercentBp(l.percentBp)} → <span className="tnum font-medium">{formatMoney(l.amountMinor, flash.currency)}</span>
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-0.5 opacity-80">No set-aside rules applied.</p>
      )}
    </Notice>
  )
}

// ── Draft editor ───────────────────────────────────────────────────────────

type LineState = { key: string; description: string; qty: string; unit: string }
type DraftState = {
  billTo: string
  contact: ContactRef | null
  company: CompanyRef | null
  currency: string
  issuedOn: string
  dueOn: string
  tax: string
  notes: string
  footer: string
  lines: LineState[]
}
type SaveStatus = 'saved' | 'dirty' | 'saving' | 'invalid' | 'error'

// Initial rows get index keys so SSR and hydration agree; rows added later use a client-only counter.
let lineSeq = 0
const lineKey = () => `n${++lineSeq}`

function initialDraft(inv: Invoice): DraftState {
  return {
    billTo: inv.billTo,
    contact: inv.contact ? { id: inv.contact.id, name: contactName(inv.contact) } : null,
    company: inv.company ? { id: inv.company.id, name: inv.company.name } : null,
    currency: inv.currency,
    issuedOn: inv.issuedOn,
    dueOn: inv.dueOn ?? '',
    tax: String(inv.taxRateBp / 100),
    notes: inv.notes ?? '',
    footer: inv.footer ?? '',
    lines: inv.lines.length
      ? inv.lines.map((l, i) => ({ key: `i${i}`, description: l.description, qty: formatQuantity(l.quantityMilli), unit: minorToInput(l.unitMinor, inv.currency) }))
      : [{ key: 'i0', description: '', qty: '1', unit: '' }],
  }
}

type Built = {
  errors: Record<string, string>
  lines: { description: string; quantityMilli: number; unitMinor: number }[]
  /** Parsed amounts per visible line (0 where invalid), for live totals. */
  preview: { quantityMilli: number; unitMinor: number }[]
  taxRateBp: number
}

function build(d: DraftState): Built {
  const errors: Record<string, string> = {}
  const lines: Built['lines'] = []
  const preview: Built['preview'] = []
  for (const l of d.lines) {
    const desc = l.description.trim()
    const quantityMilli = parseQuantity(l.qty)
    let unitMinor: number | null = 0
    if (l.unit.trim()) {
      try {
        unitMinor = parseMoney(l.unit, d.currency)
      } catch (err) {
        unitMinor = null
        errors[`${l.key}-unit`] = errorMessage(err)
      }
    }
    if (quantityMilli === null) errors[`${l.key}-qty`] = 'Use a number like 1 or 2.5'
    preview.push({ quantityMilli: quantityMilli ?? 0, unitMinor: unitMinor ?? 0 })
    // A fresh blank row is ignored rather than flagged.
    if (!desc && !l.unit.trim()) continue
    if (!desc) errors[`${l.key}-desc`] = 'Add a description'
    if (desc && quantityMilli !== null && unitMinor !== null) lines.push({ description: desc, quantityMilli, unitMinor })
  }
  const taxRateBp = parseTaxPercent(d.tax)
  if (taxRateBp === null) errors.tax = 'Use a percent between 0 and 100'
  if (!d.issuedOn) errors.issuedOn = 'Pick the issue date'
  if (d.dueOn && d.issuedOn && d.dueOn < d.issuedOn) errors.dueOn = 'Due date is before the issue date'
  return { errors, lines, preview, taxRateBp: taxRateBp ?? 0 }
}

function DraftEditor({ invoice, onFlash }: { invoice: Invoice; onFlash: (f: Flash | null) => void }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => initialDraft(invoice))
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const draftRef = useRef(draft)
  const rev = useRef(0)
  const savedRev = useRef(0)
  const inflight = useRef<Promise<boolean> | null>(null)
  const autoBillTo = useRef(invoice.billTo.trim() ? null : '')

  const [sending, setSending] = useState(false)
  const [sendPending, setSendPending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const built = build(draft)
  const totals = computeTotals(built.preview, built.taxRateBp)
  const hasErrors = Object.keys(built.errors).length > 0

  function change(fn: (d: DraftState) => DraftState) {
    const next = fn(draftRef.current)
    draftRef.current = next
    setDraft(next)
    rev.current++
    setStatus('dirty')
    setTick((t) => t + 1)
  }

  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current
    if (savedRev.current === rev.current) return true
    const target = rev.current
    const d = draftRef.current
    const b = build(d)
    if (Object.keys(b.errors).length) {
      setStatus('invalid')
      return false
    }
    setStatus('saving')
    setSaveError(null)
    const p = updateInvoice({
      data: {
        id: invoice.id,
        contactId: d.contact?.id ?? null,
        companyId: d.company?.id ?? null,
        billTo: d.billTo.trim(),
        currency: d.currency,
        issuedOn: d.issuedOn,
        dueOn: d.dueOn || null,
        taxRateBp: b.taxRateBp,
        notes: d.notes.trim(),
        footer: d.footer.trim(),
        lines: b.lines,
      },
    })
      .then(() => {
        savedRev.current = target
        return true
      })
      .catch((err: unknown) => {
        setSaveError(errorMessage(err, 'Could not save the invoice.'))
        return false
      })
    inflight.current = p
    const ok = await p
    inflight.current = null
    if (!ok) {
      setStatus('error')
      return false
    }
    if (rev.current !== target) return flush()
    setStatus('saved')
    return true
  }, [invoice.id])

  // Autosave shortly after typing stops; blur saves right away.
  useEffect(() => {
    if (status !== 'dirty') return
    const t = setTimeout(() => void flush(), 900)
    return () => clearTimeout(t)
  }, [tick, status, flush])

  useEffect(() => {
    if (status === 'saved') return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [status])

  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) => change((d) => ({ ...d, [k]: v }))
  const setLine = (key: string, patch: Partial<LineState>) => change((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))
  const moveLine = (i: number, dir: -1 | 1) =>
    change((d) => {
      const lines = [...d.lines]
      const j = i + dir
      if (j < 0 || j >= lines.length) return d
      ;[lines[i], lines[j]] = [lines[j]!, lines[i]!]
      return { ...d, lines }
    })
  const removeLine = (key: string) => change((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((l) => l.key !== key) : [{ key: lineKey(), description: '', qty: '1', unit: '' }] }))
  const addLine = () => {
    change((d) => ({ ...d, lines: [...d.lines, { key: lineKey(), description: '', qty: '1', unit: '' }] }))
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-last-line] [data-line-desc]')?.focus())
  }

  /** Keep the bill-to block in step with the pickers until the user writes their own. */
  function pick(next: { contact?: ContactRef | null; company?: CompanyRef | null }) {
    change((d) => {
      const merged = { ...d, ...next }
      // Picking a contact fills an empty company with theirs.
      if (next.contact?.company && !d.company) merged.company = { id: next.contact.company.id, name: next.contact.company.name }
      const isAuto = autoBillTo.current !== null && d.billTo.trim() === autoBillTo.current
      if (isAuto || !d.billTo.trim()) {
        const auto = [merged.contact?.name, merged.company?.name].filter(Boolean).join('\n')
        autoBillTo.current = auto
        merged.billTo = auto
      }
      return merged
    })
  }

  async function openPrint() {
    const w = window.open('', '_blank')
    await flush()
    const url = `/app/invoices/${invoice.id}/print?print=1`
    if (w) w.location.href = url
    else window.open(url, '_blank')
  }

  async function onMarkSent() {
    setSendPending(true)
    setSendError(null)
    try {
      const ok = await flush()
      if (!ok) {
        setSendError('Fix the highlighted fields first.')
        return
      }
      const { number } = await markInvoiceSent({ data: { id: invoice.id } })
      await router.invalidate()
      onFlash({ kind: 'sent', number })
    } catch (err) {
      setSendError(errorMessage(err, 'Could not mark the invoice sent.'))
    } finally {
      setSendPending(false)
    }
  }

  async function onDuplicate() {
    setActionError(null)
    try {
      await flush()
      const { id } = await duplicateInvoice({ data: { id: invoice.id } })
      await navigate({ to: '/app/invoices/$invoiceId', params: { invoiceId: id } })
      onFlash({ kind: 'info', text: 'Duplicated. This is the new draft.' })
    } catch (err) {
      setActionError(errorMessage(err, 'Could not duplicate the invoice.'))
    }
  }

  async function confirmDelete() {
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteInvoice({ data: { id: invoice.id } })
      savedRev.current = rev.current
      setStatus('saved')
      await navigate({ to: '/app/invoices' })
    } catch (err) {
      setDeleteError(errorMessage(err))
      setDeletePending(false)
    }
  }

  const err = (k: string) => built.errors[k]

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Draft invoice</h1>
            <InvoiceStatusBadge status="draft" />
          </div>
          <SaveIndicator status={status} error={saveError} onRetry={() => void flush()} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<IconPrinter />} onClick={openPrint}>
            <span className="hidden sm:inline">Print / PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
          <Button
            variant="primary"
            icon={<IconSend />}
            onClick={() => {
              setSendError(null)
              setSending(true)
            }}
          >
            Mark as sent
          </Button>
          <OverflowMenu
            items={[
              { label: 'Duplicate', icon: <IconCopy />, onSelect: onDuplicate },
              {
                label: 'Delete draft',
                icon: <IconTrash />,
                onSelect: () => {
                  setDeleteError(null)
                  setDeleting(true)
                },
              },
            ]}
          />
        </div>
      </div>

      {actionError && (
        <div className="mb-4">
          <Notice tone="danger" onDismiss={() => setActionError(null)}>
            {actionError}
          </Notice>
        </div>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void flush()
        }}
        onBlur={(e) => {
          // Leaving a field (not just moving within a picker) saves now.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null) || (e.target as HTMLElement).matches('input,textarea,select')) void flush()
        }}
        className="flex flex-col gap-4"
      >
        <Card>
          <CardHeader title="Details" />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Field label="Contact" htmlFor="inv-contact">
                <ContactPicker id="inv-contact" value={draft.contact} onChange={(c) => pick({ contact: c })} />
              </Field>
              <Field label="Company" htmlFor="inv-company">
                <CompanyPicker id="inv-company" value={draft.company} onChange={(c) => pick({ company: c })} />
              </Field>
              <Field label="Bill to" htmlFor="inv-billto" hint="Exactly as it should print. Name, address, email.">
                <Textarea id="inv-billto" rows={4} value={draft.billTo} onChange={(e) => set('billTo', e.target.value)} maxLength={1000} />
              </Field>
            </div>
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Field label="Issued on" htmlFor="inv-issued" error={err('issuedOn')}>
                <Input id="inv-issued" type="date" value={draft.issuedOn} onChange={(e) => set('issuedOn', e.target.value)} aria-invalid={!!err('issuedOn')} />
              </Field>
              <Field label="Due on" htmlFor="inv-due" error={err('dueOn')}>
                <Input id="inv-due" type="date" value={draft.dueOn} onChange={(e) => set('dueOn', e.target.value)} aria-invalid={!!err('dueOn')} />
              </Field>
              <Field label="Currency" htmlFor="inv-currency">
                <CurrencySelect id="inv-currency" value={draft.currency} onChange={(e) => set('currency', e.target.value)} />
              </Field>
              <Field label="Tax rate" htmlFor="inv-tax" error={err('tax')}>
                <div className="relative">
                  <Input
                    id="inv-tax"
                    inputMode="decimal"
                    autoComplete="off"
                    value={draft.tax}
                    onChange={(e) => set('tax', e.target.value)}
                    aria-invalid={!!err('tax')}
                    className="pr-8 tnum"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle">%</span>
                </div>
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Line items" description={`Prices in ${draft.currency}. Quantities can be decimals, like 1.5 hours.`} />
          <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_8rem_7.5rem_6.5rem] gap-2 border-b border-border px-4 py-2 text-[12px] text-fg-subtle md:grid">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Amount</span>
            <span className="sr-only">Actions</span>
          </div>
          <ol className="divide-y divide-border">
            {draft.lines.map((l, i) => (
              <li
                key={l.key}
                data-last-line={i === draft.lines.length - 1 ? '' : undefined}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_5.5rem_8rem_7.5rem_6.5rem] md:items-start"
              >
                <div className="col-span-2 md:col-span-1">
                  <label htmlFor={`${l.key}-desc`} className="sr-only">
                    Line {i + 1} description
                  </label>
                  {/* Grows with its text (field-sizing) so long descriptions stay readable; one line when short. */}
                  <Textarea
                    id={`${l.key}-desc`}
                    data-line-desc
                    rows={1}
                    placeholder="What you did or sold"
                    value={l.description}
                    onChange={(e) => setLine(l.key, { description: e.target.value })}
                    maxLength={500}
                    aria-invalid={!!err(`${l.key}-desc`)}
                    className="!min-h-9 resize-none !py-[7px] [field-sizing:content]"
                  />
                  {err(`${l.key}-desc`) && <p className="mt-1 text-[12px] text-danger">{err(`${l.key}-desc`)}</p>}
                </div>
                <div>
                  <label htmlFor={`${l.key}-qty`} className="mb-1 block text-[12px] text-fg-muted md:sr-only">
                    Qty
                  </label>
                  <Input
                    id={`${l.key}-qty`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={l.qty}
                    onChange={(e) => setLine(l.key, { qty: e.target.value })}
                    aria-invalid={!!err(`${l.key}-qty`)}
                    className="text-right tnum"
                  />
                  {err(`${l.key}-qty`) && <p className="mt-1 text-[12px] text-danger">{err(`${l.key}-qty`)}</p>}
                </div>
                <div>
                  <label htmlFor={`${l.key}-unit`} className="mb-1 block text-[12px] text-fg-muted md:sr-only">
                    Unit price
                  </label>
                  <Input
                    id={`${l.key}-unit`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={l.unit}
                    onChange={(e) => setLine(l.key, { unit: e.target.value })}
                    aria-invalid={!!err(`${l.key}-unit`)}
                    className="text-right tnum"
                  />
                  {err(`${l.key}-unit`) && <p className="mt-1 text-[12px] text-danger">{err(`${l.key}-unit`)}</p>}
                </div>
                <div className="flex h-9 items-center text-sm font-medium md:justify-end">
                  <span className="mr-1 text-[12px] font-normal text-fg-muted md:hidden">Amount</span>
                  <Money minor={totals.lineAmounts[i] ?? 0} currency={draft.currency} />
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  <IconButton aria-label={`Move line ${i + 1} up`} icon={<IconArrowUp />} disabled={i === 0} onClick={() => moveLine(i, -1)} />
                  <IconButton aria-label={`Move line ${i + 1} down`} icon={<IconArrowDown />} disabled={i === draft.lines.length - 1} onClick={() => moveLine(i, 1)} />
                  <IconButton aria-label={`Remove line ${i + 1}`} icon={<IconX />} onClick={() => removeLine(l.key)} />
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-4 border-t border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <Button size="sm" icon={<IconPlus />} onClick={addLine}>
              Add line
            </Button>
            <dl className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-1 text-sm sm:min-w-64">
              <dt className="text-fg-muted">Subtotal</dt>
              <dd className="text-right">
                <Money minor={totals.subtotalMinor} currency={draft.currency} />
              </dd>
              <dt className="text-fg-muted">Tax{built.taxRateBp > 0 ? ` (${formatPercentBp(built.taxRateBp)})` : ''}</dt>
              <dd className="text-right">
                <Money minor={totals.taxMinor} currency={draft.currency} />
              </dd>
              <div className="col-span-2 mt-0.5 grid grid-cols-subgrid border-t border-border pt-1.5">
                <dt className="font-semibold">Total</dt>
                <dd className="text-right">
                  <Money minor={totals.totalMinor} currency={draft.currency} className="text-base font-semibold" />
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title="Notes and footer" description="Both print on the invoice." />
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <Field label="Notes" htmlFor="inv-notes" hint="Payment instructions, thanks, project reference.">
              <Textarea id="inv-notes" rows={4} value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={5000} />
            </Field>
            <Field label="Footer" htmlFor="inv-footer" hint="Small print at the bottom. Defaults from Settings → Invoicing.">
              <Textarea id="inv-footer" rows={4} value={draft.footer} onChange={(e) => set('footer', e.target.value)} maxLength={2000} />
            </Field>
          </div>
        </Card>
      </form>

      <Modal open={sending} onClose={() => !sendPending && setSending(false)} title="Mark as sent?" size="sm">
        <div className="text-sm text-fg-muted">
          <p>
            This gives the invoice its number and locks the line items. You can still change the notes, footer and due date afterwards.
          </p>
          <p className="mt-2">
            Total: <Money minor={totals.totalMinor} currency={draft.currency} className="font-semibold text-fg" />
          </p>
          {hasErrors && <p className="mt-2 text-danger">Some fields need fixing before this can go out.</p>}
          {built.lines.length === 0 && <p className="mt-2 text-danger">Add at least one line item first.</p>}
        </div>
        {sendError && (
          <p className="mt-3 text-[13px] text-danger" role="alert">
            {sendError}
          </p>
        )}
        <ModalActions>
          <Button onClick={() => setSending(false)} disabled={sendPending} data-autofocus>
            Cancel
          </Button>
          <Button variant="primary" onClick={onMarkSent} pending={sendPending} disabled={hasErrors || built.lines.length === 0}>
            Mark as sent
          </Button>
        </ModalActions>
      </Modal>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title="Delete this draft?"
        body="Drafts have no number yet, so nothing is lost from your sequence. This cannot be undone."
        confirmLabel="Delete draft"
      />
    </>
  )
}

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  const base = 'mt-1 flex items-center gap-1.5 text-[13px]'
  if (status === 'saving' || status === 'dirty')
    return (
      <p className={`${base} text-fg-muted`} aria-live="polite">
        <span className="size-1.5 rounded-full bg-fg-subtle anim-fade" /> {status === 'saving' ? 'Saving…' : 'Unsaved changes'}
      </p>
    )
  if (status === 'invalid')
    return (
      <p className={`${base} text-danger`} aria-live="polite">
        Not saved. Fix the highlighted fields.
      </p>
    )
  if (status === 'error')
    return (
      <p className={`${base} text-danger`} role="alert">
        {error ?? 'Could not save.'}{' '}
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Retry
        </button>
      </p>
    )
  return (
    <p className={`${base} text-fg-muted`} aria-live="polite">
      <IconCheck size={13} className="text-accent" /> Saved. Changes save automatically.
    </p>
  )
}

// ── Sent / paid / void ─────────────────────────────────────────────────────

function IssuedView({ invoice, business, rules, onFlash }: { invoice: Invoice; business: BusinessBlock; rules: Rule[]; onFlash: (f: Flash | null) => void }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [confirm, setConfirm] = useState<'void' | 'unpaid' | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const today = todayISO()
  const overdue = invoice.status === 'sent' && !!invoice.dueOn && invoice.dueOn < today
  const shareUrl = `${origin}/i/${invoice.publicToken}`

  useEffect(() => setOrigin(window.location.origin), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setActionError('Could not copy. Select the link and copy it by hand.')
    }
  }

  async function onDuplicate() {
    setActionError(null)
    try {
      const { id } = await duplicateInvoice({ data: { id: invoice.id } })
      await navigate({ to: '/app/invoices/$invoiceId', params: { invoiceId: id } })
      onFlash({ kind: 'info', text: `Duplicated ${invoice.number ?? 'the invoice'} into a new draft.` })
    } catch (err) {
      setActionError(errorMessage(err, 'Could not duplicate the invoice.'))
    }
  }

  async function onConfirm() {
    setConfirmPending(true)
    setConfirmError(null)
    try {
      if (confirm === 'void') await voidInvoice({ data: { id: invoice.id } })
      else await markInvoiceUnpaid({ data: { id: invoice.id } })
      await router.invalidate()
      onFlash({ kind: 'info', text: confirm === 'void' ? `${invoice.number} is void.` : `${invoice.number} is back to sent. The income was removed.` })
      setConfirm(null)
    } catch (err) {
      setConfirmError(errorMessage(err))
    } finally {
      setConfirmPending(false)
    }
  }

  const menu = [
    ...(invoice.status === 'sent' ? [{ label: 'Edit due date & notes', icon: <IconPencil />, onSelect: () => setEditing(true) }] : []),
    { label: 'Duplicate', icon: <IconCopy />, onSelect: onDuplicate },
    ...(invoice.status === 'sent'
      ? [
          {
            label: 'Void invoice',
            icon: <IconBan />,
            onSelect: () => {
              setConfirmError(null)
              setConfirm('void')
            },
          },
        ]
      : []),
  ]

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight tnum">{invoice.number}</h1>
            <InvoiceStatusBadge status={invoice.status} overdue={overdue} />
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">
            {invoice.billTo.split('\n')[0] || 'No recipient'} · <Money minor={invoice.totalMinor} currency={invoice.currency} className="font-medium text-fg" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/i/${invoice.publicToken}?print=1`} target="_blank" rel="noopener" className={buttonClass('secondary', 'md')}>
            <IconPrinter /> <span className="hidden sm:inline">Print / PDF</span>
            <span className="sm:hidden">PDF</span>
          </a>
          {invoice.status === 'sent' && (
            <Button variant="primary" icon={<IconCheck />} onClick={() => setPaying(true)}>
              Mark paid
            </Button>
          )}
          {invoice.status === 'paid' && (
            <Button
              icon={<IconUndo />}
              onClick={() => {
                setConfirmError(null)
                setConfirm('unpaid')
              }}
            >
              Mark unpaid
            </Button>
          )}
          <OverflowMenu items={menu} />
        </div>
      </div>

      {actionError && (
        <div className="mb-4">
          <Notice tone="danger" onDismiss={() => setActionError(null)}>
            {actionError}
          </Notice>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="order-2 min-w-0 rounded-lg bg-surface-3 p-2 sm:p-4 lg:order-1">
          <InvoiceDocument invoice={invoice} business={business} />
        </div>

        <div className="order-1 flex flex-col gap-4 lg:order-2">
          {invoice.status !== 'void' && (
            <Card>
              <CardHeader title="Share link" description="Anyone with the link can view and print this invoice." />
              <div className="flex flex-col gap-2 p-4">
                <Input readOnly aria-label="Share link" value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="text-[13px]" />
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" icon={copied ? <IconCheck /> : <IconCopy />} onClick={copy}>
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                  <a href={`/i/${invoice.publicToken}`} target="_blank" rel="noopener" className={buttonClass('ghost', 'sm')}>
                    <IconExternal /> Open
                  </a>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Payment" />
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-sm">
              <dt className="text-fg-muted">Issued</dt>
              <dd className="tnum">{formatLongDay(invoice.issuedOn)}</dd>
              <dt className="text-fg-muted">Due</dt>
              <dd className={`tnum ${overdue ? 'font-medium text-danger' : ''}`}>
                {invoice.dueOn ? formatLongDay(invoice.dueOn) : '—'}
                {overdue && ' · overdue'}
              </dd>
              {invoice.status === 'paid' && (
                <>
                  <dt className="text-fg-muted">Paid</dt>
                  <dd className="tnum font-medium text-accent">{invoice.paidOn ? formatLongDay(invoice.paidOn) : '—'}</dd>
                  <dt className="text-fg-muted">Income</dt>
                  <dd>
                    {invoice.incomeId && invoice.paidOn ? (
                      <Link to="/app/finance/incomes" search={{ month: invoice.paidOn.slice(0, 7) }} className="text-accent hover:underline">
                        View income
                      </Link>
                    ) : (
                      <span className="text-fg-subtle">Not linked</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
            {invoice.status === 'sent' && (
              <div className="border-t border-border px-4 py-3">
                <Button size="sm" variant="ghost" icon={<IconPencil />} onClick={() => setEditing(true)}>
                  Edit due date & notes
                </Button>
              </div>
            )}
          </Card>

          {(invoice.contact || invoice.company || invoice.deal) && (
            <Card>
              <CardHeader title="Linked to" />
              <ul className="flex flex-col gap-1.5 p-4 text-sm">
                {invoice.contact && (
                  <li>
                    <Link to="/app/contacts/$contactId" params={{ contactId: invoice.contact.id }} className="hover:underline">
                      {contactName(invoice.contact)}
                    </Link>
                  </li>
                )}
                {invoice.company && (
                  <li>
                    <Link to="/app/companies/$companyId" params={{ companyId: invoice.company.id }} className="hover:underline">
                      {invoice.company.name}
                    </Link>
                  </li>
                )}
                {invoice.deal && (
                  <li>
                    <Link to="/app/deals/$dealId" params={{ dealId: invoice.deal.id }} className="hover:underline">
                      Deal: {invoice.deal.title}
                    </Link>
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit sent invoice" description="Line items are locked once an invoice is sent.">
        {editing && <SentDetailsForm invoice={invoice} onDone={() => setEditing(false)} />}
      </Modal>

      <Modal open={paying} onClose={() => setPaying(false)} title={`Mark ${invoice.number} paid`} size="sm">
        {paying && (
          <MarkPaidForm
            invoice={invoice}
            rules={rules}
            onCancel={() => setPaying(false)}
            onDone={(f) => {
              setPaying(false)
              onFlash(f)
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={onConfirm}
        pending={confirmPending}
        error={confirmError}
        confirmLabel={confirm === 'void' ? 'Void invoice' : 'Mark unpaid'}
        title={confirm === 'void' ? `Void ${invoice.number}?` : `Mark ${invoice.number} unpaid?`}
        body={
          confirm === 'void'
            ? 'It keeps its number and stays in your records marked void. The share link will show it as void. This cannot be undone.'
            : `This deletes the ${formatMoney(invoice.totalMinor, invoice.currency)} income recorded${invoice.paidOn ? ` on ${formatDay(invoice.paidOn)}` : ''}, along with its set-aside allocations. The invoice goes back to sent.`
        }
      />
    </>
  )
}

function SentDetailsForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const router = useRouter()
  const [dueOn, setDueOn] = useState(invoice.dueOn ?? '')
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [footer, setFooter] = useState(invoice.footer ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await updateInvoice({ data: { id: invoice.id, dueOn: dueOn || null, notes: notes.trim(), footer: footer.trim() } })
      await router.invalidate()
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Due on" htmlFor="sent-due">
        <Input id="sent-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="sent-notes">
        <Textarea id="sent-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      </Field>
      <Field label="Footer" htmlFor="sent-footer">
        <Textarea id="sent-footer" rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={2000} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Save changes
        </Button>
      </ModalActions>
    </form>
  )
}

function MarkPaidForm({ invoice, rules, onCancel, onDone }: { invoice: Invoice; rules: Rule[]; onCancel: () => void; onDone: (f: Flash) => void }) {
  const router = useRouter()
  const [paidOn, setPaidOn] = useState(todayISO())
  const [apply, setApply] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRules = rules.filter((r) => r.active)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!paidOn) {
      setError('Pick the date the money arrived.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const res = await markInvoicePaid({ data: { id: invoice.id, paidOn, applySetAsides: apply } })
      await router.invalidate()
      const byId = new Map(rules.map((r) => [r.id, r]))
      onDone({
        kind: 'paid',
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        lines: res.allocations.map((a) => ({ name: byId.get(a.ruleId)?.name ?? 'Rule', percentBp: byId.get(a.ruleId)?.percentBp ?? 0, amountMinor: a.amountMinor })),
      })
    } catch (err) {
      setError(errorMessage(err, 'Could not mark the invoice paid.'))
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-fg-muted">
        Records <Money minor={invoice.totalMinor} currency={invoice.currency} className="font-semibold text-fg" /> as income in this workspace.
      </p>
      <Field label="Paid on" htmlFor="paid-on">
        <Input id="paid-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </Field>
      <Checkbox
        id="paid-apply"
        checked={apply}
        onChange={(e) => setApply(e.target.checked)}
        label="Apply set-aside rules"
        hint={activeRules.length ? activeRules.map((r) => `${r.name} ${formatPercentBp(r.percentBp)}`).join(' · ') : 'You have no active rules, so nothing will be set aside.'}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Mark paid
        </Button>
      </ModalActions>
    </form>
  )
}
