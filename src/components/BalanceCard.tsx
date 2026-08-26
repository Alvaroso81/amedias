import { formatCurrency } from '../utils/formatCurrency'

type BalanceCardProps = {
  debtor: string
  creditor: string
  amount: number
}

export function BalanceCard({ debtor, creditor, amount }: BalanceCardProps) {
  return (
    <section className="card balance-card" aria-labelledby="balance-title">
      <p className="card-label">Para quedar equilibrados</p>
      <h2 id="balance-title">
        {debtor} debe a {creditor}
      </h2>
      <p className="balance-amount">{formatCurrency(amount)}</p>
      <button className="primary-button" type="button">
        Saldar cuentas
      </button>
    </section>
  )
}
