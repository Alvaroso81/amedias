import { supabase } from './supabase'
import type {
  ConfirmRecurringOccurrenceInput,
  RecurringExpense,
  RecurringExpenseInput,
  RecurringExpenseOccurrence,
  RecurringExpenseUpdateInput,
  RecurringSplitConfig,
} from '../types/recurringExpenses'

export class RecurringExpenseServiceError extends Error {}

const knownErrors: Record<string, string> = {
  RECURRING_AUTH_REQUIRED: 'Debes iniciar sesión para gestionar gastos recurrentes.',
  RECURRING_ACCESS_DENIED: 'No tienes acceso a este gasto recurrente.',
  RECURRING_DESCRIPTION_REQUIRED: 'Introduce un concepto.',
  RECURRING_AMOUNT_INVALID: 'Introduce un importe válido mayor que 0.',
  RECURRING_CATEGORY_INVALID: 'Selecciona una categoría activa del hogar.',
  RECURRING_EXPENSE_TYPE_INVALID: 'El tipo de gasto recurrente no es válido.',
  RECURRING_PAYMENT_SOURCE_INVALID: 'El origen del pago no es válido.',
  RECURRING_PAYER_INVALID: 'Selecciona una persona del hogar como pagador.',
  RECURRING_FUND_PAYER_MUST_BE_EMPTY: 'El fondo común no necesita pagador.',
  RECURRING_PERSONAL_OWNER_REQUIRED: 'Un gasto personal recurrente solo puede pertenecer a su creador.',
  RECURRING_FUND_COMMON_ONLY: 'El fondo común solo puede pagar gastos comunes.',
  RECURRING_FUND_SPLIT_INVALID: 'El fondo común requiere un reparto 50/50 entre dos miembros.',
  RECURRING_SPLITS_INVALID: 'El reparto debe incluir miembros válidos y sumar 100 %.',
  RECURRING_SCHEDULE_INVALID: 'Selecciona una frecuencia y un intervalo válidos.',
  RECURRING_DATES_INVALID: 'Revisa las fechas de la recurrencia.',
  RECURRING_ACTIVE_REQUIRED: 'Indica si la recurrencia está activa.',
  RECURRING_OCCURRENCE_ALREADY_RESOLVED: 'Esta ocurrencia ya se confirmó u omitió.',
}

function serviceError(error: { message: string } | null, fallback: string) {
  if (error) {
    const code = Object.keys(knownErrors).find((key) => error.message.includes(key))
    const financialMessage = [
      'No hay suficiente dinero en el fondo común.',
      'El fondo común está desactivado',
      'La categoría no pertenece al hogar o está archivada',
      'El reparto debe sumar',
    ].find((message) => error.message.includes(message))

    return new RecurringExpenseServiceError(
      (code && knownErrors[code]) || financialMessage || fallback,
    )
  }

  return new RecurringExpenseServiceError(fallback)
}

function splitPayload(splitConfig: RecurringSplitConfig[]) {
  return splitConfig.map((split) => ({
    user_id: split.userId,
    share_percent: split.sharePercent,
  }))
}

