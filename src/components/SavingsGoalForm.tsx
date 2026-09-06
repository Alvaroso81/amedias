import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SavingsGoal, SavingsMember } from '../types/savings'
import { createSavingsGoal, updateSavingsGoal } from '../services/savings'
import { parseSavingsCents, savingsCentsInput } from '../utils/savings'

export function SavingsGoalForm({ householdId, currentUserId, members, goal, onBack, onSaved }: {
  householdId: string; currentUserId: string; members: SavingsMember[]; goal?: SavingsGoal
  onBack: () => void; onSaved: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(goal?.name ?? '')
  const [type, setType] = useState<'personal' | 'shared'>(goal?.type ?? 'personal')
  const [target, setTarget] = useState(goal?.targetAmountCents ? savingsCentsInput(goal.targetAmountCents) : '')
  const [date, setDate] = useState(goal?.targetDate ?? '')
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    Object.fromEntries(goal ? goal.participants.map(p => [p.userId, String(p.percentage)]) :
      members.map((m, i) => [m.userId, String(Math.floor(100 / members.length) + (i < 100 % members.length ? 1 : 0))])))
  const [selected, setSelected] = useState<string[]>(goal ? goal.participants.map(p => p.userId) : members.map(m => m.userId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = Boolean(goal?.movements.length)
  const total = selected.reduce((sum, id) => sum + Number(percentages[id] ?? 0), 0)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError(null)
    try {
      if (!name.trim()) throw new Error('Escribe un nombre para el ahorro.')
      const participants = selected.map(userId => ({ userId, percentage: Number(percentages[userId]) }))
      if (type === 'shared' && !locked && (!selected.includes(currentUserId) || total !== 100 ||
        selected.some(id => !/^\d{1,3}$/.test(percentages[id] ?? '')) ||
        participants.some(p => !Number.isInteger(p.percentage) || p.percentage < 0 || p.percentage > 100))) {
        throw new Error('Selecciona participantes y porcentajes enteros que sumen 100 %. Debes estar incluido.')
      }
      const input = { name: name.trim(), type, targetAmountCents: target.trim() ? parseSavingsCents(target) : null,
        targetDate: date || null, participants: type === 'shared' && !locked ? participants : null }
      setSaving(true)
      const id = goal ? await updateSavingsGoal(goal.id, input) : await createSavingsGoal(householdId, input)
      await onSaved(id)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No hemos podido guardar el ahorro.') }
    finally { setSaving(false) }
  }
  return <div className="savings-page">
    <header className="add-expense-header"><button className="back-button" type="button" onClick={onBack} disabled={saving} aria-label="Volver">←</button><h1>{goal ? 'Editar ahorro' : 'Nuevo ahorro'}</h1></header>
    <form className="card savings-form" onSubmit={event => void submit(event)}>
      <fieldset disabled={saving}>
        <label>Nombre<input required value={name} onChange={e => setName(e.target.value)} autoComplete="off" placeholder="Viaje a Japón" /></label>
        {!goal && <label>Tipo<select value={type} onChange={e => setType(e.target.value as 'personal' | 'shared')}><option value="personal">Personal</option><option value="shared">Compartido</option></select></label>}
        <p className="savings-help">{type === 'personal' ? 'Solo tú puedes ver y gestionar este ahorro.' : 'Solo sus participantes pueden verlo y gestionarlo.'}</p>
        <label>Objetivo económico (opcional)<input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="0,00 €" /></label>
        <label>Fecha objetivo (opcional)<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {type === 'shared' && <fieldset disabled={locked} className="savings-participants-form">
          <legend>Participantes y porcentaje objetivo</legend>
          {(locked && goal ? goal.participants.map(p => ({ userId: p.userId, displayName: members.find(m => m.userId === p.userId)?.displayName ?? 'Antiguo miembro' })) : members).map(member => <div className="savings-participant-input" key={member.userId}>
            <label><input type="checkbox" checked={selected.includes(member.userId)} disabled={member.userId === currentUserId}
              onChange={e => setSelected(ids => e.target.checked ? [...ids, member.userId] : ids.filter(id => id !== member.userId))} />{member.displayName}</label>
            {selected.includes(member.userId) && <label className="savings-percentage"><input aria-label={'Porcentaje de ' + member.displayName} inputMode="numeric" value={percentages[member.userId] ?? '0'} onChange={e => setPercentages(current => ({ ...current, [member.userId]: e.target.value }))} />%</label>}
          </div>)}
          <p className="savings-help">Total: {Number.isFinite(total) ? total : '—'} % · debe sumar 100 %</p>
        </fieldset>}
        {type === 'shared' && locked && <p className="savings-help">El reparto queda fijo porque este ahorro ya tiene movimientos.</p>}
        {error && <p role="alert" className="expense-submit-error">{error}</p>}
        <div className="savings-actions"><button type="button" className="auth-secondary-button" onClick={onBack}>Cancelar</button><button className="save-expense-button" type="submit">{saving ? 'Guardando…' : goal ? 'Guardar cambios' : 'Crear ahorro'}</button></div>
      </fieldset>
    </form>
  </div>
}
