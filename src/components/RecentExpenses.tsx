import type { Expense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'

type RecentExpensesProps = {
  expenses: Expense[]
}

export function RecentExpenses({ expenses }: RecentExpensesProps) {
  return (
    <section className="section-block" aria-labelledby="recent-expenses-title">
      <div className="section-heading">
        <h2 id="recent-expenses-title">Últimos gastos</h2>
        <button className="text-button" type="button">
          Ver todos los gastos
        </button>
      </div>

      <div className="card expense-list">
        {expenses.map((expense) => (
          <button className="expense-item" type="button" key={expense.id}>
            <span className="expense-icon" aria-hidden="true">
              {expense.icon}
            </span>
            <span className="expense-details">
              <strong>{expense.description}</strong>
              <span>{expense.category}</span>
              <small>
                Pagó {expense.paidBy} · {expense.displayDate ?? expense.date}
              </small>
            </span>
            <strong className="expense-amount">{formatCurrency(expense.amount)}</strong>
            <span className="expense-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
