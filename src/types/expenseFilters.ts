import type { ExpenseType, PaidBy } from './finance'

export type ExpenseFilters = {
  paidBy: 'all' | PaidBy
  category: string
  expenseType: 'all' | ExpenseType
}

export const emptyExpenseFilters: ExpenseFilters = {
  paidBy: 'all',
  category: '',
  expenseType: 'all',
}
