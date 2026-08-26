import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../services/supabase'

type HouseholdOnboardingPageProps = {
  userId: string
  displayName: string
  onHouseholdCreated: () => Promise<void>
  isSigningOut: boolean
  signOutError: string | null
  onSignOut: () => void
}

export function HouseholdOnboardingPage({
  userId,
  displayName,
  onHouseholdCreated,
  isSigningOut,
  signOutError,
  onSignOut,
}: HouseholdOnboardingPageProps) {
  const [householdName, setHouseholdName] = useState('Mi hogar')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    const normalizedName = householdName.trim()

    if (!normalizedName) {
      setFieldError('Introduce un nombre para el hogar')
      return
    }

    setIsSubmitting(true)

    try {
      const { error } = await supabase.from('households').insert({
        name: normalizedName,
        currency: 'EUR',
        created_by: userId,
      })

      if (error) {
        setSubmitError('No hemos podido crear el hogar. Inténtalo de nuevo.')
        return
      }

      await onHouseholdCreated()
    } catch {
      setSubmitError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-layout">
        <header className="onboarding-heading">
          <span className="onboarding-step">Primer paso</span>
          <h1>Vamos a crear tu hogar</h1>
          <p>Este será el espacio compartido donde registraréis vuestros gastos.</p>
          <span className="onboarding-welcome">Hola, {displayName}</span>
        </header>

        <form className="card onboarding-card" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="household-name">Nombre del hogar</label>
            <input
              id="household-name"
              type="text"
              value={householdName}
              placeholder="Familia Álvaro y Marta"
              autoComplete="organization"
              required
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'household-name-error' : undefined}
              onChange={(event) => {
                setHouseholdName(event.target.value)
                setFieldError(null)
              }}
            />
            {fieldError && (
              <p className="field-error" id="household-name-error">
                {fieldError}
              </p>
            )}
          </div>

          <div className="onboarding-currency">
            <div>
              <span>Moneda</span>
              <small>Podrás gestionar otros ajustes más adelante.</small>
            </div>
            <strong>EUR (€)</strong>
          </div>

          {submitError && (
            <p className="auth-submit-error" role="alert">
              {submitError}
            </p>
          )}

          <button className="auth-primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creando hogar…' : 'Crear hogar'}
          </button>
        </form>

        <button
          className="onboarding-signout"
          type="button"
          disabled={isSigningOut}
          onClick={onSignOut}
        >
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
        {signOutError && (
          <p className="onboarding-signout-error" role="alert">
            {signOutError}
          </p>
        )}
      </div>
    </main>
  )
}
