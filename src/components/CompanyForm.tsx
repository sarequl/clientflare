import { useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createCompany, updateCompany, type getCompany } from '#/features/companies/server'
import { errorMessage } from '#/lib/format'
import { Button } from './Button'
import { Notice } from './Card'
import { CustomFieldInputs, toFieldValuesPayload, type CustomField, type FieldValues } from './CustomFieldInputs'
import { Field, Input, Select, Textarea } from './Field'
import { ModalActions } from './Modal'
import { TagChip, type TagLike } from './TagChip'
import { TagPicker } from './TagPicker'
import type { MemberOption } from './ContactForm'

export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompany>>>

export function CompanyForm({
  company,
  fields,
  members,
  tags,
  onDone,
}: {
  company?: CompanyDetail
  fields: CustomField[]
  members?: MemberOption[]
  tags?: TagLike[]
  onDone: (id?: string) => void
}) {
  const router = useRouter()
  const [name, setName] = useState(company?.name ?? '')
  const [domain, setDomain] = useState(company?.domain ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [phone, setPhone] = useState(company?.phone ?? '')
  const [address, setAddress] = useState(company?.address ?? '')
  const [notes, setNotes] = useState(company?.notes ?? '')
  const [ownerUserId, setOwnerUserId] = useState(company?.ownerUserId ?? '')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [values, setValues] = useState<FieldValues>(company?.fieldValues ?? {})
  const [nameError, setNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setNameError('Enter a name.')
      return
    }
    setNameError(null)
    setPending(true)
    const data = {
      name: name.trim(),
      domain: domain.trim(),
      website: website.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
      ...(members && ownerUserId ? { ownerUserId } : {}),
      fieldValues: toFieldValuesPayload(fields, values, company?.fieldValues),
    }
    try {
      if (company) {
        await updateCompany({ data: { id: company.id, ...data } })
        await router.invalidate()
        onDone(company.id)
      } else {
        const { id } = await createCompany({ data: { ...data, tagIds } })
        await router.invalidate()
        onDone(id)
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the company.'))
    } finally {
      setPending(false)
    }
  }

  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" htmlFor="co-name" error={nameError}>
        <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-invalid={!!nameError} autoComplete="off" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Domain" htmlFor="co-domain">
          <Input id="co-domain" value={domain} onChange={(e) => setDomain(e.target.value)} maxLength={120} placeholder="acme.com" autoComplete="off" />
        </Field>
        <Field label="Website" htmlFor="co-website">
          <Input id="co-website" type="url" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="https://" />
        </Field>
        <Field label="Phone" htmlFor="co-phone">
          <Input id="co-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </Field>
        {members && (
          <Field label="Owner" htmlFor="co-owner">
            <Select id="co-owner" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
              {!ownerUserId && <option value="">Nobody</option>}
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Address" htmlFor="co-address">
        <Textarea id="co-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} rows={2} />
      </Field>
      {!company && tags && (
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
      <CustomFieldInputs fields={fields} values={values} onChange={setValues} idPrefix="co-cf" />
      <Field label="Notes" htmlFor="co-notes">
        <Textarea id="co-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={() => onDone()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {company ? 'Save changes' : 'Create company'}
        </Button>
      </ModalActions>
    </form>
  )
}
