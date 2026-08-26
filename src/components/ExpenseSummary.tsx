import type { PersonContribution } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'

type ExpenseSummaryProps = {
  total: number
  contributions: PersonContribution[]
}

export function ExpenseSummary({ total, contributions }: ExpenseSummaryProps) {
  return (
    <section className="card summary-card" aria-labelledby="expense-summary-title">
      <p className="card-label" id="expense-summary-title">
        Gastado este mes
      </p>
      <p className="summary-total">{formatCurrency(total)}</p>

      <div className="contribution-list">
        {contributions.map((contribution) => (
          <div className="contribution" key={contribution.id ?? contribution.name}>
            <span className="contribution-name">{contribution.name}</span>
            <strong>{formatCurrency(contribution.amount)}</strong>
            <span>{contribution.percentage} %</span>
          </div>
        ))}
      </div>

      <div
        className="contribution-bar"
        role="img"
        aria-label={contributions
          .map(
            (contribution) =>
              `${contribution.name} aporta ${contribution.percentage} por ciento`,
          )
          .join(' y ')}
      >
        {contributions.map((contribution) => (
          <span
            key={contribution.id ?? contribution.name}
            style={{ width: `${contribution.percentage}%` }}
          />
        ))}
      </div>
    </section>
  )
}
