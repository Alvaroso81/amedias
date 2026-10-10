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

export function AuthField({
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
