import type { PaymentSource } from './commonFund'
import type { CreateExpenseInput, ExpenseCategory } from './expenseCreation'
import type { ExpenseType } from './finance'

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'
export type RecurringOccurrenceStatus = 'pending' | 'confirmed' | 'skipped'

export type RecurringSplitConfig = {
  userId: string
  sharePercent: number
}

export type RecurringExpense = {
  id: string
  householdId: string
  createdBy: string
  description: string
  amountCents: number
  categoryId: string
  category: ExpenseCategory
  expenseType: ExpenseType
  paymentSource: PaymentSource
  payerUserId: string | null
  splitConfig: RecurringSplitConfig[]
  frequency: RecurringFrequency
  intervalCount: number
  startDate: string
  nextDueDate: string
  endDate: string | null
  isActive: boolean
  note: string
  createdAt: string
  updatedAt: string
}

export type RecurringExpenseOccurrence = {
  id: string
  recurringExpenseId: string
  dueDate: string
  expenseId: string | null
  status: RecurringOccurrenceStatus
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  recurringExpense: RecurringExpense
}

export type RecurringExpenseInput = {
  householdId: string
  description: string
  amountCents: number
  categoryId: string
  expenseType: ExpenseType
  paymentSource: PaymentSource
  payerUserId: string | null
  splitConfig: RecurringSplitConfig[]
  frequency: RecurringFrequency
  intervalCount: number
  startDate: string
  endDate: string | null
  note: string
  isActive: boolean
}

export type RecurringExpenseUpdateInput = Omit<
  RecurringExpenseInput,
  'householdId' | 'expenseType' | 'isActive'
> & {
  recurringExpenseId: string
}

export type ConfirmRecurringOccurrenceInput = {
  occurrenceId: string
  expense: CreateExpenseInput
}
