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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.showModal()
    cancelButtonRef.current?.focus()
    return () => {
      dialog?.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="delete-dialog"
      onCancel={(event) => {
        event.preventDefault()
        if (!isDeleting) onCancel()
      }}
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
    </dialog>
  )
}
