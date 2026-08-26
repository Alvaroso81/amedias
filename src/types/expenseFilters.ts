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

export type StatisticsExpenseFilter = {
  categoryId: string | null
  categoryName: string
  periodMode: 'month' | 'year' | 'history'
  anchorDate: string
}
