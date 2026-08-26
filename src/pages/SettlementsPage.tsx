import { ExpenseDataState } from '../components/ExpenseDataState'
import type { ExpenseReadMember, SettlementRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'
import { getSettlementDirectionLabel } from '../utils/settlementPresentation'

type SettlementsPageProps = {
  settlements: SettlementRecord[]
  members: ExpenseReadMember[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onBack: () => void
  onSelectSettlement: (settlementId: string) => void
}

export function SettlementsPage({
  settlements,
  members,
  loading,
  error,
  onRetry,
  onBack,
  onSelectSettlement,
}: SettlementsPageProps) {
  return (
    <div className="settlements-page">
      <header className="add-expense-header detail-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="Volver a Ajustes">
          <span aria-hidden="true">←</span>
        </button>
        <div>
          <span>Histórico</span>
          <h1>Liquidaciones</h1>
        </div>
      </header>

      {loading ? (
        <ExpenseDataState
          loading
          title="Cargando liquidaciones"
          message="Estamos recuperando los movimientos del hogar…"
        />
      ) : error ? (
        <ExpenseDataState
          title="No hemos podido cargar las liquidaciones"
          message={error}
          onRetry={onRetry}
        />
      ) : settlements.length === 0 ? (
        <section className="card settlements-empty-state">
          <span aria-hidden="true">↔</span>
          <h2>Aún no hay liquidaciones</h2>
          <p>Cuando saldéis cuentas aparecerán aquí.</p>
        </section>
      ) : (
        <section className="card settlements-list" aria-label="Histórico de liquidaciones">
          {settlements.map((settlement) => (
            <button
              className="settlement-list-item"
              type="button"
              key={settlement.id}
              onClick={() => onSelectSettlement(settlement.id)}
            >
              <span className="settlement-list-icon" aria-hidden="true">↔</span>
              <span className="settlement-list-copy">
                <small>{formatLongDate(settlement.settlementDate)}</small>
                <strong>{getSettlementDirectionLabel(settlement, members)}</strong>
              </span>
              <strong className="settlement-list-amount">
                {formatCurrency(settlement.amount)}
              </strong>
              <span className="expense-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
