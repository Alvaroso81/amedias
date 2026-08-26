import type { ExpenseMember, ExpenseSplitPayload } from '../types/expenseCreation'
import type { ExpenseType } from '../types/finance'

export function calculateExpenseSplits(
  amount: number,
  members: ExpenseMember[],
  splits: Record<string, string>,
  expenseType: ExpenseType,
  paidByUserId: string,
): ExpenseSplitPayload[] {
  const amountInCents = Math.round(amount * 100)

  if (expenseType === 'personal') {
    return [
      {
        userId: paidByUserId,
        sharePercent: 100,
        shareAmount: amountInCents / 100,
      },
    ]
  }

  const allocations = members.map((member, index) => {
    const sharePercent = Number(splits[member.userId])
    const exactShareInCents = (amountInCents * sharePercent) / 100
    const shareInCents = Math.floor(exactShareInCents + 1e-9)

    return {
      index,
      member,
      sharePercent,
      shareInCents,
      remainder: exactShareInCents - shareInCents,
    }
  })
  const allocatedCents = allocations.reduce(
    (total, allocation) => total + allocation.shareInCents,
    0,
  )
  const centsToDistribute = amountInCents - allocatedCents
  const remainderOrder = [...allocations].sort(
    (first, second) => second.remainder - first.remainder || first.index - second.index,
  )

  for (let index = 0; index < centsToDistribute; index += 1) {
    remainderOrder[index % remainderOrder.length].shareInCents += 1
  }

  return allocations.map(({ member, sharePercent, shareInCents }) => ({
    userId: member.userId,
    sharePercent,
    shareAmount: shareInCents / 100,
  }))
}
