import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ConfirmDialogProps = {
  cancelLabel: string
  confirmLabel: string
  description: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  title: string
  tone?: 'danger' | 'warning'
}

function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
  tone = 'danger'
}: ConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    cancelButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSubmitting, onCancel])

  const confirm = async () => {
    setIsSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="confirm-backdrop" onMouseDown={() => !isSubmitting && onCancel()}>
      <section
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className={`confirm-dialog ${tone}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <div className="confirm-icon" aria-hidden="true">
          {tone === 'danger' ? '!' : '✦'}
        </div>
        <div className="confirm-copy">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-description">{description}</p>
        </div>
        <div className="confirm-actions">
          <button
            className="confirm-button secondary"
            disabled={isSubmitting}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`confirm-button ${tone}`}
            disabled={isSubmitting}
            onClick={confirm}
            type="button"
          >
            {isSubmitting && <span className="confirm-spinner" />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

export default ConfirmDialog
