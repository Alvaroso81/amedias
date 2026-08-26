import type { Expense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'
import { formatExpenseGroupDate } from '../utils/formatDate'

type ExpenseHistoryListProps = {
  expenses: Expense[]
  onSelectExpense: (expenseId: string) => void
}

export function ExpenseHistoryList({ expenses, onSelectExpense }: ExpenseHistoryListProps) {
  if (expenses.length === 0) {
    return (
      <div className="card empty-expenses-state">
        <span aria-hidden="true">⌕</span>
        <h2>No hay gastos</h2>
        <p>Prueba con otra búsqueda o limpia los filtros.</p>
      </div>
    )
  }

  const groupedExpenses = expenses.reduce<Map<string, Expense[]>>((groups, expense) => {
    const dateExpenses = groups.get(expense.date) ?? []
    dateExpenses.push(expense)
    groups.set(expense.date, dateExpenses)
    return groups
  }, new Map())

  return (
    <div className="expense-history">
      {[...groupedExpenses.entries()].map(([date, dateExpenses]) => (
        <section className="expense-date-group" aria-labelledby={`expenses-${date}`} key={date}>
          <h2 id={`expenses-${date}`}>{formatExpenseGroupDate(date)}</h2>
          <div className="card history-expense-list">
            {dateExpenses.map((expense) => (
              <button
                className="history-expense-row"
                type="button"
                key={expense.id}
                onClick={() => onSelectExpense(expense.id)}
              >
                <span className="history-expense-icon" aria-hidden="true">
                  {expense.icon}
                </span>
                <span className="history-expense-copy">
                  <strong>{expense.description}</strong>
                  <span>{expense.category}</span>
                  <small>Pagó {expense.paidBy}</small>
                </span>
                <strong className="history-expense-amount">{formatCurrency(expense.amount)}</strong>
                <span className="history-expense-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
