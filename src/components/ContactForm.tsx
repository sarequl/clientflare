import { useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createContact, updateContact, type getContact } from '#/features/contacts/server'
import { errorMessage } from '#/lib/format'
import { Button } from './Button'
import { Notice } from './Card'
import { CompanyPicker, type CompanyRef } from './CompanyPicker'
import { CustomFieldInputs, toFieldValuesPayload, type CustomField, type FieldValues } from './CustomFieldInputs'
import { Field, Input, Select, Textarea } from './Field'
import { ModalActions } from './Modal'
import { TagChip, type TagLike } from './TagChip'
import { TagPicker } from './TagPicker'

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContact>>>
export type MemberOption = { userId: string; name: string }

export function fullName(c: { firstName: string; lastName?: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ')
}

/** Create (no `contact`) or edit a contact. Tags are only set here on create; the detail header owns them after. */
export function ContactForm({
  contact,
  fields,
  members,
  tags,
  initialCompany = null,
  onDone,
}: {
  contact?: ContactDetail
  fields: CustomField[]
  members?: MemberOption[]
  tags?: TagLike[]
  initialCompany?: CompanyRef | null
  onDone: (id?: string) => void
}) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(contact?.firstName ?? '')
  const [lastName, setLastName] = useState(contact?.lastName ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [jobTitle, setJobTitle] = useState(contact?.jobTitle ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [company, setCompany] = useState<CompanyRef | null>(contact ? (contact.company ?? null) : initialCompany)
  const [ownerUserId, setOwnerUserId] = useState(contact?.ownerUserId ?? '')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [values, setValues] = useState<FieldValues>(contact?.fieldValues ?? {})
  const [errors, setErrors] = useState<{ firstName?: string; email?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const next: typeof errors = {}
    if (!firstName.trim()) next.firstName = 'Enter a first name.'
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email or leave it blank.'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    const data = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      jobTitle: jobTitle.trim(),
      notes: notes.trim(),
      companyId: company?.id ?? null,
      ...(members && ownerUserId ? { ownerUserId } : {}),
      fieldValues: toFieldValuesPayload(fields, values, contact?.fieldValues),
    }
    try {
      if (contact) {
        await updateContact({ data: { id: contact.id, ...data } })
        await router.invalidate()
        onDone(contact.id)
      } else {
        const { id } = await createContact({ data: { ...data, tagIds } })
        await router.invalidate()
        onDone(id)
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the contact.'))
    } finally {
      setPending(false)
    }
  }

  const tagById = new Map((tags ?? []).map((t) => [t.id, t]))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="ct-first" error={errors.firstName}>
          <Input id="ct-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} aria-invalid={!!errors.firstName} autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="ct-last">
          <Input id="ct-last" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="ct-email" error={errors.email}>
          <Input id="ct-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} aria-invalid={!!errors.email} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="ct-phone">
          <Input id="ct-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="off" />
        </Field>
        <Field label="Job title" htmlFor="ct-title">
          <Input id="ct-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Company" htmlFor="ct-company">
          <CompanyPicker id="ct-company" value={company} onChange={setCompany} />
        </Field>
        {members && (
          <Field label="Owner" htmlFor="ct-owner">
            <Select id="ct-owner" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
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
      {!contact && tags && (
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
                // A tag created inline must appear in `tags` for its chip to render.
                if (ids.some((id) => !tagById.has(id))) await router.invalidate()
              }}
            />
          </div>
        </div>
      )}
      <CustomFieldInputs fields={fields} values={values} onChange={setValues} idPrefix="ct-cf" />
      <Field label="Notes" htmlFor="ct-notes">
        <Textarea id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={() => onDone()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {contact ? 'Save changes' : 'Create contact'}
        </Button>
      </ModalActions>
    </form>
  )
}
