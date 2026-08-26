import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { acceptHouseholdInvite, HouseholdInviteServiceError } from '../services/householdInvites'
import { AppStatusScreen } from './AppStatusScreen'

type InviteGateState =
  | { status: 'joining' }
  | { status: 'success' }
  | { status: 'error'; message: string; terminal: boolean }
  | { status: 'idle' }

type PendingInviteGateProps = {
  token: string | null
  children: ReactNode
  onAccepted: () => Promise<void>
  onClearToken: () => void
}

const terminalErrorCodes = new Set([
  'invalid',
  'expired',
  'unavailable',
  'email-mismatch',
  'email-unconfirmed',
  'already-member',
])

export function PendingInviteGate({
  token,
  children,
  onAccepted,
  onClearToken,
}: PendingInviteGateProps) {
  const [state, setState] = useState<InviteGateState>(token ? { status: 'joining' } : { status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const inFlightToken = useRef<string | null>(null)

  useEffect(() => {
    if (!token || state.status !== 'joining' || inFlightToken.current === token) return

    const acceptanceTimer = window.setTimeout(() => {
      if (inFlightToken.current === token) return

      inFlightToken.current = token

      void acceptHouseholdInvite(token)
        .then(async () => {
          onClearToken()
          await onAccepted()
          setState({ status: 'success' })
        })
        .catch((error: unknown) => {
          const serviceError =
            error instanceof HouseholdInviteServiceError
              ? error
              : new HouseholdInviteServiceError(
                  'No hemos podido conectar para aceptar la invitación.',
                  'network',
                )
          const terminal = serviceError.code ? terminalErrorCodes.has(serviceError.code) : false

          if (terminal) onClearToken()

          setState({ status: 'error', message: serviceError.message, terminal })
        })
        .finally(() => {
          if (inFlightToken.current === token) inFlightToken.current = null
        })
    }, 0)

    return () => window.clearTimeout(acceptanceTimer)
  }, [attempt, onAccepted, onClearToken, state.status, token])

  if (state.status === 'joining') {
    return (
      <AppStatusScreen
        loading
        title="Uniéndote al hogar…"
        message="Estamos comprobando tu invitación de forma segura."
      />
    )
  }

  if (state.status === 'success') {
    return (
      <AppStatusScreen
        symbol="✓"
        title="Ya formas parte del hogar"
        message="La invitación se ha aceptado correctamente."
        actionLabel="Entrar en Amedias"
        onAction={() => setState({ status: 'idle' })}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <AppStatusScreen
        title="No hemos podido unirte al hogar"
        message={state.message}
        actionLabel={state.terminal ? 'Continuar' : 'Volver a intentar'}
        onAction={() => {
          if (state.terminal) {
            setState({ status: 'idle' })
            return
          }

          setState({ status: 'joining' })
          setAttempt((currentAttempt) => currentAttempt + 1)
        }}
        secondaryActionLabel={state.terminal ? undefined : 'Descartar invitación'}
        onSecondaryAction={
          state.terminal
            ? undefined
            : () => {
                onClearToken()
                setState({ status: 'idle' })
              }
        }
      />
    )
  }

  return children
}
