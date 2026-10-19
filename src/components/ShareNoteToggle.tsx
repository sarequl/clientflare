import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { setActivityShared } from '#/features/portal/server'
import { errorMessage } from '#/lib/format'
import { Spinner } from './Button'
import { IconShare } from './icons-invoice'

/** Small toggle on a timeline note: shows it to the client in their portal, or hides it again. */
export function ShareNoteToggle({ activityId, shared }: { activityId: string; shared: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(shared)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setOn(shared), [shared])

  async function toggle() {
    const next = !on
    setOn(next)
    setPending(true)
    setError(null)
    try {
      await setActivityShared({ data: { id: activityId, shared: next } })
      await router.invalidate()
    } catch (err) {
      setOn(!next)
      setError(errorMessage(err, 'Could not update sharing.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={on}
        onClick={toggle}
        disabled={pending}
        title={on ? 'Visible in the client portal. Click to hide.' : 'Only your team sees this. Click to share with the client.'}
        className={`inline-flex h-6 items-center gap-1 rounded px-1.5 text-[12px] font-medium transition-colors disabled:opacity-60 ${
          on ? 'bg-accent-soft text-accent-soft-fg hover:opacity-85' : 'text-fg-subtle hover:bg-surface-2 hover:text-fg'
        }`}
      >
        {pending ? <Spinner className="size-3" /> : <IconShare size={13} />}
        {on ? 'Shared with client' : 'Share with client'}
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      )}
    </span>
  )
}
