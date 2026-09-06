import { supabase } from './supabase'
import { getHouseholdMembers } from './householdInvites'
import type { SavingsGoal, SavingsGoalInput, SavingsParticipant } from '../types/savings'

const errors: Record<string, string> = {
  SAVINGS_ACCESS_DENIED: 'No tienes acceso a este ahorro.',
  SAVINGS_PARTICIPANTS_INVALID: 'Selecciona participantes del hogar y porcentajes enteros de 0 a 100.',
  SAVINGS_PERCENTAGES_INVALID: 'Los porcentajes deben sumar 100 % y debes formar parte del ahorro.',
  SAVINGS_PARTICIPANTS_LOCKED: 'No puedes cambiar el reparto cuando ya existen movimientos.',
  SAVINGS_ARCHIVED: 'Reactiva el ahorro para poder modificarlo.',
  SAVINGS_GOAL_INVALID: 'Revisa el nombre y el objetivo del ahorro.',
  SAVINGS_MOVEMENT_INVALID: 'Revisa el importe y la fecha del movimiento.',
  SAVINGS_INSUFFICIENT_BALANCE: 'El importe supera el saldo disponible.',
}
export class SavingsServiceError extends Error {}

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result: T[] = []
  for (let from = 0; ; from += 500) {
    const response = await page(from, from + 499)
    if (response.error) throw new SavingsServiceError('No hemos podido cargar los ahorros.')
    const rows = response.data ?? []
    result.push(...rows)
    if (rows.length < 500) return result
  }
}

export async function loadSavings(householdId: string) {
  const [goals, participants, movements, members] = await Promise.all([
    allRows((from, to) => supabase.from('savings_goals')
      .select('id,name,type,owner_user_id,target_amount_cents,target_date,archived_at')
      .eq('household_id', householdId).order('id').range(from, to)),
    allRows((from, to) => supabase.from('savings_goal_participants')
      .select('goal_id,user_id,percentage,savings_goals!inner(household_id)')
      .eq('savings_goals.household_id', householdId).order('goal_id').order('user_id').range(from, to)),
    allRows((from, to) => supabase.from('savings_movements')
      .select('id,goal_id,movement_type,amount_cents,contributor_user_id,movement_date,note,savings_goals!inner(household_id)')
      .eq('savings_goals.household_id', householdId).order('movement_date', { ascending: false })
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    getHouseholdMembers(householdId),
  ])
  const mapped: SavingsGoal[] = goals.map(goal => ({
    id: goal.id, name: goal.name, type: goal.type === 'personal' ? 'personal' : 'shared',
    ownerUserId: goal.owner_user_id,
    targetAmountCents: goal.target_amount_cents === null ? null : BigInt(goal.target_amount_cents),
    targetDate: goal.target_date, archivedAt: goal.archived_at,
    participants: participants.filter(p => p.goal_id === goal.id).map(p => ({ userId: p.user_id, percentage: p.percentage })),
    movements: movements.filter(m => m.goal_id === goal.id).map(m => ({
      id: m.id, type: m.movement_type === 'contribution' ? 'contribution' : 'withdrawal',
      amountCents: BigInt(m.amount_cents), contributorUserId: m.contributor_user_id,
      movementDate: m.movement_date, note: m.note ?? '',
    })),
  }))
  return { goals: mapped, members }
}

function participantsPayload(participants: SavingsParticipant[] | null) {
  return participants?.map(p => ({ user_id: p.userId, percentage: p.percentage })) ?? null
}

async function mutate(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new SavingsServiceError(errors[error.message] ?? 'No hemos podido guardar el ahorro. Vuelve a intentarlo.')
  if (typeof data !== 'string') throw new SavingsServiceError('No hemos recibido el identificador del ahorro.')
  return data
}
export function createSavingsGoal(householdId: string, input: SavingsGoalInput) {
  return mutate('create_savings_goal', {
    p_household_id: householdId, p_name: input.name, p_type: input.type,
    p_target_amount_cents: input.targetAmountCents?.toString() ?? null,
    p_target_date: input.targetDate, p_participants: participantsPayload(input.participants),
  })
}
export function updateSavingsGoal(goalId: string, input: SavingsGoalInput) {
  return mutate('update_savings_goal', {
    p_goal_id: goalId, p_name: input.name,
    p_target_amount_cents: input.targetAmountCents?.toString() ?? null,
    p_target_date: input.targetDate, p_participants: participantsPayload(input.participants),
  })
}
export function setSavingsArchived(goalId: string, archived: boolean) {
  return mutate('set_savings_goal_archived', { p_goal_id: goalId, p_archived: archived })
}
export function addSavingsContribution(goalId: string, amount: bigint, contributor: string, date: string, note: string) {
  return mutate('add_savings_contribution', {
    p_goal_id: goalId, p_amount_cents: amount.toString(), p_contributor_user_id: contributor,
    p_movement_date: date, p_note: note || null,
  })
}
export function withdrawSavings(goalId: string, amount: bigint, date: string, note: string) {
  return mutate('withdraw_from_savings_goal', {
    p_goal_id: goalId, p_amount_cents: amount.toString(), p_movement_date: date, p_note: note || null,
  })
}
