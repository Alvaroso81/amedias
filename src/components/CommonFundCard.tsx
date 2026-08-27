import './CommonFund.css'
import type { CommonFundState } from '../types/commonFund'
import { formatCurrency } from '../utils/formatCurrency'
import {
  getCommonFundBand,
  getCommonFundMonthlyActivity,
  getCommonFundPercentage,
  isCommonFundUnstarted,
} from '../utils/commonFund'

type CommonFundCardProps = CommonFundState & {
  loading: boolean
  error: string | null
  onRetry: () => void
  onTopUp: () => void
  onViewFund: () => void
}

const percentageFormatter = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 2,
})

export function CommonFundCard({
  settings,
  balance,
  movements,
  loading,
  error,
  onRetry,
  onTopUp,
  onViewFund,
}: CommonFundCardProps) {
  if (loading) {
    return (
      <section className="card common-fund-card common-fund-card--loading" aria-busy="true">
        <span className="loading-spinner" aria-hidden="true" />
        <p>Cargando fondo común…</p>
      </section>
    )
  }

  if (error || !settings) {
    return (
      <section className="card common-fund-card common-fund-card--error">
        <p>No hemos podido cargar el fondo común.</p>
        <button type="button" onClick={onRetry}>Volver a intentar</button>
      </section>
    )
  }

  const percentage = getCommonFundPercentage(balance, settings.suggestedContributionAmount)
  const isUnstarted = isCommonFundUnstarted(balance, movements)
  const band = isUnstarted ? 'neutral' : getCommonFundBand(percentage)
  const showProgress = !isUnstarted && settings.suggestedContributionAmount > 0
  const { addedThisMonth, spentThisMonth } = getCommonFundMonthlyActivity(movements)

  return (
    <section
      className={`card common-fund-card common-fund-card--${band}${settings.enabled ? '' : ' common-fund-card--disabled'}`}
      aria-labelledby="common-fund-card-title"
    >
      <div className="common-fund-card__heading">
        <div>
          <p id="common-fund-card-title">Fondo común</p>
          <span>{settings.enabled ? 'Disponible' : 'Desactivado'}</span>
        </div>
        <span className="common-fund-card__icon" aria-hidden="true">◎</span>
      </div>

      <strong className="common-fund-card__balance">{formatCurrency(balance)}</strong>
      {isUnstarted ? (
        <p className="common-fund-card__empty-copy">
          Aún no habéis añadido dinero al fondo
        </p>
      ) : showProgress ? (
        <>
          <span className="common-fund-card__percentage">
            {percentageFormatter.format(percentage)} % del fondo habitual
          </span>
          <div
            className="common-fund-progress"
            role="progressbar"
            aria-label={
              'Saldo disponible: ' +
              percentageFormatter.format(percentage) +
              ' por ciento del fondo habitual'
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(percentage))}
          >
            <span style={{ width: Math.min(100, percentage) + '%' }} />
          </div>
        </>
      ) : null}

      <div
        className={
          isUnstarted
            ? 'common-fund-card__facts common-fund-card__facts--empty'
            : 'common-fund-card__facts'
        }
      >
        {!isUnstarted && (
          <>
            <span>Añadido este mes <b>{formatCurrency(addedThisMonth)}</b></span>
            <span>Por persona <b>{formatCurrency(addedThisMonth / 2)}</b></span>
          </>
        )}
        <span>Gastado este mes <b>{formatCurrency(spentThisMonth)}</b></span>
      </div>

      <div className="common-fund-card__actions">
        <button type="button" disabled={!settings.enabled} onClick={onTopUp}>Añadir al fondo</button>
        <button type="button" onClick={onViewFund}>Ver fondo</button>
      </div>
    </section>
  )
}
