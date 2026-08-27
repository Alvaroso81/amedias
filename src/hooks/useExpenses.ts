import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExpenseServiceError, loadHouseholdExpenses } from '../services/expenses'
import type { HouseholdExpenseData } from '../types/expenseRead'

type ExpensesState = HouseholdExpenseData & {
  loading: boolean
  error: string | null
}

const emptyExpenseData: HouseholdExpenseData = {
  expenses: [],
  members: [],
  settlements: [],
}

export function useExpenses(householdId: string, currentUserId: string) {
  const requestId = useRef(0)
  const [state, setState] = useState<ExpensesState>({
    ...emptyExpenseData,
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    setState((currentState) => ({ ...currentState, loading: true, error: null }))

    try {
      const data = await loadHouseholdExpenses(householdId)

      if (currentRequest !== requestId.current) return

      setState({ ...data, loading: false, error: null })
      return true
    } catch (error) {
      if (currentRequest !== requestId.current) return

      setState((currentState) => ({
        ...currentState,
        loading: false,
        error:
          error instanceof ExpenseServiceError
            ? error.message
            : 'No hemos podido cargar los gastos.',
      }))
    }
    return false
  }, [householdId])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [refresh])

  const commonExpenses = useMemo(
    () => state.expenses.filter((expense) => expense.expenseType === 'common'),
    [state.expenses],
  )
  const myPersonalExpenses = useMemo(
    () =>
      state.expenses.filter(
        (expense) =>
          expense.expenseType === 'personal' &&
          expense.personalOwnerId === currentUserId,
      ),
    [currentUserId, state.expenses],
  )

  return { ...state, visibleExpenses: state.expenses, commonExpenses, myPersonalExpenses, refresh }
}
