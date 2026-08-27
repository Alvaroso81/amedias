import './BalanceCard.css'
import { formatCurrency } from '../utils/formatCurrency'

type BalanceCardProps = {
  debtor: string | null
  creditor: string | null
  amount: number
  status: 'receivable' | 'payable' | 'settled'
  canSettle: boolean
  onSettleAccounts: () => void
}

function formatSignedBalance(amount: number, status: BalanceCardProps['status']) {
  const roundedAmount = Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100

  if (status === 'settled' || roundedAmount < 0.01) return formatCurrency(0)

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
}: BalanceCardProps) {
  const hasPendingBalance = status !== 'settled' && Boolean(debtor && creditor && amount >= 0.01)

  return (
    <section
      className={`card balance-card balance-card--${status}`}
      aria-labelledby="balance-title"
    >
      <h2 id="balance-title">
        {hasPendingBalance ? `${debtor} debe a ${creditor}` : 'Estáis equilibrados'}
      </h2>
      <p className="balance-amount">{formatSignedBalance(amount, status)}</p>
      {hasPendingBalance && canSettle && (
        <button className="primary-button" type="button" onClick={onSettleAccounts}>
          Saldar cuentas
        </button>
      )}
    </section>
  )
}
