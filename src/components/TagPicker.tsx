import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createTag, TAG_COLORS } from '#/features/tags/server'
import { errorMessage } from '#/lib/format'
import { Spinner } from './Button'
import { IconCheck, IconPlus, IconTag } from './icons'
import { popoverPanel, useDismiss } from './Popover'
import { TagDot, suggestTagColor, type TagLike } from './TagChip'

type Option = { kind: 'tag'; tag: TagLike } | { kind: 'create'; name: string }

/**
 * Popover to toggle tags on a record. Typing filters; when no tag matches exactly,
 * the last option creates one with the chosen colour and selects it.
 */
export function TagPicker({
  tags,
  value,
  onChange,
  label = 'Edit tags',
}: {
  tags: TagLike[]
  value: string[]
  onChange: (ids: string[]) => Promise<void> | void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [color, setColor] = useState<(typeof TAG_COLORS)[number]>(() => suggestTagColor(tags))
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  useDismiss(open, () => setOpen(false), root, trigger)

  useEffect(() => {
    if (open) {
      setColor(suggestTagColor(tags))
      setQuery('')
      setActive(0)
      setError(null)
      input.current?.focus()
    }
  }, [open])

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase()
    const list: Option[] = tags.filter((t) => !q || t.name.toLowerCase().includes(q)).map((tag) => ({ kind: 'tag', tag }))
    if (q && !tags.some((t) => t.name.toLowerCase() === q)) list.push({ kind: 'create', name: query.trim() })
    return list
  }, [tags, query])

  useEffect(() => setActive((a) => Math.min(a, Math.max(0, options.length - 1))), [options.length])

  async function choose(opt: Option) {
    setError(null)
    if (opt.kind === 'tag') {
      const on = value.includes(opt.tag.id)
      setPending(opt.tag.id)
      try {
        await onChange(on ? value.filter((id) => id !== opt.tag.id) : [...value, opt.tag.id])
      } catch (err) {
        setError(errorMessage(err, 'Could not update tags.'))
      } finally {
        setPending(null)
      }
      return
    }
    setPending('create')
    try {
      const { id } = await createTag({ data: { name: opt.name.slice(0, 40), color } })
      await onChange([...value, id])
      setQuery('')
    } catch (err) {
      setError(errorMessage(err, 'Could not create the tag.'))
    } finally {
      setPending(null)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!options.length) return
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = options[active]
      if (opt && !pending) void choose(opt)
    }
  }

  const optionId = (i: number) => `${listId}-${i}`

  return (
    <div ref={root} className="relative inline-block">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-border-strong px-1.5 text-[12px] text-fg-muted hover:border-accent hover:text-accent"
      >
        <IconTag size={12} />
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label="Tags" className={`${popoverPanel} left-0 w-64 max-w-[calc(100vw-2rem)]`}>
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options.length ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Find or create a tag"
            placeholder="Find or create a tag"
            value={query}
            maxLength={40}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="mb-1 h-8 w-full rounded border border-border-strong bg-surface px-2 text-sm placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none"
          />
          <ul id={listId} role="listbox" aria-multiselectable="true" aria-label="Tags" className="max-h-60 overflow-y-auto">
            {options.length === 0 && <li className="px-2 py-2 text-[13px] text-fg-subtle">No tags yet. Type to create one.</li>}
            {options.map((opt, i) => {
              const selected = opt.kind === 'tag' && value.includes(opt.tag.id)
              const busy = opt.kind === 'tag' ? pending === opt.tag.id : pending === 'create'
              return (
                <li
                  key={opt.kind === 'tag' ? opt.tag.id : '__create'}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !pending && choose(opt)}
                  className={`flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm ${i === active ? 'bg-surface-2' : ''}`}
                >
                  {opt.kind === 'tag' ? (
                    <>
                      <TagDot color={opt.tag.color} />
                      <span className="min-w-0 flex-1 truncate">{opt.tag.name}</span>
                      {busy ? <Spinner /> : selected && <IconCheck className="text-accent" />}
                    </>
                  ) : (
                    <>
                      {busy ? <Spinner /> : <IconPlus className="text-fg-muted" />}
                      <span className="min-w-0 flex-1 truncate">
                        Create “<span className="font-medium">{opt.name}</span>”
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {options.some((o) => o.kind === 'create') && (
            <ColorSwatches value={color} onChange={setColor} className="mt-1 border-t border-border px-1 pt-2 pb-1" />
          )}
          {error && <p className="px-2 py-1 text-[12px] text-danger" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}

export function ColorSwatches({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (c: (typeof TAG_COLORS)[number]) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label="Colour" className={`flex flex-wrap gap-1 ${className}`}>
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(c)}
          className={`grid size-6 place-items-center rounded-full border ${value === c ? 'border-fg' : 'border-transparent'}`}
        >
          <TagDot color={c} className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
