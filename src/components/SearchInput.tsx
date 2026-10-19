import { useEffect, useRef, useState } from 'react'
import { IconSearch, IconX } from './icons'

/**
 * Search box that reports its value after the user pauses typing.
 * External `value` changes (back/forward navigation) resync the box.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
  delay = 300,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  delay?: number
  className?: string
}) {
  const [text, setText] = useState(value)
  const last = useRef(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (value !== last.current) {
      last.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => {
    if (text === last.current) return
    const t = setTimeout(() => {
      last.current = text
      onChangeRef.current(text)
    }, delay)
    return () => clearTimeout(t)
  }, [text, delay])

  return (
    <div className={`relative min-w-0 ${className}`}>
      <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            last.current = text
            onChangeRef.current(text)
          }
        }}
        className="h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface pr-8 pl-8 text-fg placeholder:text-fg-subtle transition-colors hover:border-fg-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('')
            last.current = ''
            onChangeRef.current('')
          }}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  )
}
