import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AuthBrand } from '../components/AuthBrand'
import { AuthField } from '../components/AuthField'
import { PasswordResetRequest } from '../components/PasswordResetRequest'
import { supabase } from '../services/supabase'
import { getPasswordChangeErrorMessage } from '../utils/authErrors'
import { validateRecoveryPassword } from '../utils/passwordRecovery'

type Props = {
  email: string | null
  validSession: boolean
  sessionError: string | null
  onFinish: () => void
}

export function PasswordRecoveryPage({ email, validSession, sessionError, onFinish }: Props) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expired, setExpired] = useState(false)
  const submitting = useRef(false)

  async function leave() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) setError('No hemos podido cerrar la sesión. Inténtalo de nuevo.')
      else onFinish()
    } catch {
      setError('No hemos podido cerrar la sesión. Inténtalo de nuevo.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || !validSession || expired) return
    const validation = validateRecoveryPassword(password, confirmation)
    setError(validation)
    if (validation) return
    submitting.current = true
    setBusy(true)
    try {
      // Supabase authorizes this change with the recovery session from the email.
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403 || updateError.code === 'session_not_found') {
          setExpired(true)
          setPassword('')
          setConfirmation('')
        } else setError(getPasswordChangeErrorMessage(updateError))
      } else {
        setPassword('')
        setConfirmation('')
        setSaved(true)
      }
    } catch {
      setError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  if ((!validSession || expired) && !saved) {
    return <PasswordResetRequest onBack={() => { void leave() }}
      notice={error ?? sessionError ?? 'El enlace ha caducado o no es válido. Solicita uno nuevo para recuperar tu contraseña.'} />
  }

  return <main className="auth-shell"><div className="auth-layout">
    <AuthBrand />
    <section className="card auth-card">
      <div className="auth-card-heading">
        <h1>{saved ? 'Contraseña actualizada' : 'Elige una nueva contraseña'}</h1>
        <p>{saved ? 'Ya puedes acceder a Amedias con tu nueva contraseña.'
          : 'Introduce una contraseña de al menos 6 caracteres y repítela para confirmar.'}</p>
        {!saved && email && <p className="password-recovery-account">Cuenta: {email}</p>}
      </div>
      {saved ? <>
        <p role="status">Tu contraseña se ha cambiado correctamente.</p>
        <button className="auth-primary-button" type="button" onClick={onFinish}>Continuar a Amedias</button>
      </> : <form className="auth-form" onSubmit={submit} aria-busy={busy} noValidate>
        <AuthField id="recovery-password" label="Nueva contraseña" type="password" autoComplete="new-password"
          value={password} onChange={(value) => { setPassword(value); setError(null) }} />
        <AuthField id="recovery-confirmation" label="Repetir nueva contraseña" type="password" autoComplete="new-password"
          value={confirmation} onChange={(value) => { setConfirmation(value); setError(null) }} />
        {error && <p className="auth-submit-error" role="alert">{error}</p>}
        <button className="auth-primary-button" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
        <button className="auth-secondary-button" type="button" disabled={busy} onClick={() => { void leave() }}>Cancelar</button>
      </form>}
    </section>
  </div></main>
}
