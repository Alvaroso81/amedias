import type { CategoryStatistic } from '../utils/statistics'
import { getCategoryColor, toCents, fromCents } from '../utils/statistics'
import { formatCurrency } from '../utils/formatCurrency'

type Props = {
  categories: CategoryStatistic[]
  selectedKey: string | null
  onSelect: (key: string) => void
  onViewExpenses: (category: CategoryStatistic) => void
}
const percentage = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

export function StatisticsCategoryChart({ categories, selectedKey, onSelect, onViewExpenses }: Props) {
  const selected = categories.find((category) => category.key === selectedKey)
  const total = fromCents(categories.reduce((sum, category) => sum + toCents(category.amount), 0))
  const segments: { category: CategoryStatistic; start: number }[] = []
  let offset = 0
  for (const category of categories) {
    segments.push({ category, start: offset })
    offset += category.percentage
  }
  return <section className="card statistics-section-card statistics-category-chart">
    <div className="statistics-section-heading"><div><span>Distribución del periodo</span><h2>Gastos por categoría</h2></div></div>
    <div className="statistics-donut-layout">
      <div className="statistics-donut">
        <svg viewBox="0 0 240 240" role="group" aria-label="Seleccionar una categoría del gráfico">
          {segments.map(({ category, start }) => {
            const active = category.key === selected?.key
            return <circle key={category.key} cx="120" cy="120" r="88" fill="none" pathLength="100"
              stroke={getCategoryColor(category.key)} strokeWidth={active ? 32 : 24}
              strokeDasharray={`${category.percentage} ${100 - category.percentage}`} strokeDashoffset={-start}
              transform="rotate(-90 120 120)" opacity={selected && !active ? .35 : 1}
              role="button" tabIndex={0} aria-pressed={active}
              aria-label={`${category.name}: ${formatCurrency(category.amount)}, ${percentage.format(category.percentage)} %`}
              onClick={() => onSelect(category.key)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(category.key) }
              }}><title>{`${category.name} · ${formatCurrency(category.amount)}`}</title></circle>
          })}
        </svg>
        <div className="statistics-donut-center" aria-hidden="true"><span>{selected?.name ?? 'Total'}</span><strong>{formatCurrency(selected?.amount ?? total)}</strong></div>
      </div>
      <div className="statistics-donut-legend" aria-label="Leyenda de categorías">
        {categories.map((category) => <button type="button" key={category.key} aria-pressed={selected?.key === category.key}
          onClick={() => onSelect(category.key)}>
          <span className="statistics-color-dot" style={{ backgroundColor: getCategoryColor(category.key) }} aria-hidden="true" />
          <span><strong>{category.name}</strong><small>{percentage.format(category.percentage)} %</small></span>
          <b>{formatCurrency(category.amount)}</b>
        </button>)}
      </div>
    </div>
    {selected ? <div className="statistics-category-insight" role="status">
      <h3>{selected.icon} {selected.name}</h3>
      <dl><div><dt>Total</dt><dd>{formatCurrency(selected.amount)}</dd></div>
        <div><dt>Del periodo</dt><dd>{percentage.format(selected.percentage)} %</dd></div>
        <div><dt>Número de gastos</dt><dd>{selected.count}</dd></div>
        <div><dt>Ticket medio</dt><dd>{formatCurrency(selected.count ? selected.amount / selected.count : 0)}</dd></div></dl>
      <button className="primary-button" type="button" onClick={() => onViewExpenses(selected)}>Ver gastos de {selected.name} <span aria-hidden="true">›</span></button>
    </div> : <p className="statistics-chart-help">Pulsa una categoría para ver su detalle y abrir sus gastos.</p>}
  </section>
}
