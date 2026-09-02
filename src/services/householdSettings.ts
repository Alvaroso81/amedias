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
