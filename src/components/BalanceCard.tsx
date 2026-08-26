import { formatCurrency } from '../utils/formatCurrency'

type BalanceCardProps = {
  debtor: string | null
  creditor: string | null
  amount: number
  onSettleAccounts: () => void
}

export function BalanceCard({ debtor, creditor, amount, onSettleAccounts }: BalanceCardProps) {
  const hasPendingBalance = Boolean(debtor && creditor && amount >= 0.01)

  return (
    <section className="card balance-card" aria-labelledby="balance-title">
      <p className="card-label">Para quedar equilibrados</p>
      <h2 id="balance-title">
        {hasPendingBalance ? `${debtor} debe a ${creditor}` : 'Estáis equilibrados'}
      </h2>
      <p className="balance-amount">{formatCurrency(amount)}</p>
      {hasPendingBalance && (
        <button className="primary-button" type="button" onClick={onSettleAccounts}>
          Saldar cuentas
        </button>
      )}
    </section>
  )
}
