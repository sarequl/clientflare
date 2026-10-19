import type { listFields } from '#/features/custom-fields/server'
import { formatLongDay } from '#/lib/format'
import { Field, Input, Select } from './Field'

export type CustomField = Awaited<ReturnType<typeof listFields>>[number]
export type FieldValues = Record<string, string>

/** Inputs for a record's custom fields. Values are strings keyed by field id; '' means empty. */
export function CustomFieldInputs({ fields, values, onChange, idPrefix = 'cf' }: { fields: CustomField[]; values: FieldValues; onChange: (values: FieldValues) => void; idPrefix?: string }) {
  if (!fields.length) return null
  const set = (id: string, v: string) => onChange({ ...values, [id]: v })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.id}`
        const v = values[f.id] ?? ''
        return (
          <Field key={f.id} label={f.name} htmlFor={id}>
            {f.kind === 'select' ? (
              <Select id={id} value={v} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">—</option>
                {/* Keep a stale value visible if the option was removed later. */}
                {v && !(f.options ?? []).includes(v) && <option value={v}>{v}</option>}
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : f.kind === 'number' ? (
              <Input id={id} inputMode="decimal" value={v} onChange={(e) => set(f.id, e.target.value)} className="tnum" />
            ) : f.kind === 'date' ? (
              <Input id={id} type="date" value={v} onChange={(e) => set(f.id, e.target.value)} />
            ) : (
              <Input id={id} value={v} onChange={(e) => set(f.id, e.target.value)} maxLength={500} />
            )}
          </Field>
        )
      })}
    </div>
  )
}

/**
 * Changed fields mapped to their value, or null to clear. Untouched fields are left out so a
 * value whose select option was later removed does not block saving the rest of the record.
 */
export function toFieldValuesPayload(fields: CustomField[], values: FieldValues, initial: FieldValues = {}): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const f of fields) {
    const v = values[f.id]?.trim() ?? ''
    if (v !== (initial[f.id] ?? '')) out[f.id] = v || null
  }
  return out
}

export function formatFieldValue(field: CustomField, value: string | undefined) {
  if (!value) return null
  if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatLongDay(value)
  return value
}
