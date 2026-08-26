import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../services/supabase'
import { getPasswordChangeErrorMessage } from '../utils/authErrors'
import {
  validatePasswordChange,
  type PasswordChangeErrors,
  type PasswordChangeField,
} from '../utils/passwordChange'
import './PasswordChangeForm.css'

type PasswordChangeFormProps = {
  onCancel: () => void
  onSuccess: () => void
}

export function PasswordChangeForm({ onCancel, onSuccess }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<PasswordChangeErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const clearFieldError = (field: PasswordChangeField) => {
    setFieldErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
    setSubmitError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    const errors = validatePasswordChange({
      currentPassword,
      newPassword,
      passwordConfirmation,
    })
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      })

      if (error) {
        setSubmitError(getPasswordChangeErrorMessage(error))
        setIsSubmitting(false)
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setPasswordConfirmation('')
      onSuccess()
    } catch {
      setSubmitError('No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
      setIsSubmitting(false)
    }
  }

  return (
    <form
      className="password-change-form"
      onSubmit={handleSubmit}
      aria-busy={isSubmitting}
      noValidate
    >
      <div className="password-change-heading">
        <h3>Cambiar contraseña</h3>
        <p>Utiliza una contraseña nueva de al menos 6 caracteres.</p>
      </div>

      <PasswordField
        id="password-change-current"
        label="Contraseña actual"
        autoComplete="current-password"
        value={currentPassword}
        error={fieldErrors.currentPassword}
        onChange={(value) => {
          setCurrentPassword(value)
          clearFieldError('currentPassword')
        }}
      />

      <PasswordField
        id="password-change-new"
        label="Nueva contraseña"
        autoComplete="new-password"
        value={newPassword}
        minLength={6}
        error={fieldErrors.newPassword}
        onChange={(value) => {
          setNewPassword(value)
          clearFieldError('newPassword')
        }}
      />

      <PasswordField
        id="password-change-confirmation"
        label="Repetir nueva contraseña"
        autoComplete="new-password"
        value={passwordConfirmation}
        minLength={6}
        error={fieldErrors.passwordConfirmation}
        onChange={(value) => {
          setPasswordConfirmation(value)
          clearFieldError('passwordConfirmation')
        }}
      />

      {submitError && (
        <p className="auth-submit-error" role="alert">
          {submitError}
        </p>
      )}

      <div className="password-change-actions">
        <button className="settings-primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Cambiando contraseña…' : 'Cambiar contraseña'}
        </button>
        <button
          className="password-change-cancel"
          type="button"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

type PasswordFieldProps = {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  minLength?: number
  error?: string
  onChange: (value: string) => void
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  minLength,
  error,
  onChange,
}: PasswordFieldProps) {
  const errorId = id + '-error'

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        minLength={minLength}
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
