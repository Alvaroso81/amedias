import type { ExpenseType } from './finance'

export type ExpenseFilters = {
  paidBy: string
  category: string
  expenseType: 'all' | ExpenseType
}

export const emptyExpenseFilters: ExpenseFilters = {
  paidBy: 'all',
  category: '',
  expenseType: 'all',
}
