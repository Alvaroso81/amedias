type AppStatusScreenProps = {
  title: string
  message: string
  loading?: boolean
  symbol?: string
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

export function AppStatusScreen({
  title,
  message,
  loading = false,
  symbol = '!',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: AppStatusScreenProps) {
  return (
    <main className="app-status-shell">
      <section className="card app-status-card" aria-live="polite">
        {loading ? (
          <span className="loading-spinner" aria-hidden="true" />
        ) : (
          <span className="status-mark" aria-hidden="true">
            {symbol}
          </span>
        )}
        <h1>{title}</h1>
        <p>{message}</p>
        {actionLabel && onAction && (
          <button className="auth-primary-button" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <button className="status-secondary-button" type="button" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        )}
      </section>
    </main>
  )
}
