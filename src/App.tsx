import type { User } from '@supabase/supabase-js'
import './savings.css'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { AddActionDialog } from './components/AddActionDialog'
import { SavingsGoalForm } from './components/SavingsGoalForm'
import { SavingsPage } from './pages/SavingsPage'
import { SavingsDetailPage } from './pages/SavingsDetailPage'
import { useSavings } from './hooks/useSavings'
import { AppStatusScreen } from './components/AppStatusScreen'
import { ExpenseDataState } from './components/ExpenseDataState'
import { PendingInviteGate } from './components/PendingInviteGate'
import { SettlementDialog } from './components/SettlementDialog'
import { useAuth } from './hooks/useAuth'
import { useCommonFund } from './hooks/useCommonFund'
import { useExpenses } from './hooks/useExpenses'
import { useHousehold } from './hooks/useHousehold'
import { useRecurringExpenses } from './hooks/useRecurringExpenses'
import { AddExpensePage } from './pages/AddExpensePage'
import { AuthPage } from './pages/AuthPage'
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage'
import { CommonFundPage } from './pages/CommonFundPage'
import { ExpenseDetailPage } from './pages/ExpenseDetailPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { HomePage } from './pages/HomePage'
import { HouseholdOnboardingPage } from './pages/HouseholdOnboardingPage'
import { SettingsPage } from './pages/SettingsPage'
import { RecurringExpensesPage } from './pages/RecurringExpensesPage'
import { SettlementDetailPage } from './pages/SettlementDetailPage'
import { SettlementsPage } from './pages/SettlementsPage'
import { deleteExpense, ExpenseServiceError } from './services/expenses'
import { deleteSettlement } from './services/settlements'
import { supabase } from './services/supabase'
import { confirmRecurringOccurrence } from './services/recurringExpenses'
import type { ExpenseCreationDraft } from './types/expenseCreation'
import type { HouseholdRole } from './types/household'
import { NavigationContext, useNavigation } from './navigation/useNavigation'
import { NavigationBackButton } from './components/NavigationBackButton'
import { CategorySettings } from './components/CategorySettings'
import type { SettlementDirection } from './types/settlement'
import type { RecurringExpenseOccurrence } from './types/recurringExpenses'
import { capturePendingInviteToken, clearPendingInviteToken } from './utils/pendingInvite'

const StatisticsPage = lazy(() =>
  import('./pages/StatisticsPage').then((module) => ({ default: module.StatisticsPage })),
)