type RecurringRow = {
  id: string
  household_id: string
  created_by: string
  description: string
  amount_cents: number | string
  category_id: string
  expense_type: string
  payment_source: string
  payer_user_id: string | null
  split_config: Array<{ user_id: string; share_percent: number | string }>
  frequency: string
  interval_count: number
  start_date: string
  next_due_date: string
  end_date: string | null
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

function mapTemplate(
  row: RecurringRow,
  categories: Map<string, { name: string; icon: string | null; sort_order: number }>,
): RecurringExpense {
  const category = categories.get(row.category_id)

  return {
    id: row.id,
    householdId: row.household_id,
    createdBy: row.created_by,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    category: {
      id: row.category_id,
      name: category?.name ?? 'Categoría no disponible',
      icon: category?.icon ?? '📦',
      sortOrder: category?.sort_order ?? 0,
    },
    expenseType: row.expense_type === 'personal' ? 'personal' : 'common',
    paymentSource: row.payment_source === 'common_fund' ? 'common_fund' : 'member',
    payerUserId: row.payer_user_id,
    splitConfig: Array.isArray(row.split_config)
      ? row.split_config.map((split) => ({
          userId: split.user_id,
          sharePercent: Number(split.share_percent),
        }))
      : [],
    frequency:
      row.frequency === 'weekly'
        ? 'weekly'
        : row.frequency === 'yearly'
          ? 'yearly'
          : 'monthly',
    intervalCount: row.interval_count,
    startDate: row.start_date,
    nextDueDate: row.next_due_date,
    endDate: row.end_date,
    isActive: row.is_active,
    note: row.note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function ensureRecurringOccurrences(householdId: string) {
  const { data, error } = await supabase.rpc('ensure_recurring_occurrences', {
    p_household_id: householdId,
  })

  if (error) throw serviceError(error, 'No hemos podido preparar los gastos pendientes.')
  return typeof data === 'number' ? data : Number(data ?? 0)
}

export async function getRecurringExpenses(householdId: string) {
  const [templatesResult, categoriesResult] = await Promise.all([
    supabase
      .from('recurring_expenses')
      .select('id, household_id, created_by, description, amount_cents, category_id, expense_type, payment_source, payer_user_id, split_config, frequency, interval_count, start_date, next_due_date, end_date, is_active, note, created_at, updated_at')
      .eq('household_id', householdId)
      .order('is_active', { ascending: false })
      .order('next_due_date', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name, icon, sort_order')
      .eq('household_id', householdId),
  ])

  if (templatesResult.error || categoriesResult.error) {
    throw serviceError(
      templatesResult.error ?? categoriesResult.error,
      'No hemos podido cargar los gastos recurrentes.',
    )
  }

  const categories = new Map(
    categoriesResult.data.map((category) => [category.id, category]),
  )

  return (templatesResult.data as RecurringRow[]).map((row) => mapTemplate(row, categories))
}

export async function getPendingOccurrences(templates: RecurringExpense[]) {
  if (!templates.length) return []

  const templatesById = new Map(templates.map((template) => [template.id, template]))
  const { data, error } = await supabase
    .from('recurring_expense_occurrences')
    .select('id, recurring_expense_id, due_date, expense_id, status, created_at, resolved_at, resolved_by')
    .in('recurring_expense_id', [...templatesById.keys()])
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw serviceError(error, 'No hemos podido cargar los gastos pendientes.')
  }

  return data.flatMap((row): RecurringExpenseOccurrence[] => {
    const recurringExpense = templatesById.get(row.recurring_expense_id)
    if (!recurringExpense) return []

    return [{
      id: row.id,
      recurringExpenseId: row.recurring_expense_id,
      dueDate: row.due_date,
      expenseId: row.expense_id,
      status: 'pending',
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      recurringExpense,
    }]
  })
}

export async function createRecurringExpense(input: RecurringExpenseInput) {
  const { data, error } = await supabase.rpc('create_recurring_expense', {
    p_household_id: input.householdId,
    p_description: input.description,
    p_amount_cents: input.amountCents,
    p_category_id: input.categoryId,
    p_expense_type: input.expenseType,
    p_payment_source: input.paymentSource,
    p_payer_user_id: input.payerUserId,
    p_split_config: splitPayload(input.splitConfig),
    p_frequency: input.frequency,
    p_interval_count: input.intervalCount,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_note: input.note || null,
    p_is_active: input.isActive,
  })

  if (error) throw serviceError(error, 'No hemos podido crear el gasto recurrente.')
  if (typeof data !== 'string') throw serviceError(null, 'No hemos recibido el identificador.')
  return data
}

export async function updateRecurringExpense(input: RecurringExpenseUpdateInput) {
  const { data, error } = await supabase.rpc('update_recurring_expense', {
    p_recurring_expense_id: input.recurringExpenseId,
    p_description: input.description,
    p_amount_cents: input.amountCents,
    p_category_id: input.categoryId,
    p_payment_source: input.paymentSource,
    p_payer_user_id: input.payerUserId,
    p_split_config: splitPayload(input.splitConfig),
    p_frequency: input.frequency,
    p_interval_count: input.intervalCount,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_note: input.note || null,
  })

  if (error) throw serviceError(error, 'No hemos podido actualizar el gasto recurrente.')
  if (typeof data !== 'string') throw serviceError(null, 'No hemos recibido el identificador.')
  return data
}

export async function setRecurringExpenseActive(recurringExpenseId: string, isActive: boolean) {
  const { data, error } = await supabase.rpc('set_recurring_expense_active', {
    p_recurring_expense_id: recurringExpenseId,
    p_is_active: isActive,
  })

  if (error) throw serviceError(error, 'No hemos podido cambiar el estado del gasto recurrente.')
  if (typeof data !== 'string') throw serviceError(null, 'No hemos recibido el identificador.')
  return data
}

export async function confirmRecurringOccurrence({
  occurrenceId,
  expense,
}: ConfirmRecurringOccurrenceInput) {
  const { data, error } = await supabase.rpc('confirm_recurring_expense_occurrence', {
    p_occurrence_id: occurrenceId,
    p_description: expense.description,
    p_amount_cents: Math.round(expense.amount * 100),
    p_category_id: expense.categoryId,
    p_expense_date: expense.expenseDate,
    p_note: expense.note || null,
    p_payment_source: expense.paymentSource,
    p_paid_by_user_id: expense.paidByUserId,
    p_splits: expense.splits.map((split) => ({
      user_id: split.userId,
      share_percent: split.sharePercent,
      share_amount: split.shareAmount,
    })),
  })

  if (error) throw serviceError(error, 'No hemos podido confirmar este gasto.')
  if (typeof data !== 'string') throw serviceError(null, 'No hemos recibido el identificador del gasto.')
  return data
}

export async function skipRecurringOccurrence(occurrenceId: string) {
  const { data, error } = await supabase.rpc('skip_recurring_expense_occurrence', {
    p_occurrence_id: occurrenceId,
  })

  if (error) throw serviceError(error, 'No hemos podido omitir este gasto.')
  if (typeof data !== 'string') throw serviceError(null, 'No hemos recibido el identificador.')
  return data
}
