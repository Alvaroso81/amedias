import { useEffect, useRef } from 'react'
import type { ExpenseRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'

type DeleteExpenseDialogProps = {
  expense: ExpenseRecord
  onCancel: () => void
  onConfirm: () => void
  isDeleting: boolean
  error: string | null
}

export function DeleteExpenseDialog({
  expense,
  onCancel,
  onConfirm,
  isDeleting,
  error,
}: DeleteExpenseDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()

    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isDeleting) onCancel()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      )
      if (!focusableElements?.length) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleDialogKeyboard)
    return () => window.removeEventListener('keydown', handleDialogKeyboard)
  }, [isDeleting, onCancel])

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby={`delete-dialog-description${error ? ' delete-dialog-error' : ''}`}
      >
        <span className="delete-dialog-icon" aria-hidden="true">
          ×
        </span>
        <h2 id="delete-dialog-title">¿Eliminar este gasto?</h2>
        <p id="delete-dialog-description">
          {expense.description} · {formatCurrency(expense.amount)}
        </p>
        {error && (
          <p className="delete-dialog-error" id="delete-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="delete-dialog-actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel} disabled={isDeleting}>
            Cancelar
          </button>
          <button
            className="confirm-delete-button"
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Eliminando…' : 'Eliminar gasto'}
          </button>
        </div>
      </section>
    </div>
  )
}
