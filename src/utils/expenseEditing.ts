import type {
  ExpenseMember,
  UpdateExpenseInput,
} from '../types/expenseCreation'
import type { PaymentSource } from '../types/commonFund'
import type { ExpenseRecord } from '../types/expenseRead'
import type { ExpenseType } from '../types/finance'
import { calculateExpenseSplits } from './calculateExpenseSplits'

export type ExpenseEditDraft = {
  description: string
  amount: string
  categoryId: string
  paymentSource: PaymentSource
  paidByUserId: string
  splits: Record<string, string>
  expenseDate: string
  expenseType: ExpenseType
  note: string
}

function allocatePercentages(weights: number[]) {
  const safeWeights = weights.map((weight) => Math.max(0, weight))
  const totalWeight = safeWeights.reduce((total, weight) => total + weight, 0)
  const effectiveWeights = totalWeight > 0 ? safeWeights : safeWeights.map(() => 1)
  const effectiveTotal = effectiveWeights.reduce((total, weight) => total + weight, 0)
  const allocations = effectiveWeights.map((weight, index) => {
    const exactBasisPoints = (weight / effectiveTotal) * 10_000
    const basisPoints = Math.floor(exactBasisPoints)

    return {
      index,
      basisPoints,
      remainder: exactBasisPoints - basisPoints,
    }
  })
  const allocatedBasisPoints = allocations.reduce(
    (total, allocation) => total + allocation.basisPoints,
    0,
  )
  const remainderOrder = [...allocations].sort(
    (first, second) => second.remainder - first.remainder || first.index - second.index,
  )

  for (let index = 0; index < 10_000 - allocatedBasisPoints; index += 1) {
    remainderOrder[index % remainderOrder.length].basisPoints += 1
  }

  return allocations.map((allocation) => allocation.basisPoints / 100)
}

export function getDefaultExpenseSplits(members: ExpenseMember[]) {
  if (!members.length) return {}

  const percentages = allocatePercentages(members.map((member) => member.defaultShare))

  return Object.fromEntries(
    members.map((member, index) => [member.userId, String(percentages[index])]),
  )
}

export function getCommonFundSplits(members: ExpenseMember[]) {
  return Object.fromEntries(members.map((member) => [member.userId, '50']))
}

export function updateExpenseSplitPercentages(
  members: ExpenseMember[],
  currentSplits: Record<string, string>,
  userId: string,
  value: string,
) {
  if (!members.some((member) => member.userId === userId)) return currentSplits
  if (value === '') return { ...currentSplits, [userId]: '' }

  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) return currentSplits

  const normalizedValue = Math.min(
    100,
    Math.max(0, Math.round((parsedValue + Number.EPSILON) * 100) / 100),
  )
  const nextSplits = { ...currentSplits, [userId]: String(normalizedValue) }

  if (members.length !== 2) return nextSplits

  const otherMember = members.find((member) => member.userId !== userId)
  if (!otherMember) return nextSplits

  return {
    [userId]: String(normalizedValue),
    [otherMember.userId]: String(Number((100 - normalizedValue).toFixed(2))),
  }
}

export function createExpenseEditDraft(
  expense: ExpenseRecord,
  members: ExpenseMember[],
): ExpenseEditDraft {
  const splits = Object.fromEntries(
    members.map((member) => {
      const savedSplit = expense.splits.find((split) => split.userId === member.userId)
      const percentage =
        savedSplit?.sharePercent ??
        (savedSplit && expense.amount > 0
          ? Number(((savedSplit.shareAmount / expense.amount) * 100).toFixed(2))
          : 0)

      return [member.userId, String(percentage)]
    }),
  )

  return {
    description: expense.description,
    amount: String(expense.amount),
    categoryId: expense.categoryId ?? '',
    paymentSource: expense.paymentSource,
    paidByUserId: expense.payments[0]?.userId ?? members[0]?.userId ?? '',
    splits,
    expenseDate: expense.expenseDate,
    expenseType: expense.expenseType,
    note: expense.note,
  }
}

export function buildExpenseUpdateInput(
  expenseId: string,
  draft: ExpenseEditDraft,
  members: ExpenseMember[],
): UpdateExpenseInput {
  const amount = Number(draft.amount)
  const usesFund = draft.paymentSource === 'common_fund'
  const expenseType = usesFund ? 'common' : draft.expenseType
  const splitValues = usesFund ? getCommonFundSplits(members) : draft.splits

  return {
    expenseId,
    description: draft.description.trim(),
    amount,
    categoryId: draft.categoryId,
    expenseDate: draft.expenseDate,
    expenseType,
    note: draft.note.trim(),
    paymentSource: draft.paymentSource,
    payments: usesFund ? [] : [{ userId: draft.paidByUserId, amount }],
    splits: calculateExpenseSplits(
      amount,
      members,
      splitValues,
      expenseType,
      draft.paidByUserId,
    ),
  }
}
