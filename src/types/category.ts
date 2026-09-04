export type HouseholdCategory = {
  id: string
  householdId: string
  name: string
  icon: string
  isActive: boolean
  sortOrder: number
}

export type CategoryMutationInput = {
  name: string
  icon: string
}
