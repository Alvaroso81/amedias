export type HouseholdRole = 'owner' | 'member'

export type Household = {
  id: string
  name: string
  currency: string
}

export type HouseholdMembership = {
  householdId: string
  userId: string
  role: HouseholdRole
  defaultShare: number
}
