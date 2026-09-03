import { supabase } from './supabase'

export class HouseholdSettingsServiceError extends Error {}

export async function updateCommonExpensesStartDate(
  householdId: string,
  startDate: string,
) {
  const { data, error } = await supabase.rpc('update_common_expenses_start_date', {
    p_household_id: householdId,
    p_start_date: startDate,
  })

  if (error || typeof data !== 'string') {
    throw new HouseholdSettingsServiceError(
      'No hemos podido guardar la fecha. Inténtalo de nuevo.',
    )
  }

  return data
}

export async function updateAccountingMonthStartDay(
  householdId: string,
  startDay: number,
) {
  const { data, error } = await supabase.rpc('update_accounting_month_start_day', {
    p_household_id: householdId,
    p_start_day: startDay,
  })

  if (error || typeof data !== 'number') {
    throw new HouseholdSettingsServiceError(
      'No hemos podido guardar el inicio del mes contable. Inténtalo de nuevo.',
    )
  }

  return data
}
