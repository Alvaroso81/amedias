export type PaymentSource = 'member' | 'common_fund'

export type CommonFundMovementType =
  | 'monthly_contribution'
  | 'top_up'
  | 'expense'
  | 'adjustment'

export type CommonFundSettings = {
  householdId: string
  enabled: boolean
  monthlyAmount: number
  carryOver: boolean
  createdAt: string
  updatedAt: string
}

export type CommonFundMovement = {
  id: string
  householdId: string
  movementType: CommonFundMovementType
  amountDelta: number
  expenseId: string | null
  periodMonth: string | null
  note: string
  createdAt: string
  updatedAt: string
  expenseDescription: string | null
  expenseDate: string | null
  categoryName: string | null
  categoryIcon: string | null
}

export type CommonFundState = {
  settings: CommonFundSettings | null
  balance: number
  movements: CommonFundMovement[]
}
