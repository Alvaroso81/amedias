export type HouseholdRole = 'owner' | 'member'

export type Household = {
  id: string
  name: string
  currency: string
  commonExpensesStartDate: string | null
  accountingMonthStartDay: number
}

export type HouseholdMembership = {
  householdId: string
  userId: string
  role: HouseholdRole
  defaultShare: number
}
