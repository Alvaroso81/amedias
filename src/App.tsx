import type { User } from '@supabase/supabase-js'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { AppStatusScreen } from './components/AppStatusScreen'
import { ExpenseDataState } from './components/ExpenseDataState'
import { PendingInviteGate } from './components/PendingInviteGate'
import { SettlementDialog } from './components/SettlementDialog'
import { useAuth } from './hooks/useAuth'
import { useCommonFund } from './hooks/useCommonFund'
import { useExpenses } from './hooks/useExpenses'
import { useHousehold } from './hooks/useHousehold'
import { AddExpensePage } from './pages/AddExpensePage'
import { AuthPage } from './pages/AuthPage'
import { CommonFundPage } from './pages/CommonFundPage'
import { ExpenseDetailPage } from './pages/ExpenseDetailPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { HomePage } from './pages/HomePage'
import { HouseholdOnboardingPage } from './pages/HouseholdOnboardingPage'
import { SettingsPage } from './pages/SettingsPage'
import { SettlementDetailPage } from './pages/SettlementDetailPage'
import { SettlementsPage } from './pages/SettlementsPage'
import { deleteExpense, ExpenseServiceError } from './services/expenses'
import { deleteSettlement } from './services/settlements'
import { supabase } from './services/supabase'
import type { HouseholdRole } from './types/household'
import type { StatisticsExpenseFilter } from './types/expenseFilters'
import type { AppPage } from './types/navigation'
import type { SettlementDirection } from './types/settlement'
import { capturePendingInviteToken, clearPendingInviteToken } from './utils/pendingInvite'

const StatisticsPage = lazy(() =>
  import('./pages/StatisticsPage').then((module) => ({ default: module.StatisticsPage })),
)

function App() {
  const { user, loading, error } = useAuth()
  const [pendingInviteToken, setPendingInviteToken] = useState(capturePendingInviteToken)
  const clearInvite = useCallback(() => {
    clearPendingInviteToken()
    setPendingInviteToken(null)
  }, [])

  if (loading) {
    return (
      <AppStatusScreen
        loading
        title="Amedias"
        message="Estamos preparando tu espacio compartido…"
      />
    )
  }

  if (error) {
    return (
      <AppStatusScreen
        title="No hemos podido iniciar Amedias"
        message={error}
        actionLabel="Volver a intentar"
        onAction={() => window.location.reload()}
      />
    )
  }

  if (!user) {
    return (
      <AuthPage
        pendingInviteToken={pendingInviteToken}
        onDiscardInvite={clearInvite}
      />
    )
  }

  return (
    <AuthenticatedApp
      user={user}
      pendingInviteToken={pendingInviteToken}
      onClearInvite={clearInvite}
    />
  )
}

type AuthenticatedAppProps = {
  user: User
  pendingInviteToken: string | null
  onClearInvite: () => void
}

function AuthenticatedApp({ user, pendingInviteToken, onClearInvite }: AuthenticatedAppProps) {
  const {
    profile,
    household,
    membership,
    loading,
    error,
    reload,
    updateAccountingMonthStartDay,
    updateCommonExpensesStartDate,
  } = useHousehold(user)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setSignOutError(null)

    try {
      const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' })

      if (logoutError) {
        setSignOutError('No hemos podido cerrar la sesión. Inténtalo de nuevo.')
        setIsSigningOut(false)
      }
    } catch {
      setSignOutError('No hemos podido cerrar la sesión. Inténtalo de nuevo.')
      setIsSigningOut(false)
    }
  }

  let authenticatedContent

  if (loading) {
    authenticatedContent = (
      <AppStatusScreen
        loading
        title="Cargando tu hogar"
        message="Estamos recuperando vuestro espacio compartido…"
      />
    )
  } else if (error) {
    authenticatedContent = (
      <AppStatusScreen
        title="No hemos podido cargar tus datos"
        message={error}
        actionLabel="Volver a intentar"
        onAction={() => void reload()}
        secondaryActionLabel={isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        onSecondaryAction={() => void handleSignOut()}
      />
    )
  } else if (!household || !membership) {
    authenticatedContent = (
      <HouseholdOnboardingPage
        userId={user.id}
        displayName={profile?.displayName ?? 'Usuario'}
        onHouseholdCreated={reload}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        onSignOut={() => void handleSignOut()}
      />
    )
  } else {
    authenticatedContent = (
      <ExpenseApp
        displayName={profile?.displayName ?? 'Usuario'}
        email={user.email ?? ''}
        householdId={household.id}
        householdName={household.name}
        commonExpensesStartDate={household.commonExpensesStartDate}
        accountingMonthStartDay={household.accountingMonthStartDay}
        currentUserId={user.id}
        role={membership.role}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        onCommonExpensesStartDateChange={(startDate) =>
          updateCommonExpensesStartDate(household.id, startDate)
        }
        onAccountingMonthStartDayChange={(startDay) =>
          updateAccountingMonthStartDay(household.id, startDay)
        }
        onSignOut={() => void handleSignOut()}
      />
    )
  }

  return (
    <PendingInviteGate
      token={pendingInviteToken}
      onAccepted={reload}
      onClearToken={onClearInvite}
    >
      {authenticatedContent}
    </PendingInviteGate>
  )
}

