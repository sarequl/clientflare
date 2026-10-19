import { useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createTag, deleteTag, updateTag, type TAG_COLORS } from '#/features/tags/server'
import { errorMessage } from '#/lib/format'
import { Button, IconButton } from './Button'
import { Card, CardHeader, Notice } from './Card'
import { EmptyState } from './EmptyState'
import { Field, Input } from './Field'
import { ConfirmDialog, Modal, ModalActions } from './Modal'
import { TagChip, type TagLike } from './TagChip'
import { ColorSwatches } from './TagPicker'
import { IconPencil, IconTag, IconTrash } from './icons'
import { canManage, useApp } from './useApp'

type Color = (typeof TAG_COLORS)[number]

export function TagSettings({ tags }: { tags: TagLike[] }) {
  const app = useApp()
  const router = useRouter()
  const manage = canManage(app.role)
  const [name, setName] = useState('')
  const [color, setColor] = useState<Color>('blue')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TagLike | null>(null)
  const [deleting, setDeleting] = useState<TagLike | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Give the tag a name.')
      return
    }
    setPending(true)
    try {
      await createTag({ data: { name: name.trim(), color } })
      await router.invalidate()
      setName('')
    } catch (err) {
      setError(tagError(err))
    } finally {
      setPending(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      await deleteTag({ data: { id: deleting.id } })
      await router.invalidate()
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err))
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {manage && (
        <Card>
          <CardHeader title="New tag" description="Tags group contacts and companies. Anyone can also create one from a record." />
          <form onSubmit={onAdd} className="flex flex-col gap-3 p-4" noValidate>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Name" htmlFor="tag-name" className="flex-1">
                <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Lead" autoComplete="off" />
              </Field>
              <Button type="submit" variant="primary" pending={pending}>
                Add tag
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-medium">Colour</span>
              <ColorSwatches value={color} onChange={setColor} />
              {name.trim() && <TagChip tag={{ id: 'preview', name: name.trim(), color }} />}
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title="Tags" description={manage ? `${tags.length} in this workspace` : 'Only owners and admins can rename or delete tags.'} />
        {tags.length === 0 ? (
          <EmptyState icon={<IconTag size={18} />} title="No tags yet" />
        ) : (
          <ul className="divide-y divide-border">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <TagChip tag={t} />
                </div>
                {manage && (
                  <div className="-mr-1.5 flex shrink-0 gap-0.5">
                    <IconButton aria-label={`Edit ${t.name}`} icon={<IconPencil />} onClick={() => setEditing(t)} />
                    <IconButton
                      aria-label={`Delete ${t.name}`}
                      icon={<IconTrash />}
                      onClick={() => {
                        setDeleteError(null)
                        setDeleting(t)
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit tag" size="sm">
        {editing && <EditTagForm tag={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deletePending}
        error={deleteError}
        title={`Delete tag “${deleting?.name ?? ''}”?`}
        body="It is removed from every contact and company that has it. The records themselves stay."
      />
    </div>
  )
}

function tagError(err: unknown) {
  const msg = errorMessage(err, 'Could not save the tag.')
  return /unique/i.test(msg) ? 'A tag with that name already exists.' : msg
}

function EditTagForm({ tag, onDone }: { tag: TagLike; onDone: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<Color>(tag.color as Color)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Give the tag a name.')
      return
    }
    setPending(true)
    try {
      await updateTag({ data: { id: tag.id, name: name.trim(), color } })
      await router.invalidate()
      onDone()
    } catch (err) {
      setError(tagError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" htmlFor="tag-edit-name">
        <Input id="tag-edit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Colour</span>
        <ColorSwatches value={color} onChange={setColor} />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <ModalActions>
        <Button onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={pending}>
          Save
        </Button>
      </ModalActions>
    </form>
  )
}
