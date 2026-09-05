import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ensureRecurringOccurrences,
  getPendingOccurrences,
  getRecurringExpenses,
  RecurringExpenseServiceError,
} from '../services/recurringExpenses'
import type {
  RecurringExpense,
  RecurringExpenseOccurrence,
} from '../types/recurringExpenses'

type RecurringState = {
  recurringExpenses: RecurringExpense[]
  pendingOccurrences: RecurringExpenseOccurrence[]
  loading: boolean
  error: string | null
}

const emptyState = {
  recurringExpenses: [],
  pendingOccurrences: [],
}

export function useRecurringExpenses(householdId: string) {
  const requestId = useRef(0)
  const [state, setState] = useState<RecurringState>({
    ...emptyState,
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      await ensureRecurringOccurrences(householdId)
      const recurringExpenses = await getRecurringExpenses(householdId)
      const pendingOccurrences = await getPendingOccurrences(recurringExpenses)

      if (currentRequest !== requestId.current) return false
      setState({ recurringExpenses, pendingOccurrences, loading: false, error: null })
      return true
    } catch (error) {
      if (currentRequest !== requestId.current) return false
      setState({
        ...emptyState,
        loading: false,
        error:
          error instanceof RecurringExpenseServiceError
            ? error.message
            : 'No hemos podido cargar los gastos recurrentes.',
      })
      return false
    }
  }, [householdId])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timer)
      requestId.current += 1
    }
  }, [refresh])

  return { ...state, refresh }
}
