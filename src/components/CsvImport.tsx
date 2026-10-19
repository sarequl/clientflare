import { useId, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { previewCsv } from '#/features/csv/server'
import { errorMessage } from '#/lib/format'
import { Button, buttonClass, Spinner } from './Button'
import { Card, CardHeader, Notice } from './Card'
import { Select } from './Field'
import type { CustomField } from './CustomFieldInputs'
import { IconCheck, IconUpload } from './icons'

const MAX_BYTES = 5_000_000

export type ImportResult = { imported: number; skipped: number; companiesCreated?: number; errors: string[] }
type Preview = { headers: string[]; preview: string[][]; rowCount: number }
type Target = { value: string; label: string; aliases: string[] }

const norm = (s: string) => s.toLowerCase().replace(/^cf:/, '').replace(/[^a-z0-9]/g, '')

/** Best target per header: exact alias match first, then substring, never reusing a target. */
export function autoMap(headers: string[], targets: Target[]): Record<string, string> {
  const used = new Set<string>()
  const out: Record<string, string> = {}
  const keys = targets.map((t) => ({ t, keys: [t.value, t.label, ...t.aliases].map(norm).filter(Boolean) }))
  for (const pass of ['exact', 'partial'] as const) {
    for (const h of headers) {
      if (out[h]) continue
      const n = norm(h)
      if (!n) continue
      const hit = keys.find(
        ({ t, keys }) => !used.has(t.value) && keys.some((k) => (pass === 'exact' ? k === n : k.length > 3 && (n.includes(k) || k.includes(n)))),
      )
      if (hit) {
        out[h] = hit.t.value
        used.add(hit.t.value)
      }
    }
  }
  for (const h of headers) out[h] ??= ''
  return out
}

const STEPS = ['Upload', 'Map columns', 'Done'] as const

export function CsvImport({
  noun,
  listTo,
  targets: standard,
  required,
  fields,
  onImport,
}: {
  noun: { one: string; many: string }
  listTo: '/app/contacts' | '/app/companies'
  targets: Target[]
  /** Target value that must be mapped (e.g. firstName). */
  required: string
  fields: CustomField[]
  onImport: (text: string, mapping: Record<string, string>) => Promise<ImportResult>
}) {
  const router = useRouter()
  const inputId = useId()
  const [step, setStep] = useState(0)
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targets: Target[] = [...standard, ...fields.map((f) => ({ value: `cf:${f.id}`, label: f.name, aliases: [] }))]
  const requiredLabel = targets.find((t) => t.value === required)?.label ?? required

  async function onFile(file: File | undefined) {
    setError(null)
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('That file is over 5 MB. Split it into smaller files.')
      return
    }
    setPending(true)
    try {
      const body = await file.text()
      const p = await previewCsv({ data: { text: body } })
      setFileName(file.name)
      setText(body)
      setPreview(p)
      setMapping(autoMap(p.headers, targets))
      setStep(1)
    } catch (err) {
      setError(errorMessage(err, 'Could not read that file.'))
    } finally {
      setPending(false)
    }
  }

  function setTarget(header: string, value: string) {
    setMapping((m) => {
      const next = { ...m }
      // One column per target: unmap whichever header had it before.
      if (value) for (const h of Object.keys(next)) if (next[h] === value) next[h] = ''
      next[header] = value
      return next
    })
  }

  async function onRun() {
    setError(null)
    if (!Object.values(mapping).includes(required)) {
      setError(`Map one column to ${requiredLabel}.`)
      return
    }
    setPending(true)
    try {
      const r = await onImport(text, mapping)
      setResult(r)
      setStep(2)
      await router.invalidate()
    } catch (err) {
      setError(errorMessage(err, 'Import failed.'))
    } finally {
      setPending(false)
    }
  }

  function reset() {
    setStep(0)
    setText('')
    setPreview(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-1.5 ${i === step ? 'font-medium text-fg' : 'text-fg-subtle'}`}>
            <span className={`grid size-5 place-items-center rounded-full text-[11px] ${i < step ? 'bg-accent text-accent-fg' : i === step ? 'bg-fg text-bg' : 'bg-surface-3'}`}>
              {i < step ? <IconCheck size={12} /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      {error && <Notice tone="danger">{error}</Notice>}

      {step === 0 && (
        <Card>
          <CardHeader title="Choose a CSV file" description={`The first row must be column headers. Up to 5 MB.`} />
          <div className="p-4">
            <label
              htmlFor={inputId}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center hover:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">{pending ? <Spinner /> : <IconUpload size={18} />}</span>
              <span className="text-sm font-medium">{pending ? 'Reading file…' : 'Select a .csv file'}</span>
              <span className="text-[13px] text-fg-muted">Exports from Google Contacts, HubSpot or a spreadsheet all work.</span>
              <input
                id={inputId}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={pending}
                onChange={(e) => {
                  void onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </Card>
      )}

      {step === 1 && preview && (
        <>
          <Card>
            <CardHeader
              title="Match columns"
              description={`${fileName} · ${preview.rowCount} ${preview.rowCount === 1 ? 'row' : 'rows'}. ${requiredLabel} is required; unmapped columns are skipped.`}
            />
            <ul className="divide-y divide-border">
              {preview.headers.map((h, i) => (
                <li key={`${h}-${i}`} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem] sm:items-center sm:gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h || <span className="text-fg-subtle">(blank header)</span>}</p>
                    <p className="truncate text-[12px] text-fg-subtle sm:hidden">{preview.preview[0]?.[i] || '—'}</p>
                  </div>
                  <p className="hidden truncate text-[13px] text-fg-muted sm:block">{preview.preview[0]?.[i] || <span className="text-fg-subtle">—</span>}</p>
                  <Select aria-label={`Field for column ${h}`} value={mapping[h] ?? ''} onChange={(e) => setTarget(h, e.target.value)}>
                    <option value="">Skip this column</option>
                    <optgroup label="Standard">
                      {standard.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                          {t.value === required ? ' (required)' : ''}
                        </option>
                      ))}
                    </optgroup>
                    {fields.length > 0 && (
                      <optgroup label="Custom fields">
                        {fields.map((f) => (
                          <option key={f.id} value={`cf:${f.id}`}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Preview" description={`First ${preview.preview.length} ${preview.preview.length === 1 ? 'row' : 'rows'} as they will be read.`} />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-border text-[12px] text-fg-subtle">
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={`${h}-${i}`} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                        {mapping[h] && <span className="block font-normal text-accent">→ {targets.find((t) => t.value === mapping[h])?.label}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.preview.map((row, r) => (
                    <tr key={r}>
                      {preview.headers.map((_, i) => (
                        <td key={i} className={`max-w-48 truncate px-3 py-1.5 whitespace-nowrap ${mapping[preview.headers[i]!] ? '' : 'text-fg-subtle'}`}>
                          {row[i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={reset} disabled={pending}>
              Choose another file
            </Button>
            <Button variant="primary" onClick={onRun} pending={pending}>
              Import {preview.rowCount} {preview.rowCount === 1 ? noun.one : noun.many}
            </Button>
          </div>
        </>
      )}

      {step === 2 && result && (
        <Card>
          <CardHeader title="Import finished" />
          <div className="flex flex-col gap-3 p-4">
            <Notice tone={result.imported ? 'accent' : 'warn'}>
              Imported {result.imported} {result.imported === 1 ? noun.one : noun.many}
              {result.skipped ? `, skipped ${result.skipped}` : ''}
              {result.companiesCreated ? `. Created ${result.companiesCreated} new ${result.companiesCreated === 1 ? 'company' : 'companies'}` : ''}.
            </Notice>
            {result.errors.length > 0 && (
              <div>
                <p className="mb-1 text-[13px] font-medium">Skipped rows</p>
                <ul className="max-h-60 list-disc overflow-y-auto pl-5 text-[13px] text-fg-muted">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                {result.skipped > result.errors.length && (
                  <p className="mt-1 text-[12px] text-fg-subtle">Showing the first {result.errors.length} of {result.skipped}.</p>
                )}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button onClick={reset}>Import another file</Button>
              <Link to={listTo} className={buttonClass('primary', 'md')}>
                View {noun.many}
              </Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
