export type SettlementDirection = {
  fromUserId: string
  toUserId: string
  amount: number
}

export type CreateSettlementInput = {
  householdId: string
  fromUserId: string
  toUserId: string
  amount: number
  settlementDate: string
  note: string
}

export type UpdateSettlementInput = Omit<CreateSettlementInput, 'householdId'> & {
  settlementId: string
}
