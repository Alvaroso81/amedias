import type { ExpenseRecord } from '../types/expenseRead'

export function getExpensePayerLabel(expense: ExpenseRecord) {
  if (expense.payments.length === 1) return expense.payments[0].displayName
  if (expense.payments.length > 1) return 'varios'
  return 'sin pagador'
}

export function getExpensePayerText(expense: ExpenseRecord) {
  if (expense.payments.length === 1) return `Pagó ${expense.payments[0].displayName}`
  if (expense.payments.length > 1) return 'Pagado entre varios'
  return 'Pagador no disponible'
}

export function getExpenseBalanceImpacts(expense: ExpenseRecord) {
  const impacts = new Map<string, { userId: string; displayName: string; amount: number }>()

  expense.splits.forEach((split) => {
    impacts.set(split.userId, {
      userId: split.userId,
      displayName: split.displayName,
      amount: -split.shareAmount,
    })
  })

  expense.payments.forEach((payment) => {
    const currentImpact = impacts.get(payment.userId)
    impacts.set(payment.userId, {
      userId: payment.userId,
      displayName: payment.displayName,
      amount: (currentImpact?.amount ?? 0) + payment.amount,
    })
  })

  return [...impacts.values()].map((impact) => ({
    ...impact,
    amount: Math.round((impact.amount + Number.EPSILON) * 100) / 100,
  }))
}
