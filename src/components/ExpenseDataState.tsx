type ExpenseDataStateProps = {
  loading?: boolean
  title: string
  message: string
  onRetry?: () => void
}

export function ExpenseDataState({
  loading = false,
  title,
  message,
  onRetry,
}: ExpenseDataStateProps) {
  return (
    <section className="card expense-data-state" aria-live="polite">
      {loading ? (
        <span className="loading-spinner" aria-hidden="true" />
      ) : (
        <span className="expense-data-state-icon" aria-hidden="true">
          {onRetry ? '!' : '＋'}
        </span>
      )}
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && (
        <button className="auth-secondary-button" type="button" onClick={onRetry}>
          Volver a intentar
        </button>
      )}
    </section>
  )
}
