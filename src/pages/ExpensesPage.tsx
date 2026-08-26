import { useMemo, useState } from 'react'
import { ExpenseHistoryList } from '../components/ExpenseHistoryList'
import { ExpensesFilters } from '../components/ExpensesFilters'
import { emptyExpenseFilters, type ExpenseFilters } from '../types/expenseFilters'
import type { Expense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'

type ExpensesPageProps = {
  expenses: Expense[]
  onSelectExpense: (expenseId: string) => void
}

const initialMovementCount = 47
const initialVisibleExpenseCount = 15

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .trim()
}

export function ExpensesPage({ expenses, onSelectExpense }: ExpensesPageProps) {
  const [search, setSearch] = useState('')
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<ExpenseFilters>(emptyExpenseFilters)
  const [appliedFilters, setAppliedFilters] = useState<ExpenseFilters>(emptyExpenseFilters)

  const filteredExpenses = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search)

    return [...expenses]
      .filter((expense) => {
        const searchableExpense = normalizeSearchValue(
          `${expense.description} ${expense.category} ${expense.paidBy}`,
        )
        const matchesSearch = !normalizedSearch || searchableExpense.includes(normalizedSearch)
        const matchesPayer =
          appliedFilters.paidBy === 'all' || expense.paidBy === appliedFilters.paidBy
        const matchesCategory =
          !appliedFilters.category || expense.category === appliedFilters.category
        const matchesType =
          appliedFilters.expenseType === 'all' ||
          expense.expenseType === appliedFilters.expenseType

        return matchesSearch && matchesPayer && matchesCategory && matchesType
      })
      .sort((firstExpense, secondExpense) => {
        const dateComparison = secondExpense.date.localeCompare(firstExpense.date)
        return dateComparison || secondExpense.createdAt.localeCompare(firstExpense.createdAt)
      })
  }, [appliedFilters, expenses, search])

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const movementCount = initialMovementCount + expenses.length - initialVisibleExpenseCount
  const activeFilterCount = [
    appliedFilters.paidBy !== 'all',
    Boolean(appliedFilters.category),
    appliedFilters.expenseType !== 'all',
  ].filter(Boolean).length

  const clearFilters = () => {
    setDraftFilters(emptyExpenseFilters)
    setAppliedFilters(emptyExpenseFilters)
  }

  return (
    <div className="expenses-page">
      <header className="expenses-page-header">
        <h1>Gastos</h1>
        <div className="month-selector" aria-label="Seleccionar mes">
          <button type="button" aria-label="Mes anterior">
            ‹
          </button>
          <strong>Agosto 2026</strong>
          <button type="button" aria-label="Mes siguiente">
            ›
          </button>
        </div>
      </header>

      <section className="card period-summary-card" aria-labelledby="period-total-title">
        <p id="period-total-title">Total del mes</p>
        <strong>{formatCurrency(total)}</strong>
        <span>{movementCount} movimientos</span>
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
              placeholder="Mercadona, Zara, restaurante..."
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

      <ExpenseHistoryList expenses={filteredExpenses} onSelectExpense={onSelectExpense} />
    </div>
  )
}
