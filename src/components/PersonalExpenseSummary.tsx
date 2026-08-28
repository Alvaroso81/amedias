import './PersonalExpenseSummary.css'
import { formatCurrency } from '../utils/formatCurrency'

type PersonalExpenseSummaryProps = {
  total: number
  expenseCount: number
  onViewPersonalStatistics: () => void
}

export function PersonalExpenseSummary({
  total,
  expenseCount,
  onViewPersonalStatistics,
}: PersonalExpenseSummaryProps) {
  return (
    <section
      className="card personal-expense-card"
      aria-labelledby="personal-expense-summary-title"
    >
      <div>
        <p id="personal-expense-summary-title">Tus gastos personales</p>
        <span>Este mes</span>
      </div>

      <strong>{formatCurrency(total)}</strong>

      <div className="personal-expense-card__footer">
        <span>{expenseCount} {expenseCount === 1 ? 'gasto' : 'gastos'}</span>
        <button type="button" onClick={onViewPersonalStatistics}>
          Ver personales <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  )
}
