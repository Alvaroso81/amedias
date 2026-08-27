import type { ExpenseType } from './finance'
import type { HouseholdRole } from './household'
import type { PaymentSource } from './commonFund'

export type ExpenseReadMember = {
  userId: string
  displayName: string
  role: HouseholdRole
}

export type ExpenseReadCategory = {
  id: string | null
  name: string
  icon: string
}

export type ExpensePaymentDetail = {
  userId: string
  amount: number
  displayName: string
}

export type ExpenseSplitDetail = {
  userId: string
  sharePercent: number | null
  shareAmount: number
  displayName: string
}

export type ExpenseRecord = {
  id: string
  householdId: string
  description: string
  amount: number
  expenseDate: string
  expenseType: ExpenseType
  personalOwnerId: string | null
  paymentSource: PaymentSource
  note: string
  categoryId: string | null
  category: ExpenseReadCategory
  payments: ExpensePaymentDetail[]
  splits: ExpenseSplitDetail[]
  createdBy: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type SettlementRecord = {
  id: string
  householdId: string
  fromUserId: string
  toUserId: string
  amount: number
  settlementDate: string
  note: string
  createdBy: string
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type HouseholdExpenseData = {
  expenses: ExpenseRecord[]
  members: ExpenseReadMember[]
  settlements: SettlementRecord[]
}
