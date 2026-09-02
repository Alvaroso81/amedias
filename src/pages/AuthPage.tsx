import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../services/supabase'
import { getAuthErrorMessage } from '../utils/authErrors'
import { createInviteEmailRedirectUrl } from '../utils/pendingInvite'

type AuthMode = 'sign-in' | 'sign-up'
type AuthField = 'name' | 'email' | 'password' | 'passwordConfirmation'
type AuthFieldErrors = Partial<Record<AuthField, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AuthPageProps = {
  pendingInviteToken: string | null
  onDiscardInvite: () => void
}

export function AuthPage({ pendingInviteToken, onDiscardInvite }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)
  const hasPendingInvite = Boolean(pendingInviteToken)

  const clearFieldError = (field: AuthField) => {
    setFieldErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setFieldErrors({})
    setSubmitError(null)
    setPassword('')
    setPasswordConfirmation('')
  }

  const validate = () => {
    const errors: AuthFieldErrors = {}
    const normalizedEmail = email.trim()

    if (mode === 'sign-up' && !name.trim()) {
      errors.name = 'Introduce tu nombre'
    }

    if (!normalizedEmail) {
      errors.email = 'Introduce tu correo electrónico'
    } else if (!emailPattern.test(normalizedEmail)) {
      errors.email = 'Introduce un correo electrónico válido'
    }

    if (!password) {
      errors.password = 'Introduce tu contraseña'
    } else if (mode === 'sign-up' && password.length < 6) {
      errors.password = 'La contraseña debe tener al menos 6 caracteres'
    }

    if (mode === 'sign-up' && passwordConfirmation !== password) {
      errors.passwordConfirmation = 'Las contraseñas no coinciden'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setIsSubmitting(true)
    const normalizedEmail = email.trim()

    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (error) {
          setSubmitError(getAuthErrorMessage(error))
        } else {
          setPassword('')
        }

        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            display_name: name.trim(),
          },
          ...(pendingInviteToken
            ? { emailRedirectTo: createInviteEmailRedirectUrl(pendingInviteToken) }
            : {}),
        },
      })

      if (error) {
        setSubmitError(getAuthErrorMessage(error))
        return
      }

      setPassword('')
      setPasswordConfirmation('')

      if (data.user && !data.session) {
        setConfirmationEmail(normalizedEmail)
      }
    } catch {
      setSubmitError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (confirmationEmail) {
    return (
      <main className="auth-shell">
        <div className="auth-layout">
          <AuthBrand />
          <section className="card auth-card auth-confirmation" aria-live="polite">
            <span className="confirmation-mark" aria-hidden="true">
              ✓
            </span>
            <h1>Revisa tu correo</h1>
            <p>
              Hemos enviado un enlace de confirmación a <strong>{confirmationEmail}</strong>.
            </p>
            {hasPendingInvite && (
              <p>
                Después de confirmar el correo, vuelve a esta pestaña para completar la invitación.
              </p>
            )}
            <button
              className="auth-secondary-button"
              type="button"
              onClick={() => {
                setConfirmationEmail(null)
                changeMode('sign-in')
              }}
            >
              Volver a iniciar sesión
            </button>
          </section>
        </div>
      </main>
    )
  }

  const isSignIn = mode === 'sign-in'

  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <AuthBrand />

        <section className="card auth-card">
          {hasPendingInvite && (
            <div className="auth-invite-notice" role="status">
              <span aria-hidden="true">✦</span>
              <div>
                <strong>Has recibido una invitación para unirte a un hogar.</strong>
                <p>Accede o crea tu cuenta con el correo al que se envió la invitación.</p>
              </div>
              <button type="button" onClick={onDiscardInvite}>
                Descartar
              </button>
            </div>
          )}

          <div className="auth-mode-switch" aria-label="Selecciona cómo acceder">
            <button
              className={isSignIn ? 'auth-mode-button auth-mode-button--active' : 'auth-mode-button'}
              type="button"
              aria-pressed={isSignIn}
              onClick={() => changeMode('sign-in')}
            >
              Iniciar sesión
            </button>
            <button
              className={!isSignIn ? 'auth-mode-button auth-mode-button--active' : 'auth-mode-button'}
              type="button"
              aria-pressed={!isSignIn}
              onClick={() => changeMode('sign-up')}
            >
              Crear cuenta
            </button>
          </div>

          <div className="auth-card-heading">
            <h1>{isSignIn ? 'Te damos la bienvenida' : 'Crea tu cuenta'}</h1>
            <p>
              {isSignIn
                ? 'Accede a vuestro espacio compartido.'
                : 'Empieza a organizar vuestros gastos en equilibrio.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {!isSignIn && (
              <AuthField
                id="auth-name"
                label="Nombre"
                type="text"
                value={name}
                autoComplete="name"
                error={fieldErrors.name}
                onChange={(value) => {
                  setName(value)
                  clearFieldError('name')
                }}
              />
            )}

            <AuthField
              id="auth-email"
              label="Correo electrónico"
              type="email"
              value={email}
              inputMode="email"
              autoComplete="email"
              error={fieldErrors.email}
              onChange={(value) => {
                setEmail(value)
                clearFieldError('email')
              }}
            />

            <AuthField
              id="auth-password"
              label="Contraseña"
              type="password"
              value={password}
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              error={fieldErrors.password}
              onChange={(value) => {
                setPassword(value)
                clearFieldError('password')
              }}
            />

            {!isSignIn && (
              <AuthField
                id="auth-password-confirmation"
                label="Repetir contraseña"
                type="password"
                value={passwordConfirmation}
                autoComplete="new-password"
                error={fieldErrors.passwordConfirmation}
                onChange={(value) => {
                  setPasswordConfirmation(value)
                  clearFieldError('passwordConfirmation')
                }}
              />
            )}

            {submitError && (
              <p className="auth-submit-error" role="alert">
                {submitError}
              </p>
            )}

            <button className="auth-primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Un momento…' : isSignIn ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

function AuthBrand() {
  return (
    <header className="auth-brand">
      <span className="auth-brand-mark" aria-hidden="true">
        A
      </span>
      <h2>Amedias</h2>
      <p>Tus gastos compartidos, en equilibrio.</p>
    </header>
  )
}

type AuthFieldProps = {
  id: string
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  autoComplete: string
  inputMode?: 'email'
  error?: string
  onChange: (value: string) => void
}

function AuthField({
  id,
  label,
  type,
  value,
  autoComplete,
  inputMode,
  error,
  onChange,
}: AuthFieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
