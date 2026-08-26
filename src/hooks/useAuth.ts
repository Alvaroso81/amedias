import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import type { AuthState } from '../types/auth'

const initialAuthState: AuthState = {
  session: null,
  user: null,
  loading: true,
  error: null,
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState)

  useEffect(() => {
    let isMounted = true

    const loadInitialSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!isMounted) return

        if (error) {
          setAuthState({
            session: null,
            user: null,
            loading: false,
            error: 'No hemos podido comprobar tu sesión.',
          })
          return
        }

        setAuthState({
          session: data.session,
          user: data.session?.user ?? null,
          loading: false,
          error: null,
        })
      } catch {
        if (!isMounted) return

        setAuthState({
          session: null,
          user: null,
          loading: false,
          error: 'No hemos podido comprobar tu sesión.',
        })
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return

      setAuthState({
        session,
        user: session?.user ?? null,
        loading: false,
        error: null,
      })
    })

    void loadInitialSession()

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  return authState
}
