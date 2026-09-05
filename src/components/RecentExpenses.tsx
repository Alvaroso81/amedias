import type { ExpenseRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatRelativeExpenseDate } from '../utils/formatDate'
import { getExpensePayerText } from '../utils/expensePresentation'

type RecentExpensesProps = {
  expenses: ExpenseRecord[]
  onSelectExpense: (expenseId: string) => void
  onViewAll: () => void
}

export function RecentExpenses({ expenses, onSelectExpense, onViewAll }: RecentExpensesProps) {
  return (
    <section className="section-block" aria-labelledby="recent-expenses-title">
      <div className="section-heading">
        <h2 id="recent-expenses-title">Últimos gastos</h2>
        <button className="text-button" type="button" onClick={onViewAll}>
          Ver todos los gastos
        </button>
      </div>

      <div className="card expense-list">
        {expenses.length ? expenses.map((expense) => (
          <button
            className="expense-item"
            type="button"
            key={expense.id}
            onClick={() => onSelectExpense(expense.id)}
          >
            <span className="expense-icon" aria-hidden="true">
              {expense.category.icon}
            </span>
            <span className="expense-details">
              <strong>{expense.description}</strong>
              <span>
                {expense.category.name}
                <span className="expense-privacy-mark">{expense.expenseType === 'personal' ? 'Personal' : 'Común'}</span>
                {expense.recurringExpense && (
                  <span className="expense-recurrence-mark">Recurrente</span>
                )}
              </span>
              <small>
                {expense.paymentSource === 'common_fund' && <span className="fund-history-mark" aria-hidden="true">◎</span>}
                {getExpensePayerText(expense)} · {formatRelativeExpenseDate(expense.expenseDate)}
              </small>
            </span>
            <strong className="expense-amount">{formatCurrency(expense.amount)}</strong>
            <span className="expense-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        )) : <p className="section-empty-copy">Aún no hay gastos recientes.</p>}
      </div>
    </section>
  )
}
