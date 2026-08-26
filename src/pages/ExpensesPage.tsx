import { useMemo, useState } from 'react'
import { ExpenseDataState } from '../components/ExpenseDataState'
import { ExpenseHistoryList } from '../components/ExpenseHistoryList'
import { ExpensesFilters } from '../components/ExpensesFilters'
import { emptyExpenseFilters, type ExpenseFilters } from '../types/expenseFilters'
import type { ExpenseReadMember, ExpenseRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatMonthYear, getMonthKey } from '../utils/formatDate'

type ExpensesPageProps = {
  expenses: ExpenseRecord[]
  members: ExpenseReadMember[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelectExpense: (expenseId: string) => void
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
  members,
  loading,
  error,
  onRetry,
  onSelectExpense,
}: ExpensesPageProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [search, setSearch] = useState('')
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<ExpenseFilters>(emptyExpenseFilters)
  const [appliedFilters, setAppliedFilters] = useState<ExpenseFilters>(emptyExpenseFilters)
  const selectedMonthKey = getMonthKey(selectedMonth)

  const periodExpenses = useMemo(
    () => expenses.filter((expense) => expense.expenseDate.startsWith(selectedMonthKey)),
    [expenses, selectedMonthKey],
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
        `${expense.description} ${expense.category.name} ${expense.payments
          .map((payment) => payment.displayName)
          .join(' ')}`,
      )
      const matchesSearch = !normalizedSearch || searchableExpense.includes(normalizedSearch)
      const matchesPayer =
        appliedFilters.paidBy === 'all' ||
        expense.payments.some((payment) => payment.userId === appliedFilters.paidBy)
      const matchesCategory =
        !appliedFilters.category || expense.categoryId === appliedFilters.category
      const matchesType =
        appliedFilters.expenseType === 'all' ||
        expense.expenseType === appliedFilters.expenseType

      return matchesSearch && matchesPayer && matchesCategory && matchesType
    })
  }, [appliedFilters, periodExpenses, search])

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
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1),
    )
  }

  return (
    <div className="expenses-page">
      <header className="expenses-page-header">
        <h1>Gastos</h1>
        <div className="month-selector" aria-label="Seleccionar mes">
          <button type="button" aria-label="Mes anterior" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <strong>{formatMonthYear(selectedMonth)}</strong>
          <button type="button" aria-label="Mes siguiente" onClick={() => changeMonth(1)}>
            ›
          </button>
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
            <p id="period-total-title">Total del mes</p>
            <strong>{formatCurrency(total)}</strong>
            <span>{periodExpenses.length} movimientos</span>
          </section>

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
