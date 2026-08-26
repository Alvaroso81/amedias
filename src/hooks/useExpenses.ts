import { useCallback, useEffect, useRef, useState } from 'react'
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

export function useExpenses(householdId: string) {
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
  }, [householdId])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [refresh])

  return { ...state, refresh }
}
