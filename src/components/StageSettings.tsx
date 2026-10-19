import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createStage, deleteStage, listStages, reorderStages, updateStage } from '#/features/deals/server'
import type { TAG_COLORS } from '#/features/tags/server'
import { errorMessage } from '#/lib/format'
import { Button, IconButton, Spinner } from './Button'
import { Card, CardHeader, Notice } from './Card'
import { Field, Input, Select } from './Field'
import { Modal, ModalActions } from './Modal'
import { popoverPanel, useDismiss } from './Popover'
import { TagDot } from './TagChip'
import { ColorSwatches } from './TagPicker'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from './icons'
import { canManage, useApp } from './useApp'

type Stage = Awaited<ReturnType<typeof listStages>>[number]
type Kind = Stage['kind']
type Color = (typeof TAG_COLORS)[number]

const KIND_LABEL: Record<Kind, string> = { open: 'Open', won: 'Won', lost: 'Lost' }

/** Pipeline stage editor: rename, kind, probability, colour, reorder, add, delete (moving deals). Admins only. */
export function StageSettings() {
  const app = useApp()
  const router = useRouter()
  const editable = canManage(app.role)
  const [stages, setStages] = useState<Stage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Stage | null>(null)

  const load = useCallback(async () => setStages(await listStages()), [])
  useEffect(() => {
    load().catch((err) => setError(errorMessage(err, 'Could not load stages.')))
  }, [load])

  async function run(id: string, fn: () => Promise<unknown>) {
    setError(null)
    setBusy(id)
    try {
      await fn()
      await load()
      void router.invalidate()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the stage.'))
      await load().catch(() => {})
    } finally {
      setBusy(null)
    }
  }

  function move(i: number, dir: -1 | 1) {
    if (!stages) return
    const next = [...stages]
    const [s] = next.splice(i, 1)
    next.splice(i + dir, 0, s!)
    setStages(next)
    void run(s!.id, () => reorderStages({ data: { ids: next.map((x) => x.id) } }))
  }

  return (
    <Card>
      <CardHeader title="Pipeline stages" description="Deals move left to right. Won and lost stages close the deal." />
      {!editable && (
        <div className="px-4 pt-3">
          <Notice>Only owners and admins can change stages.</Notice>
        </div>
      )}
      {error && (
        <div className="px-4 pt-3">
          <Notice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        </div>
      )}
      {stages === null ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-fg-muted">
          <Spinner /> Loading
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {stages.map((s, i) => (
            <StageRow
              key={s.id}
              stage={s}
              editable={editable}
              busy={busy === s.id}
              first={i === 0}
              last={i === stages.length - 1}
              onlyOne={stages.length === 1}
              onSave={(patch) => run(s.id, () => updateStage({ data: { id: s.id, ...patch } }))}
              onMove={(dir) => move(i, dir)}
              onDelete={() => setDeleting(s)}
            />
          ))}
        </ol>
      )}
      {editable && stages && <AddStage onAdd={(data) => run('new', () => createStage({ data }))} pending={busy === 'new'} />}
      {deleting && stages && (
        <DeleteStageDialog
          stage={deleting}
          others={stages.filter((s) => s.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null)
            await load()
            void router.invalidate()
          }}
        />
      )}
    </Card>
  )
}

