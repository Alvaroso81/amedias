import type { ExpenseRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatExpenseGroupDate } from '../utils/formatDate'
import { getExpensePayerText } from '../utils/expensePresentation'

type ExpenseHistoryListProps = {
  expenses: ExpenseRecord[]
  emptyTitle: string
  emptyMessage: string
  onSelectExpense: (expenseId: string) => void
}

export function ExpenseHistoryList({
  expenses,
  emptyTitle,
  emptyMessage,
  onSelectExpense,
}: ExpenseHistoryListProps) {
  if (expenses.length === 0) {
    return (
      <div className="card empty-expenses-state">
        <span aria-hidden="true">⌕</span>
        <h2>{emptyTitle}</h2>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  const groupedExpenses = expenses.reduce<Map<string, ExpenseRecord[]>>((groups, expense) => {
    const dateExpenses = groups.get(expense.expenseDate) ?? []
    dateExpenses.push(expense)
    groups.set(expense.expenseDate, dateExpenses)
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
                  {expense.category.icon}
                </span>
                <span className="history-expense-copy">
                  <strong>{expense.description}</strong>
                  <span>{expense.category.name}</span>
                  <small>{getExpensePayerText(expense)}</small>
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
