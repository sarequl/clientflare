import { useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createDeal, updateDeal, type getDeal } from '#/features/deals/server'
import { errorMessage, minorToInput } from '#/lib/format'
import { parseMoney } from '#/lib/money'
import { Button } from './Button'
import { Notice } from './Card'
import { CompanyPicker, type CompanyRef } from './CompanyPicker'
import { ContactPicker, type ContactRef } from './ContactPicker'
import { CustomFieldInputs, toFieldValuesPayload, type CustomField, type FieldValues } from './CustomFieldInputs'
import { CurrencySelect, Field, Input, Select, Textarea } from './Field'
import { ModalActions } from './Modal'
import { TagChip, type TagLike } from './TagChip'
import { TagPicker } from './TagPicker'
import type { MemberOption } from './ContactForm'
import { useApp } from './useApp'

export type DealDetail = NonNullable<Awaited<ReturnType<typeof getDeal>>>
export type StageOption = { id: string; name: string; kind: 'open' | 'won' | 'lost' }

/**
 * Create (no `deal`) or edit a deal. Stage and tags are only set here on create;
 * the detail page owns them after (stage stepper, tag picker).
 */
export function DealForm({
  deal,
  stages,
  fields,
  members,
  tags,
  initialStageId,
  onDone,
}: {
  deal?: DealDetail
  stages: StageOption[]
  fields: CustomField[]
  members: MemberOption[]
  tags?: TagLike[]
  initialStageId?: string
  onDone: (id?: string) => void
}) {
  const app = useApp()
  const router = useRouter()
  const [title, setTitle] = useState(deal?.title ?? '')
  const [currency, setCurrency] = useState(deal?.currency ?? app.workspace.baseCurrency)
  const [value, setValue] = useState(deal && deal.valueMinor ? minorToInput(deal.valueMinor, deal.currency) : '')
  const [stageId, setStageId] = useState(initialStageId ?? stages.find((s) => s.kind === 'open')?.id ?? stages[0]?.id ?? '')
  const [closeOn, setCloseOn] = useState(deal?.expectedCloseOn ?? '')
  const [contact, setContact] = useState<ContactRef | null>(
    deal?.contact ? { id: deal.contact.id, name: [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') } : null,
  )
  const [company, setCompany] = useState<CompanyRef | null>(deal?.company ?? null)
  const [ownerUserId, setOwnerUserId] = useState(deal ? (deal.ownerUserId ?? '') : app.user.id)
  const [notes, setNotes] = useState(deal?.notes ?? '')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [values, setValues] = useState<FieldValues>(deal?.fieldValues ?? {})
  const [errors, setErrors] = useState<{ title?: string; value?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const next: typeof errors = {}
    if (!title.trim()) next.title = 'Give the deal a title.'
    let valueMinor = 0
    if (value.trim()) {
      try {
        valueMinor = parseMoney(value, currency)
        if (valueMinor < 0) throw new Error('Value cannot be negative.')
      } catch (err) {
        next.value = errorMessage(err, 'Enter a number like 1200 or 1200.50.')
      }
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    const data = {
      title: title.trim(),
      valueMinor,
      currency,
      expectedCloseOn: closeOn || null,
      contactId: contact?.id ?? null,
      companyId: company?.id ?? null,
      ownerUserId: ownerUserId || null,
      notes: notes.trim(),
      fieldValues: toFieldValuesPayload(fields, values, deal?.fieldValues),
    }
    try {
      if (deal) {
        await updateDeal({ data: { id: deal.id, ...data } })
        await router.invalidate()
        onDone(deal.id)
      } else {
        const { id } = await createDeal({ data: { ...data, stageId: stageId || undefined, tagIds } })
        await router.invalidate()
        onDone(id)
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the deal.'))
    } finally {
      setPending(false)
    }
  }

  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Title" htmlFor="dl-title" error={errors.title}>
        <Input id="dl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} aria-invalid={!!errors.title} autoComplete="off" placeholder="Website redesign" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Value" htmlFor="dl-value" error={errors.value}>
          <div className="flex gap-2">
            <Input id="dl-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" className="tnum" aria-invalid={!!errors.value} autoComplete="off" />
            <div className="w-24 shrink-0">
              <CurrencySelect aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>
        </Field>
        {!deal && (
          <Field label="Stage" htmlFor="dl-stage">
            <Select id="dl-stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Expected close" htmlFor="dl-close">
          <Input id="dl-close" type="date" value={closeOn} onChange={(e) => setCloseOn(e.target.value)} />
        </Field>
        <Field label="Owner" htmlFor="dl-owner">
          <Select id="dl-owner" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
            <option value="">Nobody</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact" htmlFor="dl-contact">
          <ContactPicker id="dl-contact" value={contact} onChange={setContact} />
        </Field>
        <Field label="Company" htmlFor="dl-company">
          <CompanyPicker id="dl-company" value={company} onChange={setCompany} />
        </Field>
      </div>
      {!deal && tags && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Tags</span>
          <div className="flex flex-wrap items-center gap-1">
            {tagIds.map((id) => {
              const t = tagById.get(id)
              return t ? <TagChip key={id} tag={t} onRemove={() => setTagIds(tagIds.filter((x) => x !== id))} /> : null
            })}
            <TagPicker
              tags={tags}
              value={tagIds}
              label="Add tag"
              onChange={async (ids) => {
                setTagIds(ids)
                if (ids.some((id) => !tagById.has(id))) await router.invalidate()
              }}
            />
          </div>
        </div>
      )}
      <CustomFieldInputs fields={fields} values={values} onChange={setValues} idPrefix="dl-cf" />
      <Field label="Notes" htmlFor="dl-notes">
        <Textarea id="dl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={() => onDone()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {deal ? 'Save changes' : 'Create deal'}
        </Button>
      </ModalActions>
    </form>
  )
}