function StageRow({
  stage,
  editable,
  busy,
  first,
  last,
  onlyOne,
  onSave,
  onMove,
  onDelete,
}: {
  stage: Stage
  editable: boolean
  busy: boolean
  first: boolean
  last: boolean
  onlyOne: boolean
  onSave: (patch: Partial<{ name: string; kind: Kind; probability: number; color: string }>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(stage.name)
  const [prob, setProb] = useState(String(stage.probability))
  useEffect(() => setName(stage.name), [stage.name])
  useEffect(() => setProb(String(stage.probability)), [stage.probability])

  function commitName() {
    const v = name.trim()
    if (!v) return setName(stage.name)
    if (v !== stage.name) onSave({ name: v })
  }
  function commitProb() {
    const n = Number(prob)
    if (!/^\d{1,3}$/.test(prob.trim()) || n > 100) return setProb(String(stage.probability))
    if (n !== stage.probability) onSave({ probability: n })
  }

  const id = `stage-${stage.id}`
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <ColorButton color={stage.color} disabled={!editable || busy} onChange={(color) => onSave({ color })} />
      <Input
        id={`${id}-name`}
        aria-label="Stage name"
        value={name}
        maxLength={40}
        disabled={!editable}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commitName())}
        className="h-8 min-w-32 flex-1 text-[13px] sm:max-w-56"
      />
      <div className="w-24">
        <Select aria-label="Kind" value={stage.kind} disabled={!editable || busy} onChange={(e) => onSave({ kind: e.target.value as Kind })} className="h-8 text-[13px]">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-1 text-[13px] text-fg-muted">
        <Input
          aria-label="Win probability (percent)"
          inputMode="numeric"
          value={prob}
          disabled={!editable}
          onChange={(e) => setProb(e.target.value)}
          onBlur={commitProb}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commitProb())}
          className="h-8 w-14 text-right text-[13px] tnum"
        />
        %
      </label>
      {editable && (
        <div className="ml-auto flex items-center">
          {busy && <Spinner className="mr-1 text-fg-muted" />}
          <IconButton aria-label={`Move ${stage.name} up`} icon={<IconArrowUp />} disabled={first || busy} onClick={() => onMove(-1)} />
          <IconButton aria-label={`Move ${stage.name} down`} icon={<IconArrowDown />} disabled={last || busy} onClick={() => onMove(1)} />
          <IconButton aria-label={`Delete ${stage.name}`} icon={<IconTrash />} disabled={onlyOne || busy} onClick={onDelete} />
        </div>
      )}
    </li>
  )
}

function ColorButton({ color, disabled, onChange }: { color: string; disabled?: boolean; onChange: (c: Color) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useDismiss(open, () => setOpen(false), root, trigger)
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Colour: ${color}`}
        title="Change colour"
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-md border border-border-strong hover:bg-surface-2 disabled:opacity-60"
      >
        <TagDot color={color} className="size-3" />
      </button>
      {open && (
        <div role="dialog" aria-label="Stage colour" className={`${popoverPanel} left-0 w-[11.5rem] p-2`}>
          <ColorSwatches
            value={color}
            onChange={(c) => {
              setOpen(false)
              trigger.current?.focus()
              if (c !== color) onChange(c)
            }}
          />
        </div>
      )}
    </div>
  )
}

function AddStage({ onAdd, pending }: { onAdd: (data: { name: string; kind: Kind; probability: number; color: string }) => void; pending: boolean }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('open')
  const [prob, setProb] = useState('50')
  const [color, setColor] = useState<Color>('blue')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Name the stage.')
    const n = Number(prob)
    if (!/^\d{1,3}$/.test(prob.trim()) || n > 100) return setError('Probability is a whole number from 0 to 100.')
    onAdd({ name: name.trim(), kind, probability: n, color })
    setName('')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-border p-4" noValidate>
      <p className="text-[13px] font-medium">Add a stage</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_6rem]">
        <Field label="Name" htmlFor="ns-name">
          <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Discovery call" />
        </Field>
        <Field label="Kind" htmlFor="ns-kind">
          <Select id="ns-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Probability" htmlFor="ns-prob">
          <Input id="ns-prob" inputMode="numeric" value={prob} onChange={(e) => setProb(e.target.value)} className="tnum" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ColorSwatches value={color} onChange={setColor} />
        <Button type="submit" size="sm" variant="primary" icon={<IconPlus />} pending={pending}>
          Add stage
        </Button>
      </div>
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
    </form>
  )
}

function DeleteStageDialog({ stage, others, onClose, onDeleted }: { stage: Stage; others: Stage[]; onClose: () => void; onDeleted: () => void }) {
  const [target, setTarget] = useState(others.find((s) => s.kind === stage.kind)?.id ?? others[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onConfirm() {
    setPending(true)
    setError(null)
    try {
      await deleteStage({ data: { id: stage.id, moveToStageId: target } })
      onDeleted()
    } catch (err) {
      setError(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <Modal open onClose={pending ? () => {} : onClose} title={`Delete ${stage.name}?`} size="sm">
      <p className="text-sm text-fg-muted">Deals in this stage move to the stage you pick. Moving them into a won or lost stage closes them.</p>
      <div className="mt-4">
        <Field label="Move deals to" htmlFor="ds-target">
          <Select id="ds-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({KIND_LABEL[s.kind].toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && (
        <p className="mt-3 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <ModalActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} pending={pending} disabled={!target}>
          Delete stage
        </Button>
      </ModalActions>
    </Modal>
  )
}
