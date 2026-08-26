import type { ExpenseReadMember, SettlementRecord } from '../types/expenseRead'

export function getSettlementMemberName(
  members: ExpenseReadMember[],
  userId: string,
) {
  return members.find((member) => member.userId === userId)?.displayName ?? 'Antiguo miembro'
}

export function getSettlementDirectionLabel(
  settlement: Pick<SettlementRecord, 'fromUserId' | 'toUserId'>,
  members: ExpenseReadMember[],
) {
  return `${getSettlementMemberName(members, settlement.fromUserId)} → ${getSettlementMemberName(members, settlement.toUserId)}`
}
