import type { PersonContribution } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'
import { formatShortDate } from '../utils/formatDate'

type ExpenseSummaryProps = {
  total: number
  contributions: PersonContribution[]
  startDate: string
  maxDate: string
  isSavingStartDate: boolean
  startDateError: string | null
  onStartDateChange: (startDate: string) => void
}

export function ExpenseSummary({
  total,
  contributions,
  startDate,
  maxDate,
  isSavingStartDate,
  startDateError,
  onStartDateChange,
}: ExpenseSummaryProps) {
  return (
    <section className="card summary-card" aria-labelledby="expense-summary-title">
      <div className="summary-period-heading">
        <p className="card-label" id="expense-summary-title">
          Gastado en común desde
        </p>
        <label className="summary-date-control">
          <span>{formatShortDate(startDate)}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
          </svg>
          <input
            type="date"
            value={startDate}
            max={maxDate}
            disabled={isSavingStartDate}
            aria-label="Cambiar fecha de inicio del gasto común"
            onChange={(event) => onStartDateChange(event.target.value)}
          />
        </label>
      </div>
      <p className="summary-total">{formatCurrency(total)}</p>

      {startDateError && (
        <p className="summary-date-error" role="alert">
          {startDateError}
        </p>
      )}
      {isSavingStartDate && <span className="sr-only">Guardando fecha…</span>}

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
              `Con ${contribution.name} se pagó el ${contribution.percentage} por ciento`,
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
