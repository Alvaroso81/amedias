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
  const isPlainEmptyState = !loading && !onRetry

  return (
    <section
      className={`card expense-data-state${isPlainEmptyState ? ' expense-data-state--plain' : ''}`}
      aria-live="polite"
    >
      {loading ? (
        <span className="loading-spinner" aria-hidden="true" />
      ) : onRetry ? (
        <span className="expense-data-state-icon" aria-hidden="true">
          !
        </span>
      ) : null}
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
