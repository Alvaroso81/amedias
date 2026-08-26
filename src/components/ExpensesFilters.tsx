import type { ExpenseFilters } from '../types/expenseFilters'
import type { ExpenseReadCategory, ExpenseReadMember } from '../types/expenseRead'

type ExpensesFiltersProps = {
  filters: ExpenseFilters
  members: ExpenseReadMember[]
  categories: ExpenseReadCategory[]
  onApply: () => void
  onChange: (filters: ExpenseFilters) => void
  onClear: () => void
}

export function ExpensesFilters({
  filters,
  members,
  categories,
  onApply,
  onChange,
  onClear,
}: ExpensesFiltersProps) {
  return (
    <section className="card filters-panel" id="expenses-filters" aria-label="Filtros de gastos">
      <fieldset className="filter-group">
        <legend>Pagado por</legend>
        <div className="segmented-control filters-segmented filters-segmented--three">
          {['all', ...members.map((member) => member.userId)].map((payer) => (
            <button
              className={
                filters.paidBy === payer ? 'segment-button segment-button--active' : 'segment-button'
              }
              type="button"
              aria-pressed={filters.paidBy === payer}
              key={payer}
              onClick={() => onChange({ ...filters, paidBy: payer })}
            >
              {payer === 'all'
                ? 'Todos'
                : members.find((member) => member.userId === payer)?.displayName ?? 'Miembro'}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="filter-divider" />

      <div className="filter-group">
        <label htmlFor="filter-category">Categoría</label>
        <div className="select-wrap filter-select">
          <select
            id="filter-category"
            value={filters.category}
            onChange={(event) => onChange({ ...filters, category: event.target.value })}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option value={category.id ?? ''} key={category.id ?? category.name}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="filter-divider" />

      <fieldset className="filter-group">
        <legend>Tipo</legend>
        <div className="segmented-control filters-segmented filters-segmented--three">
          {(['all', 'common', 'personal'] as const).map((expenseType) => (
            <button
              className={
                filters.expenseType === expenseType
                  ? 'segment-button segment-button--active'
                  : 'segment-button'
              }
              type="button"
              aria-pressed={filters.expenseType === expenseType}
              key={expenseType}
              onClick={() => onChange({ ...filters, expenseType })}
            >
              {expenseType === 'all' ? 'Todos' : expenseType === 'common' ? 'Común' : 'Personal'}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="filter-actions">
        <button className="clear-filters-button" type="button" onClick={onClear}>
          Limpiar
        </button>
        <button className="apply-filters-button" type="button" onClick={onApply}>
          Aplicar filtros
        </button>
      </div>
    </section>
  )
}
