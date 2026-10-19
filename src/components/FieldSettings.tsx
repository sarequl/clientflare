import { useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createField, deleteField, updateField } from '#/features/custom-fields/server'
import type { FieldKind } from '#/db/schema/crm'
import { errorMessage } from '#/lib/format'
import { Button, IconButton } from './Button'
import { Badge, Card, CardHeader, Notice } from './Card'
import { EmptyState } from './EmptyState'
import { Field, Input, Select } from './Field'
import { ConfirmDialog, Modal, ModalActions } from './Modal'
import type { CustomField } from './CustomFieldInputs'
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus, IconTrash, IconX } from './icons'
import { canManage, useApp } from './useApp'

type RecordKind = 'contact' | 'company'
/** Mirrors FIELD_KINDS; importing the schema value would ship drizzle-orm to the browser. */
const KIND_LABELS: Record<FieldKind, string> = { text: 'Text', number: 'Number', date: 'Date', select: 'Dropdown' }
const FIELD_KINDS = Object.keys(KIND_LABELS) as FieldKind[]

export function FieldSettings({ fields }: { fields: Record<RecordKind, CustomField[]> }) {
  const app = useApp()
  const manage = canManage(app.role)
  const [recordType, setRecordType] = useState<RecordKind>('contact')

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Record type" className="inline-flex w-fit rounded-md border border-border bg-surface-2 p-0.5">
        {(['contact', 'company'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={recordType === t}
            onClick={() => setRecordType(t)}
            className={`h-7 rounded px-3 text-[13px] transition-colors ${recordType === t ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
          >
            {t === 'contact' ? 'Contacts' : 'Companies'}
          </button>
        ))}
      </div>
      <FieldList key={recordType} recordType={recordType} fields={fields[recordType]} manage={manage} />
    </div>
  )
}

function FieldList({ recordType, fields, manage }: { recordType: RecordKind; fields: CustomField[]; manage: boolean }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CustomField | null>(null)
  const [deleting, setDeleting] = useState<CustomField | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function move(index: number, delta: -1 | 1) {
    const order = [...fields]
    const [f] = order.splice(index, 1)
    order.splice(index + delta, 0, f!)
    setError(null)
    setMoving(f!.id)
    try {
      // Rewrite sortOrder as 0..n so older duplicates get normalised too.
      await Promise.all(order.map((x, i) => (x.sortOrder === i ? null : updateField({ data: { id: x.id, name: x.name, sortOrder: i } }))))
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err, 'Could not reorder.'))
    } finally {
      setMoving(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteField({ data: { id: deleting.id } })
      await router.invalidate()
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }

  const noun = recordType === 'contact' ? 'contacts' : 'companies'

  return (
    <Card>
      <CardHeader
        title={`Custom fields for ${noun}`}
        description={manage ? 'Shown on every record and in CSV import and export.' : 'Only owners and admins can change fields.'}
        actions={
          manage && (
            <Button size="sm" variant="primary" icon={<IconPlus />} onClick={() => setAdding(true)}>
              Add field
            </Button>
          )
        }
      />
      {error && (
        <div className="px-4 pt-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}
      {fields.length === 0 ? (
        <EmptyState title="No custom fields" body={`Add fields like “Source” or “Birthday” to track more about your ${noun}.`} />
      ) : (
        <ul className="divide-y divide-border">
          {fields.map((f, i) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <Badge>{KIND_LABELS[f.kind]}</Badge>
                </p>
                {f.kind === 'select' && f.options?.length ? <p className="truncate text-[12px] text-fg-muted">{f.options.join(', ')}</p> : null}
              </div>
              {manage && (
                <div className="-mr-1.5 flex shrink-0 gap-0.5">
                  <IconButton aria-label={`Move ${f.name} up`} icon={<IconArrowUp />} disabled={i === 0 || !!moving} onClick={() => move(i, -1)} />
                  <IconButton aria-label={`Move ${f.name} down`} icon={<IconArrowDown />} disabled={i === fields.length - 1 || !!moving} onClick={() => move(i, 1)} />
                  <IconButton aria-label={`Edit ${f.name}`} icon={<IconPencil />} onClick={() => setEditing(f)} />
                  <IconButton
                    aria-label={`Delete ${f.name}`}
                    icon={<IconTrash />}
                    onClick={() => {
                      setDeleteError(null)
                      setDeleting(f)
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={`New ${recordType} field`}>
        <FieldForm recordType={recordType} onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit field">
        {editing && <FieldForm recordType={recordType} field={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete “${deleting?.name ?? ''}”?`}
        body={`Every value stored in this field on your ${noun} is lost. This cannot be undone.`}
      />
    </Card>
  )
}

function FieldForm({ recordType, field, onDone }: { recordType: RecordKind; field?: CustomField; onDone: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(field?.name ?? '')
  const [kind, setKind] = useState<FieldKind>(field?.kind ?? 'text')
  const [options, setOptions] = useState<string[]>(field?.options ?? [])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addOption() {
    const v = draft.trim()
    if (!v) return
    if (!options.some((o) => o.toLowerCase() === v.toLowerCase())) setOptions([...options, v.slice(0, 60)])
    setDraft('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give the field a name.')
    const opts = draft.trim() && !options.includes(draft.trim()) ? [...options, draft.trim()] : options
    if (kind === 'select' && opts.length === 0) return setError('Add at least one option.')
    setPending(true)
    try {
      if (field) await updateField({ data: { id: field.id, name: name.trim(), options: kind === 'select' ? opts : undefined } })
      else await createField({ data: { recordType, name: name.trim(), kind, options: kind === 'select' ? opts : undefined } })
      await router.invalidate()
      onDone()
    } catch (err) {
      const msg = errorMessage(err, 'Could not save the field.')
      setError(/unique/i.test(msg) ? 'A field with that name already exists.' : msg)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" htmlFor="cf-name">
        <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
      </Field>
      <Field label="Type" htmlFor="cf-kind" hint={field ? 'The type cannot change after creation.' : undefined}>
        <Select id="cf-kind" value={kind} onChange={(e) => setKind(e.target.value as FieldKind)} disabled={!!field}>
          {FIELD_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      {kind === 'select' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cf-option" className="text-[13px] font-medium">
            Options
          </label>
          {options.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <li key={o} className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 py-0.5 pr-1 pl-2 text-[13px]">
                  {o}
                  <button
                    type="button"
                    aria-label={`Remove option ${o}`}
                    onClick={() => setOptions(options.filter((x) => x !== o))}
                    className="grid size-5 place-items-center rounded text-fg-subtle hover:bg-surface-3 hover:text-fg"
                  >
                    <IconX size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              id="cf-option"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addOption()
                }
              }}
              maxLength={60}
              placeholder="Type an option, press Enter"
              autoComplete="off"
            />
            <Button onClick={addOption}>Add</Button>
          </div>
          {field && <p className="text-[13px] text-fg-muted">Records that use a removed option keep their value until someone changes it.</p>}
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          {field ? 'Save' : 'Add field'}
        </Button>
      </ModalActions>
    </form>
  )
}
