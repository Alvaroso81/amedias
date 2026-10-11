import './BalanceCard.css'
import { formatCurrency } from '../utils/formatCurrency'

type BalanceCardProps = {
  debtor: string | null
  creditor: string | null
  amount: number
  status: 'receivable' | 'payable' | 'settled' | 'neutral'
  canSettle: boolean
  onSettleAccounts: () => void
  onViewDetails?: () => void
}

function formatSignedBalance(amount: number, status: BalanceCardProps['status']) {
  const roundedAmount = Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100

  if (status === 'settled' || roundedAmount < 0.01) return formatCurrency(0)

  if (status === 'neutral') return formatCurrency(roundedAmount)

  const sign = status === 'receivable' ? '+' : '−'
  return `${sign}${formatCurrency(roundedAmount)}`
}

export function BalanceCard({
  debtor,
  creditor,
  amount,
  status,
  canSettle,
  onSettleAccounts,
  onViewDetails,
}: BalanceCardProps) {
  const hasPendingBalance = status !== 'settled' && Boolean(debtor && creditor && amount >= 0.01)

  return (
    <section
      className={`card balance-card balance-card--${status}`}
      aria-labelledby="balance-title"
    >
      {onViewDetails ? <h2 id="balance-title"><button className="balance-details-button" type="button" onClick={onViewDetails} aria-label="Ver detalle del balance">
        <span>{hasPendingBalance ? `${debtor} debe a ${creditor}` : 'Estáis equilibrados'}</span>
        <span className="balance-amount">{formatSignedBalance(amount, status)}</span>
        <span className="balance-details-hint">Ver detalle <span aria-hidden="true">›</span></span>
      </button></h2> : <>
        <h2 id="balance-title">{hasPendingBalance ? `${debtor} debe a ${creditor}` : 'Estáis equilibrados'}</h2>
        <p className="balance-amount">{formatSignedBalance(amount, status)}</p>
      </>}
      {hasPendingBalance && canSettle && (
        <button className="primary-button" type="button" onClick={onSettleAccounts}>
          {status === 'receivable' ? `He recibido de ${debtor}` : `He pagado a ${creditor}`}
        </button>
      )}
    </section>
  )
}
