import { useEffect, useRef } from 'react'
import type { ExpenseReadMember, SettlementRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { getSettlementDirectionLabel } from '../utils/settlementPresentation'

type DeleteSettlementDialogProps = {
  settlement: SettlementRecord
  members: ExpenseReadMember[]
  isDeleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteSettlementDialog({
  settlement,
  members,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteSettlementDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        onCancel()
        return
      }

      if (event.key !== 'Tab') return

      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      )
      if (!buttons?.length) return

      const firstButton = buttons[0]
      const lastButton = buttons[buttons.length - 1]

      if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault()
        lastButton.focus()
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault()
        firstButton.focus()
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [isDeleting, onCancel])

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-settlement-title"
        aria-describedby={`delete-settlement-description${error ? ' delete-settlement-error' : ''}`}
      >
        <span className="delete-dialog-icon" aria-hidden="true">×</span>
        <h2 id="delete-settlement-title">¿Eliminar esta liquidación?</h2>
        <p id="delete-settlement-description">
          {getSettlementDirectionLabel(settlement, members)} · {formatCurrency(settlement.amount)}
        </p>
        {error && (
          <p className="delete-dialog-error" id="delete-settlement-error" role="alert">
            {error}
          </p>
        )}
        <div className="delete-dialog-actions">
          <button ref={cancelButtonRef} type="button" disabled={isDeleting} onClick={onCancel}>
            Cancelar
          </button>
          <button
            className="confirm-delete-button"
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? 'Eliminando…' : 'Eliminar liquidación'}
          </button>
        </div>
      </section>
    </div>
  )
}