type ExpenseAppProps = {
  displayName: string
  email: string
  householdId: string
  householdName: string
  commonExpensesStartDate: string | null
  accountingMonthStartDay: number
  currentUserId: string
  role: HouseholdRole
  isSigningOut: boolean
  signOutError: string | null
  onCommonExpensesStartDateChange: (startDate: string) => Promise<void>
  onAccountingMonthStartDayChange: (startDay: number) => Promise<void>
  onSignOut: () => void
}

type SettlementDialogState =
  | { mode: 'create'; direction: SettlementDirection }
  | { mode: 'edit'; settlementId: string }

function ExpenseApp({
  displayName,
  email,
  householdId,
  householdName,
  commonExpensesStartDate,
  accountingMonthStartDay,
  currentUserId,
  role,
  isSigningOut,
  signOutError,
  onCommonExpensesStartDateChange,
  onAccountingMonthStartDayChange,
  onSignOut,
}: ExpenseAppProps) {
  const {
    visibleExpenses: expenses,
    commonExpenses,
    myPersonalExpenses,
    members,
    settlements,
    loading,
    error,
    refresh,
  } = useExpenses(householdId, currentUserId)
  const commonFund = useCommonFund(householdId)
  const [currentPage, setCurrentPage] = useState<AppPage>('home')
  const [statisticsInitialScope, setStatisticsInitialScope] = useState<'common' | 'personal'>('common')
  const [commonFundInitialDialog, setCommonFundInitialDialog] = useState<'top-up' | undefined>()
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const [expenseNotice, setExpenseNotice] = useState<string | null>(null)
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null)
  const [settlementNotice, setSettlementNotice] = useState<string | null>(null)
  const [settlementDialog, setSettlementDialog] = useState<SettlementDialogState | null>(null)
  const [statisticsExpenseFilter, setStatisticsExpenseFilter] =
    useState<StatisticsExpenseFilter | null>(null)
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId)
  const selectedSettlement = settlements.find(
    (settlement) => settlement.id === selectedSettlementId,
  )
  const expensesPageKey = statisticsExpenseFilter
    ? `${statisticsExpenseFilter.scope}-${statisticsExpenseFilter.periodMode}-${statisticsExpenseFilter.anchorDate}-${statisticsExpenseFilter.categoryId ?? statisticsExpenseFilter.categoryName}`
    : 'expenses-standard'

  useEffect(() => {
    if (!expenseNotice) return

    const noticeTimer = window.setTimeout(() => setExpenseNotice(null), 2500)

    return () => window.clearTimeout(noticeTimer)
  }, [expenseNotice])

  useEffect(() => {
    if (!settlementNotice) return

    const noticeTimer = window.setTimeout(() => setSettlementNotice(null), 2500)

    return () => window.clearTimeout(noticeTimer)
  }, [settlementNotice])

  const goHome = () => {
    setExpenseNotice(null)
    setSettlementNotice(null)
    setCurrentPage('home')
  }
  const goToExpenses = () => {
    setExpenseNotice(null)
    setSelectedExpenseId(null)
    setStatisticsExpenseFilter(null)
    setCurrentPage('expenses')
  }
  const goToStatistics = () => {
    setExpenseNotice(null)
    setSettlementNotice(null)
    setStatisticsInitialScope('common')
    setCurrentPage('statistics')
  }
  const goToPersonalStatistics = () => {
    setExpenseNotice(null)
    setSettlementNotice(null)
    setStatisticsInitialScope('personal')
    setCurrentPage('statistics')
  }
  const goToSettings = () => {
    setExpenseNotice(null)
    setSettlementNotice(null)
    setCurrentPage('settings')
  }

  const goToCommonFund = (dialog?: 'top-up') => {
    setCommonFundInitialDialog(dialog)
    setCurrentPage('common-fund')
  }

  const goToSettlements = () => {
    setSettlementNotice(null)
    setSelectedSettlementId(null)
    setCurrentPage('settlements')
  }

  const handleExpenseCreated = useCallback(async () => {
    await Promise.all([refresh(), commonFund.refresh()])
    setSelectedExpenseId(null)
    setCurrentPage('home')
  }, [commonFund, refresh])

  const openExpense = (expenseId: string) => {
    setExpenseNotice(null)
    setSelectedExpenseId(expenseId)
    setCurrentPage('expense-detail')
  }

  const handleExpenseUpdated = useCallback(async (expenseId: string) => {
    const [didRefresh] = await Promise.all([refresh(), commonFund.refresh()])

    if (!didRefresh) {
      throw new ExpenseServiceError('No hemos podido actualizar el gasto.')
    }

    setSelectedExpenseId(expenseId)
    setExpenseNotice('Gasto actualizado')
    setCurrentPage('expense-detail')
  }, [commonFund, refresh])

  const handleExpenseDeleted = useCallback(async (expenseId: string) => {
    await deleteExpense(expenseId)
    await Promise.all([refresh(), commonFund.refresh()])
    setExpenseNotice(null)
    setSelectedExpenseId(null)
    setCurrentPage('expenses')
  }, [commonFund, refresh])

  const openSettlement = (settlementId: string) => {
    setSettlementNotice(null)
    setSelectedSettlementId(settlementId)
    setCurrentPage('settlement-detail')
  }

  const handleSettlementCreated = useCallback(async () => {
    await refresh()
    setSettlementDialog(null)
    setSettlementNotice('Cuentas actualizadas')
    setCurrentPage('home')
  }, [refresh])

  const handleSettlementUpdated = useCallback(async (settlementId: string) => {
    await refresh()
    setSettlementDialog(null)
    setSelectedSettlementId(settlementId)
    setSettlementNotice('Liquidación actualizada')
    setCurrentPage('settlement-detail')
  }, [refresh])

  const handleSettlementDeleted = useCallback(async (settlementId: string) => {
    await deleteSettlement(settlementId)
    await refresh()
    setSettlementNotice(null)
    setSelectedSettlementId(null)
    setCurrentPage('settlements')
  }, [refresh])

  let pageContent

  if (currentPage === 'home') {
    pageContent = (
      <HomePage
        displayName={displayName}
        householdName={householdName}
        commonExpensesStartDate={commonExpensesStartDate}
        accountingMonthStartDay={accountingMonthStartDay}
        currentUserId={currentUserId}
        expenses={expenses}
        members={members}
        settlements={settlements}
        commonFund={commonFund}
        loading={loading}
        error={error}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        onRetry={() => void refresh()}
        onRetryCommonFund={() => void commonFund.retry()}
        onTopUpFund={() => goToCommonFund('top-up')}
        onViewFund={() => goToCommonFund()}
        onSelectExpense={openExpense}
        onViewAllExpenses={goToExpenses}
        onViewStatistics={goToStatistics}
        onViewPersonalStatistics={goToPersonalStatistics}
        onCommonExpensesStartDateChange={onCommonExpensesStartDateChange}
        onSettleAccounts={(direction) => {
          setSettlementNotice(null)
          setSettlementDialog({ mode: 'create', direction })
        }}
        onSignOut={onSignOut}
        statusMessage={settlementNotice}
      />
    )
  } else if (currentPage === 'expenses') {
    pageContent = (
      <ExpensesPage
        key={expensesPageKey}
        expenses={expenses}
        currentUserId={currentUserId}
        accountingMonthStartDay={accountingMonthStartDay}
        members={members}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        onSelectExpense={openExpense}
        statisticsFilter={statisticsExpenseFilter}
      />
    )
  } else if (currentPage === 'add-expense') {
    pageContent = (
      <AddExpensePage
        householdId={householdId}
        currentUserId={currentUserId}
        accountingMonthStartDay={accountingMonthStartDay}
        commonFundBalance={commonFund.balance}
        commonFundEnabled={Boolean(commonFund.settings?.enabled)}
        commonFundLoading={commonFund.loading}
        onOpenCommonFund={() => goToCommonFund('top-up')}
        onBack={goHome}
        onCreated={handleExpenseCreated}
      />
    )
  } else if (currentPage === 'common-fund') {
    pageContent = (
      <CommonFundPage
        householdId={householdId}
        {...commonFund}
        initialDialog={commonFundInitialDialog}
        onBack={goHome}
        onRefresh={commonFund.refresh}
        onRetry={commonFund.retry}
      />
    )
  } else if (currentPage === 'settings') {
    pageContent = (
      <SettingsPage
        householdId={householdId}
        householdName={householdName}
        accountingMonthStartDay={accountingMonthStartDay}
        displayName={displayName}
        email={email}
        role={role}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        onAccountingMonthStartDayChange={onAccountingMonthStartDayChange}
        onSignOut={onSignOut}
        onViewSettlements={goToSettlements}
      />
    )
  } else if (currentPage === 'statistics') {
    pageContent = (
      <Suspense
        fallback={(
          <div className="statistics-page">
            <ExpenseDataState
              loading
              title="Abriendo estadísticas"
              message="Estamos preparando el análisis del hogar…"
            />
          </div>
        )}
      >
        <StatisticsPage
          commonExpenses={commonExpenses}
          personalExpenses={myPersonalExpenses}
          currentUserId={currentUserId}
          accountingMonthStartDay={accountingMonthStartDay}
          members={members}
          settlements={settlements}
          loading={loading}
          error={error}
          initialScope={statisticsInitialScope}
          onRetry={() => void refresh()}
          onSelectCategory={(filter) => {
            setStatisticsExpenseFilter(filter)
            setSelectedExpenseId(null)
            setCurrentPage('expenses')
          }}
        />
      </Suspense>
    )
  } else if (currentPage === 'settlements') {
    pageContent = (
      <SettlementsPage
        settlements={settlements}
        members={members}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        onBack={goToSettings}
        onSelectSettlement={openSettlement}
      />
    )
  } else if (currentPage === 'settlement-detail' && selectedSettlement) {
    pageContent = (
      <SettlementDetailPage
        settlement={selectedSettlement}
        members={members}
        statusMessage={settlementNotice}
        onBack={goToSettlements}
        onEdit={() => {
          setSettlementNotice(null)
          setSettlementDialog({ mode: 'edit', settlementId: selectedSettlement.id })
        }}
        onDelete={handleSettlementDeleted}
      />
    )
  } else if (currentPage === 'expense-detail' && selectedExpense) {
    pageContent = (
      <ExpenseDetailPage
        householdId={householdId}
        expense={selectedExpense}
        currentUserId={currentUserId}
        accountingMonthStartDay={accountingMonthStartDay}
        commonFundBalance={commonFund.balance}
        commonFundEnabled={Boolean(commonFund.settings?.enabled)}
        commonFundLoading={commonFund.loading}
        onBack={goToExpenses}
        onUpdated={handleExpenseUpdated}
        onDelete={handleExpenseDeleted}
        statusMessage={expenseNotice}
      />
    )
  } else if (currentPage === 'settlement-detail') {
    pageContent = (
      <SettlementsPage
        settlements={settlements}
        members={members}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        onBack={goToSettings}
        onSelectSettlement={openSettlement}
      />
    )
  } else {
    pageContent = (
      <ExpensesPage
        key={expensesPageKey}
        currentUserId={currentUserId}
        accountingMonthStartDay={accountingMonthStartDay}
        expenses={expenses}
        members={members}
        loading={loading}
        error={error}
        onRetry={() => void refresh()}
        onSelectExpense={openExpense}
        statisticsFilter={statisticsExpenseFilter}
      />
    )
  }

  const settlementBeingEdited =
    settlementDialog?.mode === 'edit'
      ? settlements.find((settlement) => settlement.id === settlementDialog.settlementId)
      : undefined

  return (
    <>
      <AppShell
        currentPage={currentPage}
        onAddExpense={() => {
          setSelectedExpenseId(null)
          setCurrentPage('add-expense')
        }}
        onGoExpenses={goToExpenses}
        onGoHome={goHome}
        onGoStatistics={goToStatistics}
        onGoSettings={goToSettings}
      >
        {pageContent}
      </AppShell>

      {settlementDialog && (settlementDialog.mode === 'create' || settlementBeingEdited) && (
        <SettlementDialog
          householdId={householdId}
          members={members}
          direction={
            settlementDialog.mode === 'create' ? settlementDialog.direction : undefined
          }
          initialSettlement={settlementBeingEdited}
          onCancel={() => setSettlementDialog(null)}
          onSaved={
            settlementDialog.mode === 'create'
              ? handleSettlementCreated
              : handleSettlementUpdated
          }
        />
      )}
    </>
  )
}

export default App
