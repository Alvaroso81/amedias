import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AuthBrand } from './AuthBrand'
import { AuthField } from './AuthField'
import { supabase } from '../services/supabase'
import { getAuthErrorMessage } from '../utils/authErrors'
import { createPasswordRecoveryRedirectUrl } from '../utils/passwordRecovery'

type Props = { initialEmail?: string; onBack: () => void; notice?: string }

export function PasswordResetRequest({ initialEmail = '', onBack, notice }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [emailError, setEmailError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const normalizedEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Introduce un correo electrónico válido.')
      return
    }
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: createPasswordRecoveryRedirectUrl(window.location.origin, import.meta.env.BASE_URL),
      })
      if (resetError) setError(getAuthErrorMessage(resetError))
      else setSent(true)
    } catch {
      setError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <main className="auth-shell"><div className="auth-layout">
    <AuthBrand />
    <section className="card auth-card">
      <div className="auth-card-heading">
        <h1>{sent ? 'Revisa tu correo' : 'Recuperar contraseña'}</h1>
        <p>{sent ? 'Si existe una cuenta con ese correo, recibirás un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam.'
          : 'Te enviaremos un enlace para elegir una contraseña nueva.'}</p>
      </div>
      {sent ? <p role="status">Solicitud enviada. Abre el enlace más reciente del correo.</p> : <>
        {notice && <p className="auth-submit-error" role="alert">{notice}</p>}
        <form className="auth-form" onSubmit={submit} aria-busy={busy} noValidate>
          <AuthField id="recovery-email" label="Correo electrónico" type="email" inputMode="email"
            autoComplete="email" value={email} error={emailError}
            onChange={(value) => { setEmail(value); setEmailError(undefined); setError(null) }} />
          {error && <p className="auth-submit-error" role="alert">{error}</p>}
          <button className="auth-primary-button" type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar enlace de recuperación'}
          </button>
        </form>
      </>}
      <button className="auth-secondary-button password-recovery-link" type="button" disabled={busy} onClick={onBack}>
        Volver a iniciar sesión
      </button>
    </section>
  </div></main>
}
