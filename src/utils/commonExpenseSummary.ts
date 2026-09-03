import type { ExpenseRecord } from '../types/expenseRead'

export function getCommonExpensesInPeriod(
  expenses: ExpenseRecord[],
  startAccountingMonth: string,
  endAccountingMonth: string,
) {
  return expenses.filter(
    (expense) =>
      expense.expenseType === 'common' &&
      expense.accountingMonth >= startAccountingMonth &&
      expense.accountingMonth <= endAccountingMonth,
  )
}
