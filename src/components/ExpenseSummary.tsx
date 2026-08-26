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
          <div className="contribution" key={contribution.name}>
            <span className="contribution-name">{contribution.name}</span>
            <strong>{formatCurrency(contribution.amount)}</strong>
            <span>{contribution.percentage} %</span>
          </div>
        ))}
      </div>

      <div
        className="contribution-bar"
        role="img"
        aria-label={`${contributions[0].name} aporta ${contributions[0].percentage} por ciento y ${contributions[1].name} aporta ${contributions[1].percentage} por ciento`}
      >
        <span style={{ width: `${contributions[0].percentage}%` }} />
        <span style={{ width: `${contributions[1].percentage}%` }} />
      </div>
    </section>
  )
}
