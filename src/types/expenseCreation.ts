import type { ExpenseType } from './finance'
import type { PaymentSource } from './commonFund'
import type { HouseholdCategory } from './category'

export type ExpenseCategory = Pick<HouseholdCategory, 'id' | 'name' | 'icon' | 'sortOrder'>

export type ExpenseMember = {
  userId: string
  displayName: string
  defaultShare: number
}

export type ExpenseSplitPayload = {
  userId: string
  sharePercent: number
  shareAmount: number
}

export type ExpensePaymentPayload = {
  userId: string
  amount: number
}

export type CreateExpenseInput = {
  householdId: string
  description: string
  amount: number
  categoryId: string
  expenseDate: string
  accountingMonth: string
  expenseType: ExpenseType
  note: string
  paymentSource: PaymentSource
  paidByUserId: string | null
  payerAmount: number | null
  splits: ExpenseSplitPayload[]
}

export type UpdateExpenseInput = {
  expenseId: string
  description: string
  amount: number
  categoryId: string
  expenseDate: string
  accountingMonth: string
  expenseType: ExpenseType
  note: string
  paymentSource: PaymentSource
  payments: ExpensePaymentPayload[]
  splits: ExpenseSplitPayload[]
}

export type SavedExpenseSummary = {
  id: string
  amount: number
  description: string
  paidBy: string
}
