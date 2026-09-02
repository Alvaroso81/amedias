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
    let initialSessionValidated = false

    const loadInitialSession = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (!isMounted) return

        if (sessionError) {
          initialSessionValidated = true
          setAuthState({
            session: null,
            user: null,
            loading: false,
            error: 'No hemos podido comprobar tu sesión.',
          })
          return
        }

        if (!sessionData.session) {
          initialSessionValidated = true
          setAuthState({
            session: null,
            user: null,
            loading: false,
            error: null,
          })
          return
        }

        const { data: userData, error: userError } = await supabase.auth.getUser()

        if (!isMounted) return

        initialSessionValidated = true

        if (userError || !userData.user) {
          try {
            await supabase.auth.signOut({ scope: 'local' })
          } catch {
            // The app still fails closed below even if local cleanup reports an error.
          }

          if (!isMounted) return

          setAuthState({
            session: null,
            user: null,
            loading: false,
            error: null,
          })
          return
        }

        setAuthState({
          session: sessionData.session,
          user: userData.user,
          loading: false,
          error: null,
        })
      } catch {
        if (!isMounted) return

        initialSessionValidated = true
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted || !initialSessionValidated || event === 'INITIAL_SESSION') return

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
