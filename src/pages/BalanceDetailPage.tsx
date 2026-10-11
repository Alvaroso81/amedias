import { useMemo } from 'react'
import { BalanceCard } from '../components/BalanceCard'
import { ExpenseDataState } from '../components/ExpenseDataState'
import { NavigationBackButton } from '../components/NavigationBackButton'
import type { ExpenseReadMember, ExpenseRecord, SettlementRecord } from '../types/expenseRead'
import type { SettlementDirection } from '../types/settlement'
import { describeBalance, getBalanceBreakdown } from '../utils/balance'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'
import { getSettlementMemberName } from '../utils/settlementPresentation'

type Props = {
  expenses: ExpenseRecord[]
  settlements: SettlementRecord[]
  members: ExpenseReadMember[]
  currentUserId: string
  perspective?: 'member' | 'household'
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelectExpense: (id: string) => void
  onSelectSettlement: (id: string) => void
  onSettleAccounts: (direction: SettlementDirection) => void
}

export function BalanceDetailPage({ expenses, settlements, members, currentUserId, perspective, loading, error, onRetry, onSelectExpense, onSelectSettlement, onSettleAccounts }: Props) {
  const { rows, balance } = useMemo(() => getBalanceBreakdown(expenses, settlements, members, currentUserId, perspective), [expenses, settlements, members, currentUserId, perspective])
  const participates = balance.creditor?.member.userId === currentUserId || balance.debtor?.member.userId === currentUserId
  const status = balance.amount > 0 && !participates ? 'neutral' : balance.currentUserAmount > 0 ? 'receivable' : balance.currentUserAmount < 0 ? 'payable' : 'settled'
  return <div className="balance-detail-page">
    <header className="add-expense-header"><NavigationBackButton /><h1>Detalle del balance</h1></header>
    {loading || error ? <ExpenseDataState loading={loading} title={loading ? 'Cargando balance' : 'No hemos podido cargar el balance'} message={error ?? 'Estamos recuperando gastos y liquidaciones.'} onRetry={onRetry} /> : <>
      <BalanceCard debtor={balance.debtor?.member.displayName ?? null} creditor={balance.creditor?.member.displayName ?? null}
        amount={balance.amount} status={status} canSettle={participates && status !== 'settled'}
        onSettleAccounts={() => {
          if (balance.debtor && balance.creditor) onSettleAccounts({ fromUserId: balance.debtor.member.userId, toUserId: balance.creditor.member.userId, amount: balance.amount })
        }} />
      <p className="balance-detail-help">Todo el histórico de gastos comunes pagados por miembros y liquidaciones. Los personales y el fondo común no intervienen.</p>
      <ol className="balance-ledger" aria-label="Desglose del balance en orden cronológico">
        {rows.map((row) => <li key={`${row.kind}-${row.record.id}`} className="card balance-ledger-row">
          <time dateTime={row.date}>{formatLongDate(row.date)}</time>
          {row.kind === 'expense' ? <>
            <button className="balance-record-link" type="button" onClick={() => onSelectExpense(row.record.id)}>
              <strong>{row.record.description}</strong><span>{formatCurrency(row.record.amount)} <span aria-hidden="true">›</span></span>
            </button>
            <p>Pagó {row.record.payments.map((payment) => `${payment.displayName} (${formatCurrency(payment.amount)})`).join(' · ') || 'Pagador no disponible'}</p>
            <p>Correspondía: {row.record.splits.map((split) => `${split.displayName}: ${formatCurrency(split.shareAmount)}`).join(' · ')}</p>
            <p className="balance-row-effect">{describeBalance(row.effect)}{row.effect.amount > 0 && ` ${formatCurrency(row.effect.amount)}`}</p>
          </> : <>
            <button className="balance-record-link" type="button" onClick={() => onSelectSettlement(row.record.id)}>
              <strong>Pago de {getSettlementMemberName(members, row.record.fromUserId)} a {getSettlementMemberName(members, row.record.toUserId)}</strong>
              <span>{formatCurrency(row.record.amount)} <span aria-hidden="true">›</span></span>
            </button>
            <p className="balance-row-effect">{row.before.debtor?.member.userId === row.record.fromUserId && row.before.creditor?.member.userId === row.record.toUserId
              ? row.record.amount <= row.before.amount
                ? `Reduce la deuda en ${formatCurrency(row.record.amount)}.`
                : `Liquida ${formatCurrency(row.before.amount)} y el saldo restante cambia de dirección.`
              : 'Este pago modifica el saldo entre las personas indicadas.'}</p>
          </>}
          <ul className="balance-row-impacts" aria-label="Efecto neto por persona">{row.impacts.map((impact) => <li key={impact.userId}>
            {impact.displayName}: {impact.amount > 0 ? '+' : ''}{formatCurrency(impact.amount)}
          </li>)}</ul>
          <div className="balance-running"><span>Saldo acumulado</span><strong>{describeBalance(row.balance)} · {formatCurrency(row.balance.amount)}</strong></div>
        </li>)}
      </ol>
      {!rows.length && <p className="card balance-detail-help">Todavía no hay movimientos que afecten al balance.</p>}
      <p className="balance-detail-help">Efecto neto: positivo aumenta lo que corresponde cobrar; negativo aumenta lo que corresponde pagar. Saldo actual: {formatCurrency(balance.amount)}.</p>
    </>}
  </div>
}
