import { useMemo, useState } from 'react'
import { ExpenseDataState } from '../components/ExpenseDataState'
import { ExpenseHistoryList } from '../components/ExpenseHistoryList'
import { ExpensesFilters } from '../components/ExpensesFilters'
import {
  emptyExpenseFilters,
  type ExpenseFilters,
  type StatisticsExpenseFilter,
} from '../types/expenseFilters'
import type { ExpenseReadMember, ExpenseRecord } from '../types/expenseRead'
import { calculateAccountingMonth } from '../utils/accountingMonth'
import { formatCurrency } from '../utils/formatCurrency'
import { formatMonthYear, getMonthKey, getTodayIsoDate } from '../utils/formatDate'

type ExpensesPageProps = {
  expenses: ExpenseRecord[]
  currentUserId: string
  accountingMonthStartDay: number
  members: ExpenseReadMember[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelectExpense: (expenseId: string) => void
  statisticsFilter?: StatisticsExpenseFilter | null
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .trim()
}

export function ExpensesPage({
  expenses,
  currentUserId,
  accountingMonthStartDay,
  members,
  loading,
  error,
  onRetry,
  onSelectExpense,
  statisticsFilter,
}: ExpensesPageProps) {
  const currentAccountingDate = useMemo(() => {
    const accountingMonth = calculateAccountingMonth(
      getTodayIsoDate(),
      accountingMonthStartDay,
    )
    return new Date(`${accountingMonth}T12:00:00`)
  }, [accountingMonthStartDay])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (statisticsFilter) return new Date(`${statisticsFilter.anchorDate}T12:00:00`)
    return currentAccountingDate
  })
  const [periodMode, setPeriodMode] = useState<'month' | 'year' | 'history'>(
    statisticsFilter?.periodMode ?? 'month',
  )
  const [showStatisticsContext, setShowStatisticsContext] = useState(Boolean(statisticsFilter))
  const [search, setSearch] = useState('')
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const initialCategoryFilter = statisticsFilter
    ? (statisticsFilter.categoryId ?? `name:${statisticsFilter.categoryName}`)
    : ''
  const [draftFilters, setDraftFilters] = useState<ExpenseFilters>({
    ...emptyExpenseFilters,
    category: initialCategoryFilter,
    expenseType: statisticsFilter?.scope ?? 'all',
  })
  const [appliedFilters, setAppliedFilters] = useState<ExpenseFilters>({
    ...emptyExpenseFilters,
    category: initialCategoryFilter,
    expenseType: statisticsFilter?.scope ?? 'all',
  })
  const selectedMonthKey = getMonthKey(selectedMonth)

  const periodExpenses = useMemo(
    () =>
      expenses.filter((expense) => {
        if (periodMode === 'history') return true
        if (periodMode === 'year') {
          return expense.accountingMonth.startsWith(String(selectedMonth.getFullYear()))
        }
        return expense.accountingMonth.startsWith(selectedMonthKey)
      }),
    [expenses, periodMode, selectedMonth, selectedMonthKey],
  )
  const categories = useMemo(() => {
    const uniqueCategories = new Map(
      expenses.map((expense) => [expense.category.id ?? expense.category.name, expense.category]),
    )
    return [...uniqueCategories.values()].sort((first, second) =>
      first.name.localeCompare(second.name, 'es-ES'),
    )
  }, [expenses])

  const filteredExpenses = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search)

    return periodExpenses.filter((expense) => {
      const searchableExpense = normalizeSearchValue(
        `${expense.description} ${expense.category.name} ${expense.paymentSource === 'common_fund' ? 'Fondo común' : ''} ${expense.payments
          .map((payment) => payment.displayName)
          .join(' ')}`,
      )
      const matchesSearch = !normalizedSearch || searchableExpense.includes(normalizedSearch)
      const matchesPayer =
        appliedFilters.paidBy === 'all' ||
        expense.payments.some((payment) => payment.userId === appliedFilters.paidBy)
      const matchesCategory =
        !appliedFilters.category ||
        (appliedFilters.category.startsWith('name:')
          ? expense.category.name === appliedFilters.category.slice(5)
          : expense.categoryId === appliedFilters.category)
      const matchesType =
        appliedFilters.expenseType === 'all' ||
        (appliedFilters.expenseType === 'common'
          ? expense.expenseType === 'common'
          : expense.expenseType === 'personal' &&
            expense.personalOwnerId === currentUserId)

      return matchesSearch && matchesPayer && matchesCategory && matchesType
    })
  }, [appliedFilters, currentUserId, periodExpenses, search])

  const total = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const activeFilterCount = [
    appliedFilters.paidBy !== 'all',
    Boolean(appliedFilters.category),
    appliedFilters.expenseType !== 'all',
  ].filter(Boolean).length

  const clearFilters = () => {
    setDraftFilters(emptyExpenseFilters)
    setAppliedFilters(emptyExpenseFilters)
  }

  const changeMonth = (offset: number) => {
    setSelectedMonth(
      (currentMonth) =>
        periodMode === 'year'
          ? new Date(currentMonth.getFullYear() + offset, currentMonth.getMonth(), 1)
          : new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1),
    )
  }

  const periodLabel =
    periodMode === 'history'
      ? 'Histórico'
      : periodMode === 'year'
        ? String(selectedMonth.getFullYear())
        : formatMonthYear(selectedMonth)

  return (
    <div className="expenses-page">
      <header className="expenses-page-header">
        <h1>Gastos</h1>
        <div
          className={`month-selector${periodMode === 'history' ? ' month-selector--history' : ''}`}
          aria-label="Seleccionar periodo"
        >
          {periodMode !== 'history' && (
            <button type="button" aria-label="Periodo anterior" onClick={() => changeMonth(-1)}>
              ‹
            </button>
          )}
          <strong>{periodLabel}</strong>
          {periodMode !== 'history' && (
            <button type="button" aria-label="Periodo siguiente" onClick={() => changeMonth(1)}>
              ›
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <ExpenseDataState
          loading
          title="Cargando gastos"
          message="Estamos recuperando los movimientos del hogar…"
        />
      ) : error ? (
        <ExpenseDataState
          title="No hemos podido cargar los gastos"
          message={error}
          onRetry={onRetry}
        />
      ) : expenses.length === 0 ? (
        <ExpenseDataState
          title="Aún no hay gastos"
          message="Pulsa + para registrar el primero."
        />
      ) : (
        <>
          <section className="card period-summary-card" aria-labelledby="period-total-title">
            <p id="period-total-title">Total del periodo</p>
            <strong>{formatCurrency(total)}</strong>
            <span>{periodExpenses.length} movimientos</span>
          </section>

          {statisticsFilter && showStatisticsContext && (
            <div className="statistics-filter-context" role="status">
              <span>
                Vista desde Estadísticas · {statisticsFilter.categoryName} · {periodLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(currentAccountingDate)
                  setPeriodMode('month')
                  setShowStatisticsContext(false)
                  clearFilters()
                }}
              >
                Quitar filtro
              </button>
            </div>
          )}

          <div className="expenses-tools">
            <div className="expense-search-field">
              <label htmlFor="expense-search">Buscar gastos</label>
              <div className="expense-search-input">
                <span aria-hidden="true">⌕</span>
                <input
                  id="expense-search"
                  type="search"
                  value={search}
                  placeholder="Mercadona, gasolina, restaurante..."
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <button
              className={`filters-toggle${activeFilterCount ? ' filters-toggle--active' : ''}`}
              type="button"
              aria-expanded={isFiltersOpen}
              aria-controls="expenses-filters"
              onClick={() => setIsFiltersOpen((isOpen) => !isOpen)}
            >
              <span aria-hidden="true">≡</span>
              Filtros
              {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            </button>
          </div>

          {isFiltersOpen && (
            <ExpensesFilters
              filters={draftFilters}
              members={members}
              categories={categories}
              onChange={setDraftFilters}
              onClear={clearFilters}
              onApply={() => {
                setAppliedFilters(draftFilters)
                setIsFiltersOpen(false)
              }}
            />
          )}

          <div className="expenses-results-summary" aria-live="polite">
            <span>{filteredExpenses.length} gastos mostrados</span>
            {(search || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  clearFilters()
                }}
              >
                Limpiar búsqueda
              </button>
            )}
          </div>

          <ExpenseHistoryList
            expenses={filteredExpenses}
            emptyTitle={periodExpenses.length ? 'No hay gastos' : 'Aún no hay gastos este mes'}
            emptyMessage={
              periodExpenses.length
                ? 'Prueba con otra búsqueda o limpia los filtros.'
                : 'Selecciona otro mes o pulsa + para registrar uno.'
            }
            onSelectExpense={onSelectExpense}
          />
        </>
      )}
    </div>
  )
}
