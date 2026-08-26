import { useCallback, useEffect, useRef, useState } from 'react'
import { ExpenseServiceError, loadExpenseFormData } from '../services/expenses'
import type { ExpenseCategory, ExpenseMember } from '../types/expenseCreation'

type ExpenseFormDataState = {
  categories: ExpenseCategory[]
  members: ExpenseMember[]
  loading: boolean
  error: string | null
}

export function useExpenseFormData(householdId: string | null) {
  const requestId = useRef(0)
  const [state, setState] = useState<ExpenseFormDataState>({
    categories: [],
    members: [],
    loading: Boolean(householdId),
    error: null,
  })

  const reload = useCallback(async () => {
    if (!householdId) return

    const currentRequest = ++requestId.current
    setState((currentState) => ({ ...currentState, loading: true, error: null }))

    try {
      const data = await loadExpenseFormData(householdId)

      if (currentRequest !== requestId.current) return

      setState({ ...data, loading: false, error: null })
    } catch (error) {
      if (currentRequest !== requestId.current) return

      setState({
        categories: [],
        members: [],
        loading: false,
        error:
          error instanceof ExpenseServiceError
            ? error.message
            : 'No hemos podido preparar el formulario.',
      })
    }
  }, [householdId])

  useEffect(() => {
    if (!householdId) return

    const loadTimer = window.setTimeout(() => void reload(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [householdId, reload])

  return { ...state, reload }
}
