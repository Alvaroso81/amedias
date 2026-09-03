import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  updateAccountingMonthStartDay as persistAccountingMonthStartDay,
  updateCommonExpensesStartDate as persistCommonExpensesStartDate,
} from '../services/householdSettings'
import { supabase } from '../services/supabase'
import type { UserProfile } from '../types/auth'
import type { Household, HouseholdMembership, HouseholdRole } from '../types/household'

type HouseholdState = {
  profile: UserProfile | null
  household: Household | null
  membership: HouseholdMembership | null
  loading: boolean
  error: string | null
}

const emptyHouseholdState = {
  profile: null,
  household: null,
  membership: null,
} satisfies Pick<HouseholdState, 'profile' | 'household' | 'membership'>

function getFallbackDisplayName(user: User) {
  const metadataName = user.user_metadata.display_name

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim()
  }

  return user.email?.split('@')[0] || 'Usuario'
}

export function useHousehold(user: User) {
  const requestId = useRef(0)
  const [state, setState] = useState<HouseholdState>({
    ...emptyHouseholdState,
    loading: true,
    error: null,
  })

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current

    setState((currentState) => ({ ...currentState, loading: true, error: null }))

    try {
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from('profiles').select('id, display_name').eq('id', user.id).maybeSingle(),
        supabase
          .from('household_members')
          .select('household_id, user_id, role, default_share, joined_at')
          .eq('user_id', user.id)
          .order('joined_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])

      if (currentRequest !== requestId.current) return

      if (profileResult.error) {
        setState({
          ...emptyHouseholdState,
          loading: false,
          error: 'No hemos podido cargar tu perfil.',
        })
        return
      }

      if (membershipResult.error) {
        setState({
          ...emptyHouseholdState,
          loading: false,
          error: 'No hemos podido comprobar si perteneces a un hogar.',
        })
        return
      }

      const profile: UserProfile = profileResult.data
        ? {
            id: profileResult.data.id,
            displayName: profileResult.data.display_name,
          }
        : {
            id: user.id,
            displayName: getFallbackDisplayName(user),
          }

      if (!membershipResult.data) {
        setState({ profile, household: null, membership: null, loading: false, error: null })
        return
      }

      const membershipRow = membershipResult.data
      const householdResult = await supabase
        .from('households')
        .select('id, name, currency, common_expenses_start_date, accounting_month_start_day')
        .eq('id', membershipRow.household_id)
        .single()

      if (currentRequest !== requestId.current) return

      if (householdResult.error) {
        setState({
          profile,
          household: null,
          membership: null,
          loading: false,
          error: 'Hemos encontrado tu membresía, pero no hemos podido cargar el hogar.',
        })
        return
      }

      const role: HouseholdRole = membershipRow.role === 'owner' ? 'owner' : 'member'

      setState({
        profile,
        household: {
          id: householdResult.data.id,
          name: householdResult.data.name,
          currency: householdResult.data.currency,
          commonExpensesStartDate: householdResult.data.common_expenses_start_date,
          accountingMonthStartDay: householdResult.data.accounting_month_start_day,
        },
        membership: {
          householdId: membershipRow.household_id,
          userId: membershipRow.user_id,
          role,
          defaultShare: Number(membershipRow.default_share),
        },
        loading: false,
        error: null,
      })
    } catch {
      if (currentRequest !== requestId.current) return

      setState({
        ...emptyHouseholdState,
        loading: false,
        error: 'No hemos podido conectar con tu hogar. Inténtalo de nuevo.',
      })
    }
  }, [user])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void reload(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [reload])

  const updateCommonExpensesStartDate = useCallback(
    async (householdId: string, startDate: string) => {
      const savedStartDate = await persistCommonExpensesStartDate(householdId, startDate)

      setState((currentState) => {
        if (currentState.household?.id !== householdId) return currentState

        return {
          ...currentState,
          household: {
            ...currentState.household,
            commonExpensesStartDate: savedStartDate,
          },
        }
      })
    },
    [],
  )

  const updateAccountingMonthStartDay = useCallback(
    async (householdId: string, startDay: number) => {
      const savedStartDay = await persistAccountingMonthStartDay(householdId, startDay)

      setState((currentState) => {
        if (currentState.household?.id !== householdId) return currentState

        return {
          ...currentState,
          household: {
            ...currentState.household,
            accountingMonthStartDay: savedStartDay,
          },
        }
      })
    },
    [],
  )

  return {
    ...state,
    reload,
    updateCommonExpensesStartDate,
    updateAccountingMonthStartDay,
  }
}
