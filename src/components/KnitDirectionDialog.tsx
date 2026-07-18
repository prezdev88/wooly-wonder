import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

type KnitDirectionDialogProps = {
  onCancel: () => void
  onSelectDirection: (direction: 'top' | 'bottom') => void
}

export default function KnitDirectionDialog({
  onCancel,
  onSelectDirection
}: KnitDirectionDialogProps) {
  const { t } = useTranslation()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
  }, [onCancel])

  return createPortal(
    <div className="confirm-backdrop" onMouseDown={() => onCancel()}>
      <section
        aria-labelledby="knit-dialog-title"
        aria-modal="true"
        className="confirm-dialog"
        style={{ borderColor: 'var(--accent)' }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="confirm-icon" style={{ background: 'var(--accent)', color: '#fff', fontSize: '2rem' }} aria-hidden="true">
          🧶
        </div>
        <div className="confirm-copy">
          <h2 id="knit-dialog-title">{t('pixelator.knitDirectionTitle', '¿Desde dónde quieres empezar?')}</h2>
          <p>{t('pixelator.knitDirectionDesc', 'Elige la dirección para empezar a tejer.')}</p>
        </div>
        <div className="confirm-actions">
          <button
            className="confirm-button"
            style={{ flex: 1, backgroundColor: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}
            onClick={() => onSelectDirection('top')}
            type="button"
          >
            {t('pixelator.knitTop', 'Arriba')}
          </button>
          <button
            className="confirm-button"
            style={{ flex: 1, backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }}
            onClick={() => onSelectDirection('bottom')}
            type="button"
          >
            {t('pixelator.knitBottom', 'Abajo')}
          </button>
        </div>
        <div className="confirm-actions" style={{ marginTop: '10px' }}>
          <button
            className="confirm-button secondary"
            style={{ width: '100%' }}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {t('common.cancel')}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}
