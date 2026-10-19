import { useEffect, useState } from 'react'
import { IconMonitor, IconMoon, IconSun } from './icons'

type Mode = 'light' | 'dark' | 'auto'

function apply(mode: Mode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1b1d21' : '#fbfbfc')
}

function readMode(): Mode {
  try {
    const v = window.localStorage.getItem('theme')
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('auto')

  useEffect(() => setMode(readMode()), [])

  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const choose = (next: Mode) => {
    setMode(next)
    try {
      if (next === 'auto') window.localStorage.removeItem('theme')
      else window.localStorage.setItem('theme', next)
    } catch {
      /* storage blocked */
    }
    apply(next)
  }

  const options: { value: Mode; label: string; Icon: typeof IconSun }[] = [
    { value: 'light', label: 'Light', Icon: IconSun },
    { value: 'dark', label: 'Dark', Icon: IconMoon },
    { value: 'auto', label: 'System', Icon: IconMonitor },
  ]

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={`grid h-7 w-8 place-items-center rounded text-fg-muted transition-colors hover:text-fg ${
            mode === value ? 'bg-surface text-fg shadow-sm' : ''
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}
