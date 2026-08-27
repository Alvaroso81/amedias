import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CommonFundServiceError,
  ensureMonthlyCommonFund,
  loadCommonFundState,
} from '../services/commonFund'
import type { CommonFundState } from '../types/commonFund'

type CommonFundHookState = CommonFundState & {
  loading: boolean
  error: string | null
}

const ensuredPeriods = new Set<string>()

function getLocalMonthStart() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
}

const emptyState: CommonFundState = {
  settings: null,
  balance: 0,
  movements: [],
}

export function useCommonFund(householdId: string, memberCount: number) {
  const requestId = useRef(0)
  const [state, setState] = useState<CommonFundHookState>({
    ...emptyState,
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const data = await loadCommonFundState(householdId)
      if (currentRequest !== requestId.current) return false

      setState({ ...data, loading: false, error: null })
      return data
    } catch (error) {
      if (currentRequest !== requestId.current) return false

      setState((current) => ({
        ...current,
        loading: false,
        error:
          error instanceof CommonFundServiceError
            ? error.message
            : 'No hemos podido cargar el fondo común.',
      }))
      return false
    }
  }, [householdId])

  const ensureCurrentMonth = useCallback(async () => {
    const month = getLocalMonthStart()
    const ensureKey = `${householdId}:${month}`

    if (ensuredPeriods.has(ensureKey)) return true

    ensuredPeriods.add(ensureKey)
    try {
      await ensureMonthlyCommonFund(householdId, month)
      return await refresh()
    } catch (error) {
      ensuredPeriods.delete(ensureKey)
      setState((current) => ({
        ...current,
        loading: false,
        error:
          error instanceof CommonFundServiceError
            ? error.message
            : 'No hemos podido preparar la aportación mensual.',
      }))
      return false
    }
  }, [householdId, refresh])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [householdId, refresh])

  useEffect(() => {
    if (!state.settings?.enabled || memberCount !== 2) return

    const ensureTimer = window.setTimeout(() => void ensureCurrentMonth(), 0)
    return () => window.clearTimeout(ensureTimer)
  }, [ensureCurrentMonth, memberCount, state.settings?.enabled])

  const retry = useCallback(async () => {
    const data = await refresh()
    if (!data || !data.settings?.enabled || memberCount !== 2) return Boolean(data)
    return Boolean(await ensureCurrentMonth())
  }, [ensureCurrentMonth, memberCount, refresh])

  return { ...state, refresh, retry, ensureCurrentMonth }
}
