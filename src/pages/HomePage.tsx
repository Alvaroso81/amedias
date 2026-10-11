import { getBalanceBreakdown } from '../utils/balance'
import { useMemo, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { SavingsSummaryCard } from '../components/SavingsSummaryCard'
import type { SavingsGoal } from '../types/savings'
import { BalanceCard } from '../components/BalanceCard'
import { CommonFundCard } from '../components/CommonFundCard'
import { CategoryList } from '../components/CategoryList'
import { ExpenseDataState } from '../components/ExpenseDataState'
import { ExpenseSummary } from '../components/ExpenseSummary'
import { PersonalExpenseSummary } from '../components/PersonalExpenseSummary'
import { RecentExpenses } from '../components/RecentExpenses'
import type { CategoryExpense, PersonContribution } from '../types/finance'
import type { CommonFundState } from '../types/commonFund'
import type {
  ExpenseReadMember,
  ExpenseRecord,
  SettlementRecord,
} from '../types/expenseRead'
import type { SettlementDirection } from '../types/settlement'
import type { RecurringExpenseOccurrence } from '../types/recurringExpenses'
import { getCommonExpensesInPeriod } from '../utils/commonExpenseSummary'
import { calculateAccountingMonth } from '../utils/accountingMonth'
import { formatCurrency } from '../utils/formatCurrency'
import {
  formatMonthYear,
  getFirstDayOfMonth,
  getMonthKey,
  getTodayIsoDate,
} from '../utils/formatDate'

type HomePageProps = {
  displayName: string
  householdName: string
  commonExpensesStartDate: string | null
  accountingMonthStartDay: number
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
  onViewPersonalStatistics: () => void
  onCommonExpensesStartDateChange: (startDate: string) => Promise<void>
  onViewBalance: () => void
  onSettleAccounts: (direction: SettlementDirection) => void
  onSignOut: () => void
  statusMessage: string | null
  pendingRecurringOccurrences: RecurringExpenseOccurrence[]
  onViewRecurringExpenses: () => void
  savings: { goals: SavingsGoal[]; loading: boolean; error: string | null }
  onViewSavings: () => void
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function HomePage({
  displayName,
  householdName,
  commonExpensesStartDate,
  accountingMonthStartDay,
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
  onViewPersonalStatistics,
  onCommonExpensesStartDateChange,
  onViewBalance,
  onSettleAccounts,
  onSignOut,
  statusMessage,
  pendingRecurringOccurrences,
  onViewRecurringExpenses,
  savings,
  onViewSavings,
}: HomePageProps) {
  const today = useMemo(() => getTodayIsoDate(), [])
  const persistedSummaryStartDate = commonExpensesStartDate ?? getFirstDayOfMonth(today)
  const currentAccountingMonth = calculateAccountingMonth(today, accountingMonthStartDay)
  const currentAccountingDate = new Date(`${currentAccountingMonth}T12:00:00`)
  const currentMonthKey = getMonthKey(currentAccountingDate)
  const currentPeriod = formatMonthYear(currentAccountingDate)
  const [optimisticSummaryStartDate, setOptimisticSummaryStartDate] = useState<string | null>(
    null,
  )
  const summaryStartDate = optimisticSummaryStartDate ?? persistedSummaryStartDate
  const summaryStartAccountingMonth = calculateAccountingMonth(
    summaryStartDate,
    accountingMonthStartDay,
  )
  const [isSavingSummaryStartDate, setIsSavingSummaryStartDate] = useState(false)
  const [summaryStartDateError, setSummaryStartDateError] = useState<string | null>(null)
  const commonExpenses = useMemo(
    () => expenses.filter((expense) => expense.expenseType === 'common'),
    [expenses],
  )

  const monthlyExpenses = useMemo(
    () => commonExpenses.filter((expense) => expense.accountingMonth.startsWith(currentMonthKey)),
    [commonExpenses, currentMonthKey],
  )
  const summaryExpenses = useMemo(
    () => getCommonExpensesInPeriod(
      expenses,
      summaryStartAccountingMonth,
      currentAccountingMonth,
    ),
    [currentAccountingMonth, expenses, summaryStartAccountingMonth],
  )
  const total = summaryExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const monthlyPersonalExpenses = useMemo(
    () =>
      expenses.filter(
        (expense) =>
          expense.expenseType === 'personal' &&
          expense.personalOwnerId === currentUserId &&
          expense.accountingMonth.startsWith(currentMonthKey),
      ),
    [currentMonthKey, currentUserId, expenses],
  )
  const personalTotal = roundMoney(
    monthlyPersonalExpenses.reduce((sum, expense) => sum + expense.amount, 0),
  )

  const contributions = useMemo(() => {
    const paidByMember = new Map(members.map((member) => [member.userId, 0]))
    let paidByFund = 0

    summaryExpenses.forEach((expense) => {
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
  }, [members, summaryExpenses])

  const handleSummaryStartDateChange = async (startDate: string) => {
    if (!startDate || startDate === summaryStartDate || startDate > today) return

    setOptimisticSummaryStartDate(startDate)
    setIsSavingSummaryStartDate(true)
    setSummaryStartDateError(null)

    try {
      await onCommonExpensesStartDateChange(startDate)
    } catch {
      setSummaryStartDateError('No hemos podido guardar la fecha. Inténtalo de nuevo.')
    } finally {
      setOptimisticSummaryStartDate(null)
      setIsSavingSummaryStartDate(false)
    }
  }

  const balance = useMemo(() => getBalanceBreakdown(commonExpenses, settlements, members, currentUserId).balance,
    [commonExpenses, currentUserId, members, settlements])

  const balanceStatus =
    balance.currentUserAmount >= 0.01
      ? 'receivable'
      : balance.currentUserAmount <= -0.01
        ? 'payable'
        : 'settled'
  const currentUserCanSettle = balanceStatus !== 'settled'

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

      <SavingsSummaryCard {...savings} onOpen={onViewSavings} />

      {pendingRecurringOccurrences.length > 0 && (
        <section className="card home-recurring-card" aria-labelledby="home-recurring-title">
          <div className="home-recurring-heading">
            <div>
              <span>Gastos pendientes</span>
              <h2 id="home-recurring-title">
                {pendingRecurringOccurrences.length} {pendingRecurringOccurrences.length === 1 ? 'recurrente por revisar' : 'recurrentes por revisar'}
              </h2>
            </div>
            <button type="button" onClick={onViewRecurringExpenses}>Revisar</button>
          </div>
          <div className="home-recurring-preview">
            {pendingRecurringOccurrences.slice(0, 2).map((occurrence) => (
              <div key={occurrence.id}>
                <span aria-hidden="true">{occurrence.proposedCategory.icon}</span>
                <strong>{occurrence.proposedDescription}</strong>
                <b>{formatCurrency(occurrence.proposedAmountCents / 100)}</b>
              </div>
            ))}
          </div>
        </section>
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
          <div
            className={`summary-grid${monthlyPersonalExpenses.length ? ' summary-grid--with-personal' : ''}`}
          >
            <ExpenseSummary
              total={total}
              contributions={contributions}
              startDate={summaryStartDate}
              maxDate={today}
              isSavingStartDate={isSavingSummaryStartDate}
              startDateError={summaryStartDateError}
              onStartDateChange={handleSummaryStartDateChange}
            />
            {monthlyPersonalExpenses.length > 0 && (
              <PersonalExpenseSummary
                total={personalTotal}
                expenseCount={monthlyPersonalExpenses.length}
                onViewPersonalStatistics={onViewPersonalStatistics}
              />
            )}
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
              onViewDetails={onViewBalance}
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
