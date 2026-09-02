import { useCallback, useEffect, useRef, useState } from 'react'
import { CommonFundServiceError, loadCommonFundState } from '../services/commonFund'
import type { CommonFundState } from '../types/commonFund'

type CommonFundHookState = CommonFundState & {
  loading: boolean
  error: string | null
}

const emptyState: CommonFundState = {
  settings: null,
  balance: 0,
  movements: [],
}

export function useCommonFund(householdId: string) {
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

      setState({
        ...emptyState,
        loading: false,
        error:
          error instanceof CommonFundServiceError
            ? error.message
            : 'No hemos podido cargar el fondo común.',
      })
      return false
    }
  }, [householdId])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refresh(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [householdId, refresh])

  const retry = useCallback(async () => Boolean(await refresh()), [refresh])

  return { ...state, refresh, retry }
}
