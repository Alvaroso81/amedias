import { useMemo } from 'react'
import { AppHeader } from '../components/AppHeader'
import { BalanceCard } from '../components/BalanceCard'
import { CommonFundCard } from '../components/CommonFundCard'
import { CategoryList } from '../components/CategoryList'
import { ExpenseDataState } from '../components/ExpenseDataState'
import { ExpenseSummary } from '../components/ExpenseSummary'
import { RecentExpenses } from '../components/RecentExpenses'
import type { CategoryExpense, PersonContribution } from '../types/finance'
import type { CommonFundState } from '../types/commonFund'
import type {
  ExpenseReadMember,
  ExpenseRecord,
  SettlementRecord,
} from '../types/expenseRead'
import type { SettlementDirection } from '../types/settlement'
import { formatMonthYear, getMonthKey } from '../utils/formatDate'

type HomePageProps = {
  displayName: string
  householdName: string
  expenses: ExpenseRecord[]
  currentUserId: string
  members: ExpenseReadMember[]
  settlements: SettlementRecord[]
  commonFund: CommonFundState & { loading: boolean; error: string | null }
  loading: boolean
  error: string | null
  isSigningOut: boolean
  signOutError: string | null
  onRetry: () => void
  onRetryCommonFund: () => void
  onTopUpFund: () => void
  onViewFund: () => void
  onSelectExpense: (expenseId: string) => void
  onViewAllExpenses: () => void
  onViewStatistics: () => void
  onSettleAccounts: (direction: SettlementDirection) => void
  onSignOut: () => void
  statusMessage: string | null
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function HomePage({
  displayName,
  householdName,
  expenses,
  currentUserId,
  members,
  settlements,
  commonFund,
  loading,
  error,
  isSigningOut,
  signOutError,
  onRetry,
  onRetryCommonFund,
  onTopUpFund,
  onViewFund,
  onSelectExpense,
  onViewAllExpenses,
  onViewStatistics,
  onSettleAccounts,
  onSignOut,
  statusMessage,
}: HomePageProps) {
  const currentDate = new Date()
  const currentMonthKey = getMonthKey(currentDate)
  const currentPeriod = formatMonthYear(currentDate)
  const commonExpenses = useMemo(
    () => expenses.filter((expense) => expense.expenseType === 'common'),
    [expenses],
  )

  const monthlyExpenses = useMemo(
    () => commonExpenses.filter((expense) => expense.expenseDate.startsWith(currentMonthKey)),
    [commonExpenses, currentMonthKey],
  )
  const total = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0)

  const contributions = useMemo(() => {
    const paidByMember = new Map(members.map((member) => [member.userId, 0]))
    let paidByFund = 0

    monthlyExpenses.forEach((expense) => {
      if (expense.paymentSource === 'common_fund') {
        paidByFund += expense.amount
        return
      }

      expense.payments.forEach((payment) => {
        paidByMember.set(payment.userId, (paidByMember.get(payment.userId) ?? 0) + payment.amount)
      })
    })

    const totalPaid = paidByFund + [...paidByMember.values()].reduce((sum, value) => sum + value, 0)
    const result: PersonContribution[] = [
      {
        id: 'common_fund',
        name: 'Fondo común',
        amount: roundMoney(paidByFund),
        percentage: totalPaid ? Math.round((paidByFund / totalPaid) * 100) : 0,
      },
      ...members.map((member) => ({
        id: member.userId,
        name: member.displayName,
        amount: roundMoney(paidByMember.get(member.userId) ?? 0),
        percentage: totalPaid
          ? Math.round(((paidByMember.get(member.userId) ?? 0) / totalPaid) * 100)
          : 0,
      })),
    ]

    if (result.length && totalPaid) {
      result[result.length - 1].percentage = 100 - result
        .slice(0, -1)
        .reduce((sum, contribution) => sum + contribution.percentage, 0)
    }

    return result
  }, [members, monthlyExpenses])

  const balance = useMemo(() => {
    const balances = new Map(members.map((member) => [member.userId, 0]))

    commonExpenses.forEach((expense) => {
      if (expense.paymentSource === 'common_fund') return

      expense.payments.forEach((payment) => {
        balances.set(payment.userId, (balances.get(payment.userId) ?? 0) + payment.amount)
      })
      expense.splits.forEach((split) => {
        balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.shareAmount)
      })
    })

    settlements.forEach((settlement) => {
      balances.set(
        settlement.fromUserId,
        (balances.get(settlement.fromUserId) ?? 0) + settlement.amount,
      )
      balances.set(
        settlement.toUserId,
        (balances.get(settlement.toUserId) ?? 0) - settlement.amount,
      )
    })

    const memberBalances = members.map((member) => ({
      member,
      amount: roundMoney(balances.get(member.userId) ?? 0),
    }))
    const currentUserBalance = memberBalances.find(
      ({ member }) => member.userId === currentUserId,
    )

    if (!currentUserBalance || Math.abs(currentUserBalance.amount) < 0.01) {
      return { creditor: null, debtor: null, amount: 0, currentUserAmount: 0 }
    }

    const counterpart =
      currentUserBalance.amount > 0
        ? [...memberBalances]
            .filter(({ amount }) => amount <= -0.01)
            .sort((first, second) => first.amount - second.amount)[0]
        : [...memberBalances]
            .filter(({ amount }) => amount >= 0.01)
            .sort((first, second) => second.amount - first.amount)[0]

    if (!counterpart) {
      return { creditor: null, debtor: null, amount: 0, currentUserAmount: 0 }
    }

    const creditor = currentUserBalance.amount > 0 ? currentUserBalance : counterpart
    const debtor = currentUserBalance.amount < 0 ? currentUserBalance : counterpart

    return {
      creditor,
      debtor,
      amount: roundMoney(Math.min(creditor.amount, Math.abs(debtor.amount))),
      currentUserAmount: currentUserBalance.amount,
    }
  }, [commonExpenses, currentUserId, members, settlements])

  const balanceStatus =
    balance.currentUserAmount >= 0.01
      ? 'receivable'
      : balance.currentUserAmount <= -0.01
        ? 'payable'
        : 'settled'
  const currentUserCanSettle = balanceStatus === 'payable'

  const categories = useMemo(() => {
    const categoryTotals = new Map<string, CategoryExpense>()

    monthlyExpenses.forEach((expense) => {
      const categoryKey = expense.category.id ?? expense.category.name
      const currentCategory = categoryTotals.get(categoryKey)
      categoryTotals.set(categoryKey, {
        name: expense.category.name,
        icon: expense.category.icon,
        amount: roundMoney((currentCategory?.amount ?? 0) + expense.amount),
      })
    })

    return [...categoryTotals.values()]
      .sort((first, second) => second.amount - first.amount)
      .slice(0, 5)
  }, [monthlyExpenses])

  return (
    <div className="home-page">
      <AppHeader
        displayName={displayName}
        householdName={householdName}
        currentPeriod={currentPeriod}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        onSignOut={onSignOut}
      />

      {statusMessage && (
        <p className="expense-update-notice" role="status">
          <span aria-hidden="true">✓</span> {statusMessage}
        </p>
      )}

      {loading ? (
        <ExpenseDataState
          loading
          title="Cargando gastos"
          message="Estamos preparando el resumen de vuestro hogar…"
        />
      ) : error ? (
        <ExpenseDataState
          title="No hemos podido cargar los gastos"
          message={error}
          onRetry={onRetry}
        />
      ) : (
        <>
          <div className="summary-grid">
            <ExpenseSummary total={total} contributions={contributions} />
            <CommonFundCard
              {...commonFund}
              onRetry={onRetryCommonFund}
              onTopUp={onTopUpFund}
              onViewFund={onViewFund}
            />
            <BalanceCard
              debtor={
                balanceStatus === 'settled'
                  ? null
                  : (balance.debtor?.member.displayName ?? null)
              }
              creditor={
                balanceStatus === 'settled'
                  ? null
                  : (balance.creditor?.member.displayName ?? null)
              }
              amount={balanceStatus === 'settled' ? 0 : balance.amount}
              status={balanceStatus}
              canSettle={currentUserCanSettle}
              onSettleAccounts={() => {
                if (!balance.debtor || !balance.creditor) return

                onSettleAccounts({
                  fromUserId: balance.debtor.member.userId,
                  toUserId: balance.creditor.member.userId,
                  amount: balance.amount,
                })
              }}
            />
          </div>

          <div className="details-grid">
            <CategoryList categories={categories} onViewStatistics={onViewStatistics} />
            <RecentExpenses
              expenses={expenses.slice(0, 3)}
              onSelectExpense={onSelectExpense}
              onViewAll={onViewAllExpenses}
            />
          </div>
        </>
      )}
    </div>
  )
}