function App() {
  const { user, loading, error, isPasswordRecovery, recoveryInvalid, finishPasswordRecovery } = useAuth()
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

  if (isPasswordRecovery) {
    return <PasswordRecoveryPage email={user?.email ?? null}
      validSession={Boolean(user) && !recoveryInvalid && !error}
      sessionError={error} onFinish={finishPasswordRecovery} />
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
        key={`${household.id}:${user.id}`}
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
  const recurring = useRecurringExpenses(householdId)
  const savings = useSavings(householdId, currentUserId)
  const [isAddActionOpen, setIsAddActionOpen] = useState(false)
  const closeAddAction = useCallback(() => setIsAddActionOpen(false), [])
  const navigationContext = useNavigation()
  const { navigation, entry } = navigationContext
  const { navigate } = navigation
  const goBack = useCallback(() => {
    // A delayed save must not navigate away from a newer screen.
    if (navigation.getSnapshot().id === entry.id) navigation.goBack()
  }, [navigation, entry.id])
  const currentPage = entry.page
  const [expenseNotice, setExpenseNotice] = useState<string | null>(null)
  const [settlementNotice, setSettlementNotice] = useState<string | null>(null)
  const [settlementDialog, setSettlementDialog] = useState<SettlementDialogState | null>(null)
  const selectedExpense = expenses.find((expense) => expense.id === entry.params.expenseId)
  const selectedSettlement = settlements.find((settlement) => settlement.id === entry.params.settlementId)
  const selectedOccurrence = recurring.pendingOccurrences.find((occurrence) => occurrence.id === entry.params.occurrenceId)
  const statisticsExpenseFilter = entry.params.statisticsFilter ?? null

  useEffect(() => navigation.subscribe(() => {
    closeAddAction()
    setSettlementDialog(null)
  }), [navigation, closeAddAction])

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

  const goHome = () => navigate('home', {}, { root: true })
  const goToExpenses = () => navigate('expenses')
  const goToStatistics = () => navigate('statistics')
  const goToPersonalStatistics = () => navigate('statistics', { statisticsScope: 'personal' })
  const goToSettings = () => navigate('settings', {}, { root: true })
  const goToRecurringExpenses = (templateId?: string) =>
    navigate('recurring-expenses', templateId ? { templateId, recurringMode: 'edit' } : {})
  const goToCommonFund = (commonFundDialog?: 'top-up') => navigate('common-fund', { commonFundDialog })
  const goToSettlements = () => navigate('settlements')

  const handleExpenseCreated = useCallback(async () => {
    await Promise.all([refresh(), commonFund.refresh()])
    goBack()
  }, [commonFund, refresh, goBack])

  const handleRecurringExpenseCreated = useCallback(async () => {
    await Promise.all([refresh(), commonFund.refresh(), recurring.refresh()])
    goBack()
  }, [commonFund, recurring, refresh, goBack])

  const refreshRecurringManagement = useCallback(async () => {
    await Promise.all([recurring.refresh(), refresh()])
  }, [recurring, refresh])

  const reviewOccurrence = (occurrence: RecurringExpenseOccurrence) =>
    navigate('recurring-occurrence', { occurrenceId: occurrence.id })

  const openExpense = (expenseId: string) => {
    setExpenseNotice(null)
    navigate('expense-detail', { expenseId })
  }

  const handleExpenseUpdated = useCallback(async () => {
    const [didRefresh] = await Promise.all([refresh(), commonFund.refresh()])
    if (!didRefresh) throw new ExpenseServiceError('No hemos podido actualizar el gasto.')
    setExpenseNotice('Gasto actualizado')
  }, [commonFund, refresh])

  const handleExpenseDeleted = useCallback(async (expenseId: string) => {
    await deleteExpense(expenseId)
    await Promise.all([refresh(), commonFund.refresh()])
    setExpenseNotice(null)
    goBack()
  }, [commonFund, refresh, goBack])

  const openSettlement = (settlementId: string) => {
    setSettlementNotice(null)
    navigate('settlement-detail', { settlementId })
  }

  const handleSettlementCreated = useCallback(async () => {
    await refresh()
    setSettlementDialog(null)
    setSettlementNotice('Cuentas actualizadas')
  }, [refresh])

  const handleSettlementUpdated = useCallback(async () => {
    await refresh()
    setSettlementDialog(null)
    setSettlementNotice('Liquidación actualizada')
  }, [refresh])

  const handleSettlementDeleted = useCallback(async (settlementId: string) => {
    await deleteSettlement(settlementId)
    await refresh()
    setSettlementNotice(null)
    goBack()
  }, [refresh, goBack])

  let pageContent

  const goToSavings = () => navigate('savings')
  const openSavings = (id: string) => {
    navigate('savings-detail', { savingsId: id })
  }
  const selectedSavings = savings.goals.find(goal => goal.id === entry.params.savingsId)

  if (currentPage === 'savings') {
    pageContent = <SavingsPage goals={savings.goals} loading={savings.loading} error={savings.error}
      onRetry={() => void savings.refresh()} onBack={goBack}
      onCreate={() => navigate('add-savings')} onOpen={openSavings} />
  } else if (currentPage === 'add-savings') {
    pageContent = savings.loading || savings.error ? (
      <div><NavigationBackButton />
        <ExpenseDataState loading={savings.loading} title="Nuevo ahorro" message={savings.error ?? 'Cargando miembros del hogar…'}
          onRetry={savings.error ? () => void savings.refresh() : undefined} />
      </div>
    ) : <SavingsGoalForm householdId={householdId} currentUserId={currentUserId} members={savings.members}
      onBack={goBack} onSaved={async id => {
        await savings.refresh()
        if (navigation.getSnapshot().id === entry.id) navigate('savings-detail', { savingsId: id }, { replace: true })
      }} />
  } else if (currentPage === 'savings-detail') {
    pageContent = selectedSavings && !savings.error ? (
      <SavingsDetailPage key={selectedSavings.id} goal={selectedSavings} householdId={householdId}
        currentUserId={currentUserId} members={savings.members} onBack={goBack} onChanged={savings.refresh}
        mode={entry.params.savingsMode ?? 'detail'}
        onOpenMode={(savingsMode) => navigate('savings-detail', { savingsId: selectedSavings.id, savingsMode })} />
    ) : <div><NavigationBackButton />
      <ExpenseDataState loading={savings.loading} title="Ahorro no disponible"
        message={savings.error ?? 'Vuelve a la pantalla anterior para consultar tus objetivos.'}
        onRetry={() => void savings.refresh()} />
    </div>
  } else if (currentPage === 'home') {
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
        pendingRecurringOccurrences={recurring.pendingOccurrences}
        savings={savings}
        onViewSavings={goToSavings}
        onViewRecurringExpenses={() => goToRecurringExpenses()}
      />
    )
  } else if (currentPage === 'expenses') {
    pageContent = (
      <ExpensesPage
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
        onBack={goBack}
        onCreated={handleExpenseCreated}
      />
    )
  } else if (currentPage === 'common-fund') {
    pageContent = (
      <CommonFundPage
        householdId={householdId}
        {...commonFund}
        initialDialog={entry.params.commonFundDialog}
        onBack={goBack}
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
        onViewCategories={() => navigate('categories')}
        onViewSettlements={goToSettlements}
        onViewSavings={goToSavings}
        onViewRecurringExpenses={() => goToRecurringExpenses()}
      />
    )
  } else if (currentPage === 'categories') {
    pageContent = <div className="settings-page">
      <header className="add-expense-header"><NavigationBackButton /><h1>Categorías</h1></header>
      <CategorySettings householdId={householdId} onCategoriesChanged={refresh} />
    </div>
  } else if (currentPage === 'recurring-expenses') {
    pageContent = (
      <RecurringExpensesPage
        householdId={householdId}
        currentUserId={currentUserId}
        recurringExpenses={recurring.recurringExpenses}
        pendingOccurrences={recurring.pendingOccurrences}
        commonFundEnabled={Boolean(commonFund.settings?.enabled)}
        loading={recurring.loading}
        error={recurring.error}
        onBack={goBack}
        onRetry={() => void recurring.refresh()}
        onChanged={refreshRecurringManagement}
        onReviewOccurrence={reviewOccurrence}
        initialTemplateId={entry.params.templateId ?? null}
        mode={entry.params.recurringMode ?? 'closed'}
        onCreateTemplate={() => navigate('recurring-expenses', { recurringMode: 'create' })}
        onEditTemplate={(templateId) => navigate('recurring-expenses', { recurringMode: 'edit', templateId })}
        onCloseTemplate={goBack}
      />
    )
  } else if (currentPage === 'recurring-occurrence' && selectedOccurrence) {
    const initialDraft: ExpenseCreationDraft = {
      description: selectedOccurrence.proposedDescription,
      amount: selectedOccurrence.proposedAmountCents / 100,
      categoryId: selectedOccurrence.proposedCategoryId,
      expenseDate: selectedOccurrence.dueDate,
      expenseType: selectedOccurrence.proposedExpenseType,
      note: selectedOccurrence.proposedNote,
      paymentSource: selectedOccurrence.proposedPaymentSource,
      paidByUserId: selectedOccurrence.proposedPayerUserId,
      splitPercentages: Object.fromEntries(
        selectedOccurrence.proposedSplitConfig.map((split) => [split.userId, split.sharePercent]),
      ),
    }
    pageContent = (
      <AddExpensePage
        householdId={householdId}
        currentUserId={currentUserId}
        accountingMonthStartDay={accountingMonthStartDay}
        commonFundBalance={commonFund.balance}
        commonFundEnabled={Boolean(commonFund.settings?.enabled)}
        commonFundLoading={commonFund.loading}
        initialDraft={initialDraft}
        fixedExpenseType
        useAutomaticAccountingMonth
        title="Revisar gasto"
        createAction={(expense) => confirmRecurringOccurrence({ occurrenceId: selectedOccurrence.id, expense })}
        onOpenCommonFund={() => goToCommonFund('top-up')}
        onBack={goBack}
        onCreated={handleRecurringExpenseCreated}
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
          initialScope={entry.params.statisticsScope ?? 'common'}
          onRetry={() => void refresh()}
          onSelectCategory={(filter) => {
            navigate('expenses', { statisticsFilter: filter })
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
        onBack={goBack}
        onSelectSettlement={openSettlement}
      />
    )
  } else if (currentPage === 'settlement-detail' && selectedSettlement) {
    pageContent = (
      <SettlementDetailPage
        settlement={selectedSettlement}
        members={members}
        statusMessage={settlementNotice}
        onBack={goBack}
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
        onBack={goBack}
        onUpdated={handleExpenseUpdated}
        onDelete={handleExpenseDeleted}
        statusMessage={expenseNotice}
        onManageRecurringExpense={(recurringExpenseId) => goToRecurringExpenses(recurringExpenseId)}
      />
    )
  } else {
    pageContent = <div>
      <NavigationBackButton />
      <ExpenseDataState loading={loading || savings.loading || recurring.loading}
        title="Detalle no disponible" message="El movimiento ya no está disponible. Vuelve a la pantalla anterior."
        onRetry={() => void refresh()} />
    </div>
  }

  const settlementBeingEdited =
    settlementDialog?.mode === 'edit'
      ? settlements.find((settlement) => settlement.id === settlementDialog.settlementId)
      : undefined

  return (
    <NavigationContext.Provider value={navigationContext}>
      <AppShell
        currentPage={currentPage}
        onAdd={() => setIsAddActionOpen(true)}
        onGoExpenses={() => navigate('expenses', {}, { root: true })}
        onGoHome={goHome}
        onGoStatistics={() => navigate('statistics', {}, { root: true })}
        onGoSettings={goToSettings}
      >
        <div key={entry.id}>{pageContent}</div>
      </AppShell>

      {isAddActionOpen && <AddActionDialog onCancel={closeAddAction}
        onExpense={() => { closeAddAction(); navigate('add-expense') }}
        onSavings={() => { closeAddAction(); navigate('add-savings') }} />}

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
    </NavigationContext.Provider>
  )
}

export default App
