import { supabase } from './supabase'
import type {
  CommonFundMovement,
  CommonFundMovementType,
  CommonFundState,
} from '../types/commonFund'

const knownCommonFundErrors = [
  'Debes iniciar sesión para usar el fondo común',
  'Debes iniciar sesión para recargar el fondo común',
  'Debes iniciar sesión para ajustar el fondo común',
  'Debes iniciar sesión para configurar el fondo común',
  'No perteneces al hogar indicado',
  'El fondo común requiere exactamente dos miembros',
  'El fondo común está desactivado',
  'La recarga debe ser mayor que 0 y tener como máximo dos decimales',
  'El saldo objetivo debe ser 0 o mayor y tener como máximo dos decimales',
  'La aportación mensual debe ser 0 o mayor y tener como máximo dos decimales',
]

export class CommonFundServiceError extends Error {}

function getSafeFundError(error: { message: string }, fallback: string) {
  return knownCommonFundErrors.find((message) => error.message.includes(message)) ?? fallback
}

export async function loadCommonFundState(householdId: string): Promise<CommonFundState> {
  const [settingsResult, movementsResult] = await Promise.all([
    supabase
      .from('common_fund_settings')
      .select('household_id, enabled, monthly_amount, carry_over, created_at, updated_at')
      .eq('household_id', householdId)
      .maybeSingle(),
    supabase
      .from('common_fund_movements')
      .select(
        'id, household_id, movement_type, amount_delta, expense_id, period_month, note, created_at, updated_at',
      )
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (settingsResult.error || movementsResult.error) {
    throw new CommonFundServiceError('No hemos podido cargar el fondo común.')
  }

  const expenseIds = movementsResult.data
    .map((movement) => movement.expense_id)
    .filter((expenseId): expenseId is string => Boolean(expenseId))

  const expensesResult = expenseIds.length
    ? await supabase
        .from('expenses')
        .select('id, description, expense_date, category_id')
        .in('id', expenseIds)
    : { data: [], error: null }

  if (expensesResult.error) {
    throw new CommonFundServiceError('No hemos podido cargar el histórico del fondo común.')
  }

  const categoryIds = expensesResult.data
    .map((expense) => expense.category_id)
    .filter((categoryId): categoryId is string => Boolean(categoryId))
  const categoriesResult = categoryIds.length
    ? await supabase.from('categories').select('id, name, icon').in('id', categoryIds)
    : { data: [], error: null }

  if (categoriesResult.error) {
    throw new CommonFundServiceError('No hemos podido cargar el histórico del fondo común.')
  }

  const categoriesById = new Map(
    categoriesResult.data.map((category) => [category.id, category]),
  )
  const expensesById = new Map(expensesResult.data.map((expense) => [expense.id, expense]))
  const movements: CommonFundMovement[] = movementsResult.data.map((movement) => {
    const expense = movement.expense_id ? expensesById.get(movement.expense_id) : undefined
    const category = expense?.category_id
      ? categoriesById.get(expense.category_id)
      : undefined

    return {
      id: movement.id,
      householdId: movement.household_id,
      movementType: movement.movement_type as CommonFundMovementType,
      amountDelta: Number(movement.amount_delta),
      expenseId: movement.expense_id,
      periodMonth: movement.period_month,
      note: movement.note ?? '',
      createdAt: movement.created_at,
      updatedAt: movement.updated_at,
      expenseDescription: expense?.description ?? null,
      expenseDate: expense?.expense_date ?? null,
      categoryName: category?.name ?? null,
      categoryIcon: category?.icon ?? null,
    }
  })

  const settings = settingsResult.data
    ? {
        householdId: settingsResult.data.household_id,
        enabled: settingsResult.data.enabled,
        monthlyAmount: Number(settingsResult.data.monthly_amount),
        carryOver: settingsResult.data.carry_over,
        createdAt: settingsResult.data.created_at,
        updatedAt: settingsResult.data.updated_at,
      }
    : null

  return {
    settings,
    balance: Math.round(movements.reduce((total, movement) => total + movement.amountDelta, 0) * 100) / 100,
    movements,
  }
}

export async function ensureMonthlyCommonFund(householdId: string, month: string) {
  const { data, error } = await supabase.rpc('ensure_monthly_common_fund', {
    p_household_id: householdId,
    p_month: month,
  })

  if (error) {
    throw new CommonFundServiceError(
      getSafeFundError(error, 'No hemos podido preparar la aportación mensual.'),
    )
  }

  return typeof data === 'string' ? data : null
}

export async function topUpCommonFund(householdId: string, amount: number, note: string) {
  const { data, error } = await supabase.rpc('top_up_common_fund', {
    p_household_id: householdId,
    p_amount: amount,
    p_note: note || null,
  })

  if (error) {
    throw new CommonFundServiceError(
      getSafeFundError(error, 'No hemos podido recargar el fondo común.'),
    )
  }

  if (typeof data !== 'string') {
    throw new CommonFundServiceError('La recarga se guardó sin identificador.')
  }

  return data
}

export async function setCommonFundBalance(
  householdId: string,
  targetBalance: number,
  note: string,
) {
  const { data, error } = await supabase.rpc('set_common_fund_balance', {
    p_household_id: householdId,
    p_target_balance: targetBalance,
    p_note: note || null,
  })

  if (error) {
    throw new CommonFundServiceError(
      getSafeFundError(error, 'No hemos podido ajustar el fondo común.'),
    )
  }

  return typeof data === 'string' ? data : null
}

export async function saveCommonFundSettings(
  householdId: string,
  monthlyAmount: number,
  enabled: boolean,
) {
  const { data, error } = await supabase.rpc('update_common_fund_settings', {
    p_household_id: householdId,
    p_monthly_amount: monthlyAmount,
    p_enabled: enabled,
  })

  if (error) {
    throw new CommonFundServiceError(
      getSafeFundError(error, 'No hemos podido guardar la configuración del fondo común.'),
    )
  }

  return data
}
