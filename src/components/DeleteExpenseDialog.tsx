import { useEffect, useRef } from 'react'
import type { Expense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'

type DeleteExpenseDialogProps = {
  expense: Expense
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteExpenseDialog({
  expense,
  onCancel,
  onConfirm,
}: DeleteExpenseDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()

    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button')
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
  }, [onCancel])

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <span className="delete-dialog-icon" aria-hidden="true">
          ×
        </span>
        <h2 id="delete-dialog-title">¿Eliminar este gasto?</h2>
        <p id="delete-dialog-description">
          {expense.description} · {formatCurrency(expense.amount)}
        </p>
        <div className="delete-dialog-actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="confirm-delete-button" type="button" onClick={onConfirm}>
            Eliminar gasto
          </button>
        </div>
      </section>
    </div>
  )
}
