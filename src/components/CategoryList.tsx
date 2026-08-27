import type { CategoryExpense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'

type CategoryListProps = {
  categories: CategoryExpense[]
  onViewStatistics: () => void
}

export function CategoryList({ categories, onViewStatistics }: CategoryListProps) {
  const highestAmount = Math.max(0, ...categories.map(({ amount }) => amount))

  return (
    <section className="section-block" aria-labelledby="categories-title">
      <div className="section-heading">
        <h2 id="categories-title">Gastos por categoría</h2>
        <button className="text-button" type="button" onClick={onViewStatistics}>
          Ver estadísticas
        </button>
      </div>

      <div className="card category-card">
        {categories.length ? (
          <ul className="category-list">
            {categories.map((category) => (
            <li className="category-item" key={category.name}>
              <span className="category-icon" aria-hidden="true">
                {category.icon}
              </span>
              <div className="category-info">
                <div className="category-copy">
                  <span>{category.name}</span>
                  <strong>{formatCurrency(category.amount)}</strong>
                </div>
                <div className="category-progress" aria-hidden="true">
                  <span
                    style={{
                      width: `${highestAmount ? (category.amount / highestAmount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </li>
            ))}
          </ul>
        ) : (
          <p className="section-empty-copy">No hay gastos por categoría este mes.</p>
        )}
      </div>
    </section>
  )
}
