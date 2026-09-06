import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSavings, SavingsServiceError } from '../services/savings'
import type { SavingsGoal, SavingsMember } from '../types/savings'

export function useSavings(householdId: string, currentUserId: string) {
  const contextKey = householdId + ':' + currentUserId
  const requestId = useRef(0)
  const [state, setState] = useState<{ contextKey: string; goals: SavingsGoal[]; members: SavingsMember[]; loading: boolean; error: string | null }>({
    contextKey, goals: [], members: [], loading: true, error: null,
  })
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setState(current => current.contextKey === contextKey
      ? { ...current, loading: true, error: null }
      : { contextKey, goals: [], members: [], loading: true, error: null })
    try {
      const data = await loadSavings(householdId)
      if (id !== requestId.current) return false
      setState({ ...data, contextKey, loading: false, error: null })
      return true
    } catch (error) {
      if (id !== requestId.current) return false
      setState({ contextKey, goals: [], members: [], loading: false, error: error instanceof SavingsServiceError ? error.message : 'No hemos podido cargar los ahorros.' })
      return false
    }
  }, [householdId, contextKey])
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => { window.clearTimeout(timer); requestId.current += 1 }
  }, [refresh, currentUserId])
  return state.contextKey === contextKey ? { ...state, refresh }
    : { goals: [], members: [], loading: true, error: null, refresh }
}
