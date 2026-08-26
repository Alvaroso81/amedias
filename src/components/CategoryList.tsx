import type { CategoryExpense } from '../types/finance'
import { formatWholeCurrency } from '../utils/formatCurrency'

type CategoryListProps = {
  categories: CategoryExpense[]
}

export function CategoryList({ categories }: CategoryListProps) {
  const highestAmount = Math.max(...categories.map(({ amount }) => amount))

  return (
    <section className="section-block" aria-labelledby="categories-title">
      <div className="section-heading">
        <h2 id="categories-title">Gastos por categoría</h2>
        <button className="text-button" type="button">
          Ver estadísticas
        </button>
      </div>

      <div className="card category-card">
        <ul className="category-list">
          {categories.map((category) => (
            <li className="category-item" key={category.name}>
              <span className="category-icon" aria-hidden="true">
                {category.icon}
              </span>
              <div className="category-info">
                <div className="category-copy">
                  <span>{category.name}</span>
                  <strong>{formatWholeCurrency(category.amount)}</strong>
                </div>
                <div className="category-progress" aria-hidden="true">
                  <span style={{ width: `${(category.amount / highestAmount) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
