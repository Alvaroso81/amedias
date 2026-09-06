import type { SavingsGoal } from '../types/savings'
import { formatSavingsCents, savingsBalance } from '../utils/savings'

export function SavingsSummaryCard({ goals, loading, error, onOpen }: {
  goals: SavingsGoal[]; loading: boolean; error: string | null; onOpen: () => void
}) {
  const active = goals.filter(g => !g.archivedAt)
  const shared = active.filter(g => g.type === 'shared')
  const personal = active.filter(g => g.type === 'personal')
  const total = (items: SavingsGoal[]) => items.reduce((sum, goal) => sum + savingsBalance(goal), 0n)
  return (
    <button type="button" className="card savings-summary-card" onClick={onOpen}>
      <span className="savings-section-title">Ahorros <span aria-hidden="true">›</span></span>
      {loading ? <span>Cargando ahorros…</span> : error ? <span>No se han podido cargar. Abre Ahorros para reintentar.</span> : (
        <>
          <span>Ahorros compartidos</span>
          <strong>{formatSavingsCents(total(shared))}</strong>
          <small>{shared.length} {shared.length === 1 ? 'objetivo activo' : 'objetivos activos'}</small>
          {personal.length > 0 && <span className="savings-personal-total">Personal <b>{formatSavingsCents(total(personal))}</b></span>}
        </>
      )}
    </button>
  )
}
