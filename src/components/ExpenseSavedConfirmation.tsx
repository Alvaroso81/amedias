import type { Expense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'

type ExpenseSavedConfirmationProps = {
  expense: Expense
  onUndo: () => void
}

export function ExpenseSavedConfirmation({
  expense,
  onUndo,
}: ExpenseSavedConfirmationProps) {
  return (
    <section className="card expense-saved-card" role="status" aria-live="polite">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <h2>Gasto guardado</h2>
      <p className="saved-expense-summary">
        {formatCurrency(expense.amount)} · {expense.description}
      </p>
      <p className="saved-expense-payer">Pagado por {expense.paidBy}</p>
      <button className="undo-button" type="button" onClick={onUndo}>
        Deshacer
      </button>
    </section>
  )
}
