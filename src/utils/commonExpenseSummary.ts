import type { ExpenseRecord } from '../types/expenseRead'

export function getCommonExpensesInPeriod(
  expenses: ExpenseRecord[],
  startDate: string,
  endDate: string,
) {
  return expenses.filter(
    (expense) =>
      expense.expenseType === 'common' &&
      expense.expenseDate >= startDate &&
      expense.expenseDate <= endDate,
  )
}
