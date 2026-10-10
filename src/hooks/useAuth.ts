import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { initialPasswordRecovery, supabase } from '../services/supabase'
import { clearPasswordRecovery, markPasswordRecovery } from '../utils/passwordRecovery'
import type { AuthState } from '../types/auth'

// supabase-js retries the token refresh for ~25 s when the backend is unreachable.
const AUTH_BOOTSTRAP_TIMEOUT_MS = 10_000
const connectionErrorMessage =
  'No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.'

const initialAuthState: AuthState = {
  session: null,
  user: null,
  loading: true,
  error: null,
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState)

  const [isPasswordRecovery, setIsPasswordRecovery] = useState(initialPasswordRecovery.active)
  const [recoveryInvalid, setRecoveryInvalid] = useState(initialPasswordRecovery.invalid)

  const finishPasswordRecovery = () => {
    clearPasswordRecovery()
    setIsPasswordRecovery(false)
    setRecoveryInvalid(false)
  }

  useEffect(() => {
    let isMounted = true
    let initialSessionValidated = false

    // Fail closed with a recoverable error instead of leaving the bootstrap spinner up.
    // A late validated result from loadInitialSession still replaces this state.
    const bootstrapTimer = window.setTimeout(() => {
      if (!isMounted) return

      setAuthState({
        session: null,
        user: null,
        loading: false,
        error: connectionErrorMessage,
      })
    }, AUTH_BOOTSTRAP_TIMEOUT_MS)

    const loadInitialSession = async () => {
      try {
        // getSession can return a previous session even if the new link failed.
        // Check the callback result so a bad link never edits that account.
        if (initialPasswordRecovery.active) {
          const { error: callbackError } = await supabase.auth.initialize()
          if (!isMounted) return
          if (callbackError) {
            markPasswordRecovery(true)
            setRecoveryInvalid(true)
          }
        }
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (!isMounted) return

        if (sessionError) {
          initialSessionValidated = true
          setAuthState({
            session: null,
            user: null,
            loading: false,
            error: isAuthRetryableFetchError(sessionError)
              ? connectionErrorMessage
              : 'No hemos podido comprobar tu sesión.',
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

        if (userError && isAuthRetryableFetchError(userError)) {
          // The session could not be validated: stay signed out, but report the outage.
          setAuthState({
            session: null,
            user: null,
            loading: false,
            error: connectionErrorMessage,
          })
          return
        }

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
      } finally {
        window.clearTimeout(bootstrapTimer)
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      // Recovery may arrive while bootstrap is still validating the session.
      // Keep this callback synchronous: awaiting auth calls here can deadlock.
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecovery()
        setIsPasswordRecovery(true)
        setRecoveryInvalid(false)
      }
      if (!initialSessionValidated || event === 'INITIAL_SESSION') return

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
      window.clearTimeout(bootstrapTimer)
      subscription.unsubscribe()
    }
  }, [])

  return { ...authState, isPasswordRecovery, recoveryInvalid, finishPasswordRecovery }
}
