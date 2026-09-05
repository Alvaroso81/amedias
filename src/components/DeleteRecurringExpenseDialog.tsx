import { useEffect, useRef } from 'react'
import type { RecurringExpense } from '../types/recurringExpenses'

type DeleteRecurringExpenseDialogProps = {
  recurringExpense: RecurringExpense
  onCancel: () => void
  onConfirm: () => void
  isDeleting: boolean
  error: string | null
}

export function DeleteRecurringExpenseDialog({
  recurringExpense,
  onCancel,
  onConfirm,
  isDeleting,
  error,
}: DeleteRecurringExpenseDialogProps) {
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

      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
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
        aria-labelledby="delete-recurring-title"
        aria-describedby={`delete-recurring-description${error ? ' delete-recurring-error' : ''}`}
      >
        <span className="delete-dialog-icon" aria-hidden="true">×</span>
        <h2 id="delete-recurring-title">¿Eliminar este gasto recurrente?</h2>
        <p id="delete-recurring-description">
          Dejará de generar nuevos gastos. Los gastos ya registrados se conservarán.
        </p>
        <strong className="delete-recurring-name">{recurringExpense.description}</strong>
        {error && (
          <p className="delete-dialog-error" id="delete-recurring-error" role="alert">{error}</p>
        )}
        <div className="delete-dialog-actions">
          <button ref={cancelButtonRef} type="button" disabled={isDeleting} onClick={onCancel}>
            Cancelar
          </button>
          <button className="confirm-delete-button" type="button" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? 'Eliminando…' : 'Eliminar recurrente'}
          </button>
        </div>
      </section>
    </div>
  )
}
