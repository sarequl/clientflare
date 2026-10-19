import { useEffect, useState, type FormEvent } from 'react'
import { Button } from './Button'
import { Field, Textarea } from './Field'
import { Modal, ModalActions } from './Modal'

/** Asks for an optional reason before a deal is marked lost. */
export function LostReasonModal({ deal, onClose, onConfirm }: { deal: { title: string } | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (deal) setReason('')
  }, [deal])
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    onConfirm(reason.trim())
  }
  return (
    <Modal open={!!deal} onClose={onClose} title="Mark as lost" description={deal?.title} size="sm">
      <form onSubmit={onSubmit} noValidate>
        <Field label="Reason (optional)" htmlFor="lost-reason" hint="Price, timing, went with someone else…">
          <Textarea id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
        </Field>
        <ModalActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger">
            Mark lost
          </Button>
        </ModalActions>
      </form>
    </Modal>
  )
}
