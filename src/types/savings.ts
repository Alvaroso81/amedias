export type SavingsParticipant = { userId: string; percentage: number }
export type SavingsMember = { userId: string; displayName: string }
export type SavingsMovement = {
  id: string
  type: 'contribution' | 'withdrawal'
  amountCents: bigint
  contributorUserId: string | null
  movementDate: string
  note: string
}
export type SavingsGoal = {
  id: string
  name: string
  type: 'personal' | 'shared'
  ownerUserId: string | null
  targetAmountCents: bigint | null
  targetDate: string | null
  archivedAt: string | null
  participants: SavingsParticipant[]
  movements: SavingsMovement[]
}
export type SavingsGoalInput = {
  name: string
  type: SavingsGoal['type']
  targetAmountCents: bigint | null
  targetDate: string | null
  participants: SavingsParticipant[] | null
}
