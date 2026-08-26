export type PersonContribution = {
  id?: string
  name: string
  amount: number
  percentage: number
}

export type CategoryExpense = {
  name: string
  amount: number
  icon: string
}

export type PaidBy = 'Álvaro' | 'Marta'

export type ExpenseType = 'common' | 'personal'

export type ExpenseSplit = {
  alvaro: number
  marta: number
}

export type Expense = {
  id: string
  amount: number
  description: string
  category: string
  paidBy: PaidBy
  date: string
  split: ExpenseSplit
  expenseType: ExpenseType
  note: string
  createdAt: string
  icon: string
  displayDate?: string
}
