import { NavigationBackButton } from '../components/NavigationBackButton'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SavingsGoal, SavingsMember } from '../types/savings'
import { SavingsGoalForm } from '../components/SavingsGoalForm'
import { SavingsAmount } from './SavingsPage'
import { addSavingsContribution, withdrawSavings, setSavingsArchived } from '../services/savings'
import { formatSavingsCents, parseSavingsCents, savingsBalance, savingsContributed, savingsTargetShares } from '../utils/savings'
import { formatShortDate, getTodayIsoDate } from '../utils/formatDate'

export function SavingsDetailPage({ goal, householdId, currentUserId, members, onBack, onChanged, mode = 'detail', onOpenMode }: {
  goal: SavingsGoal; householdId: string; currentUserId: string; members: SavingsMember[]
  onBack: () => void; onChanged: () => Promise<unknown>
  mode?: 'detail' | 'edit' | 'contribution' | 'withdrawal'
  onOpenMode: (mode: 'edit' | 'contribution' | 'withdrawal') => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shares = goal.targetAmountCents ? savingsTargetShares(goal.targetAmountCents, goal.participants) : null
  const memberName = (id: string) => members.find(m => m.userId === id)?.displayName ?? 'Antiguo miembro'
  const archive = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try { await setSavingsArchived(goal.id, !goal.archivedAt); await onChanged() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No hemos podido cambiar el estado.') }
    finally { setBusy(false) }
  }
  if (mode === 'edit') return <SavingsGoalForm householdId={householdId} currentUserId={currentUserId} members={members} goal={goal}
    onBack={onBack} onSaved={async () => { await onChanged(); onBack() }} />
  if (mode !== 'detail') return <SavingsMovementForm goal={goal} mode={mode} currentUserId={currentUserId} members={members}
    onBack={onBack} onSaved={async () => { await onChanged(); onBack() }} />
  return <div className="savings-page">
    <header className="add-expense-header"><NavigationBackButton onBack={onBack} /><h1>{goal.name}</h1></header>
    <section className="card savings-detail-hero">
      <span className="savings-type">{goal.type === 'personal' ? 'Personal' : 'Compartido'}{goal.archivedAt ? ' · Archivado' : ''}</span>
      <p>Saldo actual</p><SavingsAmount goal={goal} />
      {!goal.targetAmountCents && <p>Sin objetivo económico</p>}
      {goal.targetDate && <p>Fecha objetivo: {formatShortDate(goal.targetDate)}</p>}
    </section>
    {error && <p className="expense-submit-error" role="alert">{error}</p>}
    {!goal.archivedAt && <div className="savings-actions">
      <button type="button" className="save-expense-button" disabled={busy} onClick={() => onOpenMode('contribution')}>Añadir ahorro</button>
      <button type="button" className="auth-secondary-button" disabled={busy || savingsBalance(goal) <= 0n} onClick={() => onOpenMode('withdrawal')}>Retirar</button>
      <button type="button" className="auth-secondary-button" disabled={busy} onClick={() => onOpenMode('edit')}>Editar</button>
    </div>}
    {goal.type === 'shared' && <section className="card savings-participants">
      <h2>Participantes</h2>
      {goal.participants.map(p => <div className="savings-participant-row" key={p.userId}>
        <strong>{memberName(p.userId)} <span>{p.percentage} %</span></strong>
        <span>Aportado: {formatSavingsCents(savingsContributed(goal, p.userId))}</span>
        {shares && <small>Objetivo proporcional: {formatSavingsCents(shares.get(p.userId) ?? 0n)}</small>}
      </div>)}
      <p className="savings-help">Las aportaciones históricas se conservan al retirar. El porcentaje es un objetivo de ahorro, no una deuda.</p>
    </section>}
    <section className="card savings-movements">
      <h2>Movimientos</h2>
      {goal.movements.length ? <ul>{goal.movements.map(m => <li key={m.id}>
        <div><strong className={m.type === 'contribution' ? 'savings-positive' : ''}>{m.type === 'contribution' ? '+ ' : '− '}{formatSavingsCents(m.amountCents)}</strong>
          <span>{m.type === 'contribution' ? memberName(m.contributorUserId ?? '') : 'Retirada'}</span>{m.note && <small>{m.note}</small>}</div>
        <time dateTime={m.movementDate}>{formatShortDate(m.movementDate)}</time>
      </li>)}</ul> : <p className="section-empty-copy">Todavía no hay movimientos.</p>}
    </section>
    <button className="auth-secondary-button" type="button" disabled={busy} onClick={() => void archive()}>{busy ? 'Guardando…' : goal.archivedAt ? 'Reactivar ahorro' : 'Archivar ahorro'}</button>
  </div>
}

function SavingsMovementForm({ goal, mode, currentUserId, members, onBack, onSaved }: {
  goal: SavingsGoal; mode: 'contribution' | 'withdrawal'; currentUserId: string; members: SavingsMember[]
  onBack: () => void; onSaved: () => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [contributor, setContributor] = useState(goal.ownerUserId ?? currentUserId)
  const [date, setDate] = useState(getTodayIsoDate)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    try {
      const cents = parseSavingsCents(amount)
      if (mode === 'withdrawal' && cents > savingsBalance(goal)) throw new Error('El importe supera el saldo disponible.')
      if (!date) throw new Error('Elige una fecha.')
      setBusy(true)
      if (mode === 'contribution') await addSavingsContribution(goal.id, cents, contributor, date, note)
      else await withdrawSavings(goal.id, cents, date, note)
      await onSaved()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No hemos podido guardar el movimiento.') }
    finally { setBusy(false) }
  }
  return <div className="savings-page">
    <header className="add-expense-header"><NavigationBackButton onBack={onBack} disabled={busy} /><h1>{mode === 'contribution' ? 'Añadir ahorro' : 'Retirar'}</h1></header>
    <form className="card savings-form" onSubmit={event => void submit(event)}>
      <h2>{goal.name}</h2><p>Disponible: {formatSavingsCents(savingsBalance(goal))}</p>
      <fieldset disabled={busy}>
        <label>Importe<input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00 €" /></label>
        {mode === 'contribution' && <label>Quién aporta<select value={contributor} disabled={goal.type === 'personal'} onChange={e => setContributor(e.target.value)}>
          {goal.participants.filter(p => members.some(m => m.userId === p.userId)).map(p => <option value={p.userId} key={p.userId}>{members.find(m => m.userId === p.userId)?.displayName}</option>)}
        </select></label>}
        <label>Fecha<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Nota (opcional)<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} /></label>
        {error && <p className="expense-submit-error" role="alert">{error}</p>}
        <div className="savings-actions"><button type="button" className="auth-secondary-button" onClick={onBack}>Cancelar</button><button type="submit" className="save-expense-button">{busy ? 'Guardando…' : mode === 'contribution' ? 'Añadir ahorro' : 'Retirar'}</button></div>
      </fieldset>
    </form>
  </div>
}
