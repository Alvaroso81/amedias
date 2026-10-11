import { NavigationBackButton } from '../components/NavigationBackButton'
import { ExpenseDataState } from '../components/ExpenseDataState'
import type { SavingsGoal } from '../types/savings'
import { formatSavingsCents, savingsBalance, savingsProgress } from '../utils/savings'

export function SavingsPage({ goals, loading, error, onRetry, onBack, onCreate, onOpen }: {
  goals: SavingsGoal[]; loading: boolean; error: string | null
  onRetry: () => void; onBack: () => void; onCreate: () => void; onOpen: (id: string) => void
}) {
  return <div className="savings-page">
    <header className="add-expense-header"><NavigationBackButton onBack={onBack} /><h1>Ahorros</h1></header>
    <button type="button" className="save-expense-button" onClick={onCreate}>Nuevo ahorro</button>
    {loading || error ? <ExpenseDataState loading={loading} title={loading ? 'Cargando ahorros' : 'No hemos podido cargar los ahorros'} message={error ?? 'Estamos preparando tus objetivos.'} onRetry={error ? onRetry : undefined} /> :
      (['shared', 'personal', 'archived'] as const).map(section => {
        const items = goals.filter(g => section === 'archived' ? Boolean(g.archivedAt) : !g.archivedAt && g.type === section)
        return <section className="savings-section" key={section}>
          <h2>{section === 'shared' ? 'Compartidos' : section === 'personal' ? 'Personales' : 'Archivados'}</h2>
          {items.length ? <div className="savings-grid">{items.map(goal => <button type="button" className="card savings-goal-card" key={goal.id} onClick={() => onOpen(goal.id)}>
            <span className="savings-type">{goal.type === 'personal' ? 'Personal' : 'Compartido'}</span>
            <h3>{goal.name}</h3>
            <SavingsAmount goal={goal} />
          </button>)}</div> : <p className="section-empty-copy">No hay ahorros {section === 'shared' ? 'compartidos' : section === 'personal' ? 'personales' : 'archivados'}.</p>}
        </section>
      })}
  </div>
}

export function SavingsAmount({ goal }: { goal: SavingsGoal }) {
  const balance = savingsBalance(goal)
  const progress = savingsProgress(balance, goal.targetAmountCents)
  return <div className="savings-amount">
    <strong>{formatSavingsCents(balance)}</strong>
    {goal.targetAmountCents !== null && <>
      <span>de {formatSavingsCents(goal.targetAmountCents)}</span>
      <progress max={100} value={Math.min(100, Math.max(0, progress ?? 0))} aria-label="Progreso del ahorro" />
      <small>{progress} % del objetivo</small>
    </>}
  </div>
}
