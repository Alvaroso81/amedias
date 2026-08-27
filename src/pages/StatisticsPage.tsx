import { useMemo, useState } from 'react'
import { ExpenseDataState } from '../components/ExpenseDataState'
import type {
  ExpenseReadMember,
  ExpenseRecord,
  SettlementRecord,
} from '../types/expenseRead'
import type { StatisticsExpenseFilter } from '../types/expenseFilters'
import { formatCurrency } from '../utils/formatCurrency'
import { formatMonthYear } from '../utils/formatDate'
import {
  filterExpensesByRange,
  filterSettlementsByRange,
  getCategoryChanges,
  getCategoryStatistics,
  getCurrentBalance,
  getMemberStatistics,
  getMonthlyAverage,
  getMonthlyEvolution,
  getPeriodComparison,
  getPaymentSourceStatistics,
  getPeriodRange,
  getPreviousPeriodRange,
  getTopDescriptions,
  shiftMonth,
  sumExpenses,
  sumSettlements,
  type CategoryStatistic,
  type MemberStatistic,
  type StatisticsPeriodMode,
} from '../utils/statistics'

type StatisticsTab = 'summary' | 'categories' | 'evolution' | 'couple'

type StatisticsScope = 'common' | 'personal'
type StatisticsPageProps = {
  commonExpenses: ExpenseRecord[]
  personalExpenses: ExpenseRecord[]
  currentUserId: string
  members: ExpenseReadMember[]
  settlements: SettlementRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelectCategory: (filter: StatisticsExpenseFilter) => void
}

const periodModes: { value: StatisticsPeriodMode; label: string }[] = [
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'history', label: 'Histórico' },
]

const tabs: { value: StatisticsTab; label: string }[] = [
  { value: 'summary', label: 'Resumen' },
  { value: 'categories', label: 'Categorías' },
  { value: 'evolution', label: 'Evolución' },
  { value: 'couple', label: 'Pareja' },
]

const percentageFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const previousMonthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long' })

function getInitialMonth() {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

function formatSignedCurrency(amount: number) {
  if (amount === 0) return formatCurrency(0)
  return `${amount > 0 ? '+' : '−'}${formatCurrency(Math.abs(amount))}`
}

function getPeriodLabel(mode: StatisticsPeriodMode, anchorDate: Date) {
  if (mode === 'history') return 'Todo el histórico'
  if (mode === 'year') return String(anchorDate.getFullYear())
  return formatMonthYear(anchorDate)
}

function getPreviousPeriodLabel(mode: StatisticsPeriodMode, anchorDate: Date) {
  if (mode === 'year') return String(anchorDate.getFullYear() - 1)
  const previousMonth = shiftMonth(anchorDate, -1)
  return previousMonthFormatter.format(previousMonth)
}

export function StatisticsPage({
  commonExpenses,
  personalExpenses,
  currentUserId,
  members,
  settlements,
  loading,
  error,
  onRetry,
  onSelectCategory,
}: StatisticsPageProps) {
  const [periodMode, setPeriodMode] = useState<StatisticsPeriodMode>('month')
  const [anchorDate, setAnchorDate] = useState(getInitialMonth)
  const [activeTab, setActiveTab] = useState<StatisticsTab>('summary')
  const [scope, setScope] = useState<StatisticsScope>('common')

  const scopedExpenses = useMemo(
    () =>
      scope === 'common'
        ? commonExpenses
        : personalExpenses.filter((expense) => expense.personalOwnerId === currentUserId),
    [commonExpenses, currentUserId, personalExpenses, scope],
  )
  const visibleTabs = scope === 'personal' ? tabs.filter((tab) => tab.value !== 'couple') : tabs
  const statistics = useMemo(() => {
    const currentRange = getPeriodRange(periodMode, anchorDate)
    const previousRange = getPreviousPeriodRange(periodMode, anchorDate)
    const currentExpenses = filterExpensesByRange(scopedExpenses, currentRange)
    const previousExpenses = previousRange
      ? filterExpensesByRange(scopedExpenses, previousRange)
      : []
    const periodSettlements =
      scope === 'common' ? filterSettlementsByRange(settlements, currentRange) : []
    const total = sumExpenses(currentExpenses)
    const previousTotal = sumExpenses(previousExpenses)
    const categories = getCategoryStatistics(currentExpenses, previousExpenses)
    const categoryChanges = previousRange
      ? getCategoryChanges(currentExpenses, previousExpenses)
      : []

    return {
      currentExpenses,
      previousExpenses,
      periodSettlements,
      total,
      previousTotal,
      comparison: getPeriodComparison(total, previousTotal),
      categories,
      greatestRise: [...categoryChanges]
        .filter((category) => category.amount > 0)
        .sort((first, second) => second.amount - first.amount)[0],
      greatestDrop: [...categoryChanges]
        .filter((category) => category.amount < 0)
        .sort((first, second) => first.amount - second.amount)[0],
      paidBy: getPaymentSourceStatistics(currentExpenses, members),
      assumedBy: getMemberStatistics(currentExpenses, members, 'splits'),
      evolution: getMonthlyEvolution(scopedExpenses, periodMode, anchorDate),
      monthlyAverage: getMonthlyAverage(scopedExpenses, periodMode, anchorDate),
      topDescriptions: getTopDescriptions(currentExpenses),
      currentBalance:
        scope === 'common'
          ? getCurrentBalance(scopedExpenses, settlements, members)
          : { debtor: null, creditor: null, amount: 0 },
      settledTotal: sumSettlements(periodSettlements),
    }
  }, [anchorDate, members, periodMode, scope, scopedExpenses, settlements])

  const periodLabel = getPeriodLabel(periodMode, anchorDate)
  const previousPeriodLabel = getPreviousPeriodLabel(periodMode, anchorDate)
  const ticketAverage = statistics.currentExpenses.length
    ? statistics.total / statistics.currentExpenses.length
    : 0
  const largestCategory = statistics.categories[0]

  const changePeriod = (offset: number) => {
    setAnchorDate((currentDate) =>
      periodMode === 'year'
        ? new Date(currentDate.getFullYear() + offset, currentDate.getMonth(), 1)
        : shiftMonth(currentDate, offset),
    )
  }

  const handleCategoryClick = (category: CategoryStatistic) => {
    onSelectCategory({
      categoryId: category.id,
      categoryName: category.name,
      periodMode,
      scope,
      anchorDate: `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}-01`,
    })
  }

  return (
    <div className="statistics-page">
      <header className="statistics-header">
        <p>{scope === 'common' ? 'Análisis del hogar' : 'Análisis personal'}</p>
        <h1>Estadísticas</h1>
      </header>
      <div className="statistics-scope-control" aria-label="Ámbito de estadísticas">
        <button
          className={scope === 'common' ? 'statistics-scope-button--active' : ''}
          type="button"
          aria-pressed={scope === 'common'}
          onClick={() => setScope('common')}
        >
          Comunes
        </button>
        <button
          className={scope === 'personal' ? 'statistics-scope-button--active' : ''}
          type="button"
          aria-pressed={scope === 'personal'}
          onClick={() => {
            setScope('personal')
            if (activeTab === 'couple') setActiveTab('summary')
          }}
        >
          Personales
        </button>
      </div>


      <div className="statistics-period-control" aria-label="Periodo de estadísticas">
        {periodModes.map((mode) => (
          <button
            className={periodMode === mode.value ? 'statistics-period-button--active' : ''}
            type="button"
            aria-pressed={periodMode === mode.value}
            key={mode.value}
            onClick={() => setPeriodMode(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {periodMode !== 'history' && (
        <div className="statistics-date-selector" aria-label="Cambiar periodo">
          <button
            type="button"
            aria-label={periodMode === 'year' ? 'Año anterior' : 'Mes anterior'}
            onClick={() => changePeriod(-1)}
          >
            ‹
          </button>
          <strong>{periodLabel}</strong>
          <button
            type="button"
            aria-label={periodMode === 'year' ? 'Año siguiente' : 'Mes siguiente'}
            onClick={() => changePeriod(1)}
          >
            ›
          </button>
        </div>
      )}

      <div className="statistics-tabs" role="tablist" aria-label="Secciones de estadísticas">
        {visibleTabs.map((tab) => (
          <button
            id={`statistics-tab-${tab.value}`}
            className={activeTab === tab.value ? 'statistics-tab--active' : ''}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls={`statistics-panel-${tab.value}`}
            tabIndex={activeTab === tab.value ? 0 : -1}
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <ExpenseDataState
          loading
          title="Calculando estadísticas"
          message="Estamos analizando los gastos reales del hogar…"
        />
      ) : error ? (
        <ExpenseDataState
          title="No hemos podido cargar las estadísticas"
          message={error}
          onRetry={onRetry}
        />
      ) : statistics.currentExpenses.length === 0 ? (
        <ExpenseDataState
          title="No hay gastos en este periodo"
          message="Elige otro periodo o registra un nuevo gasto."
        />
      ) : (
        <div
          id={`statistics-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`statistics-tab-${activeTab}`}
        >
          {activeTab === 'summary' && (
            <SummaryTab
              total={statistics.total}
              previousTotal={statistics.previousTotal}
              difference={statistics.comparison.difference}
              percentage={statistics.comparison.percentage}
              periodMode={periodMode}
              previousPeriodLabel={previousPeriodLabel}
              expenseCount={statistics.currentExpenses.length}
              ticketAverage={ticketAverage}
              monthlyAverage={statistics.monthlyAverage}
              largestCategory={largestCategory}
              categories={statistics.categories.slice(0, 3)}
              onSelectCategory={handleCategoryClick}
            />
          )}

          {activeTab === 'categories' && (
            <CategoriesTab
              categories={statistics.categories}
              periodMode={periodMode}
              previousPeriodLabel={previousPeriodLabel}
              greatestRise={statistics.greatestRise}
              greatestDrop={statistics.greatestDrop}
              descriptions={statistics.topDescriptions}
              onSelectCategory={handleCategoryClick}
            />
          )}

          {activeTab === 'evolution' && (
            <EvolutionTab
              evolution={statistics.evolution}
              total={statistics.total}
              previousTotal={statistics.previousTotal}
              periodMode={periodMode}
              previousPeriodLabel={previousPeriodLabel}
            />
          )}

          {scope === 'common' && activeTab === 'couple' && (
            <CoupleTab
              paidBy={statistics.paidBy}
              assumedBy={statistics.assumedBy}
              balance={statistics.currentBalance}
              settlementCount={statistics.periodSettlements.length}
              settledTotal={statistics.settledTotal}
            />
          )}
        </div>
      )}
    </div>
  )
}

type SummaryTabProps = {
  total: number
  previousTotal: number
  difference: number
  percentage: number | null
  periodMode: StatisticsPeriodMode
  previousPeriodLabel: string
  expenseCount: number
  ticketAverage: number
  monthlyAverage: number
  largestCategory?: CategoryStatistic
  categories: CategoryStatistic[]
  onSelectCategory: (category: CategoryStatistic) => void
}

function SummaryTab({
  total,
  previousTotal,
  difference,
  percentage,
  periodMode,
  previousPeriodLabel,
  expenseCount,
  ticketAverage,
  monthlyAverage,
  largestCategory,
  categories,
  onSelectCategory,
}: SummaryTabProps) {
  return (
    <div className="statistics-tab-content">
      <section className="card statistics-total-card">
        <span>Gastado</span>
        <strong>{formatCurrency(total)}</strong>
        {periodMode !== 'history' && (
          <div className={`statistics-comparison${difference > 0 ? ' statistics-comparison--up' : ''}`}>
            {previousTotal > 0 ? (
              <>
                <b>{formatSignedCurrency(difference)}</b>
                <b>
                  {percentage === null
                    ? ''
                    : `${percentage >= 0 ? '+' : '−'}${percentageFormatter.format(Math.abs(percentage))} %`}
                </b>
                <span>respecto a {previousPeriodLabel}</span>
              </>
            ) : (
              <span>Sin gasto en el periodo anterior</span>
            )}
          </div>
        )}
      </section>

      <div className="statistics-metrics-grid">
        <MetricCard label="Número de gastos" value={String(expenseCount)} />
        <MetricCard label="Ticket medio" value={formatCurrency(ticketAverage)} />
        <MetricCard label="Media mensual" value={formatCurrency(monthlyAverage)} />
        {largestCategory && (
          <section className="card statistics-metric-card statistics-largest-category">
            <span>Mayor categoría</span>
            <strong>{largestCategory.icon} {largestCategory.name}</strong>
            <b>{formatCurrency(largestCategory.amount)}</b>
            <small>{percentageFormatter.format(largestCategory.percentage)} % del gasto</small>
          </section>
        )}
      </div>

      <section className="card statistics-section-card">
        <div className="statistics-section-heading">
          <div>
            <span>Distribución</span>
            <h2>Principales categorías</h2>
          </div>
        </div>
        <CategoryRows categories={categories} onSelectCategory={onSelectCategory} />
      </section>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="card statistics-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  )
}

type CategoriesTabProps = {
  categories: CategoryStatistic[]
  periodMode: StatisticsPeriodMode
  previousPeriodLabel: string
  greatestRise?: { icon: string; name: string; amount: number }
  greatestDrop?: { icon: string; name: string; amount: number }
  descriptions: { key: string; description: string; count: number; amount: number }[]
  onSelectCategory: (category: CategoryStatistic) => void
}

function CategoriesTab({
  categories,
  periodMode,
  previousPeriodLabel,
  greatestRise,
  greatestDrop,
  descriptions,
  onSelectCategory,
}: CategoriesTabProps) {
  return (
    <div className="statistics-tab-content">
      <section className="card statistics-section-card">
        <div className="statistics-section-heading">
          <div>
            <span>Detalle completo</span>
            <h2>Gastos por categoría</h2>
          </div>
        </div>
        <CategoryRows
          categories={categories}
          previousPeriodLabel={periodMode === 'history' ? undefined : previousPeriodLabel}
          onSelectCategory={onSelectCategory}
        />
      </section>

      {periodMode !== 'history' && (greatestRise || greatestDrop) && (
        <div className="statistics-change-grid">
          {greatestRise && (
            <ChangeCard
              label="Mayor subida"
              icon={greatestRise.icon}
              name={greatestRise.name}
              amount={greatestRise.amount}
            />
          )}
          {greatestDrop && (
            <ChangeCard
              label="Mayor bajada"
              icon={greatestDrop.icon}
              name={greatestDrop.name}
              amount={greatestDrop.amount}
            />
          )}
        </div>
      )}

      <section className="card statistics-section-card">
        <div className="statistics-section-heading">
          <div>
            <span>Conceptos normalizados</span>
            <h2>Donde más gastamos</h2>
          </div>
        </div>
        <div className="statistics-description-list">
          {descriptions.map((description, index) => (
            <div key={description.key}>
              <span>{index + 1}</span>
              <div>
                <strong>{description.description}</strong>
                <small>{description.count} {description.count === 1 ? 'compra' : 'compras'}</small>
              </div>
              <b>{formatCurrency(description.amount)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function ChangeCard({
  label,
  icon,
  name,
  amount,
}: {
  label: string
  icon: string
  name: string
  amount: number
}) {
  return (
    <section className="card statistics-change-card">
      <span>{label}</span>
      <strong>{icon} {name}</strong>
      <b>{formatSignedCurrency(amount)}</b>
    </section>
  )
}

function CategoryRows({
  categories,
  previousPeriodLabel,
  onSelectCategory,
}: {
  categories: CategoryStatistic[]
  previousPeriodLabel?: string
  onSelectCategory: (category: CategoryStatistic) => void
}) {
  return (
    <div className="statistics-category-list">
      {categories.map((category) => (
        <button type="button" key={category.key} onClick={() => onSelectCategory(category)}>
          <span className="statistics-category-icon" aria-hidden="true">{category.icon}</span>
          <span className="statistics-category-copy">
            <span>
              <strong>{category.name}</strong>
              <b>{formatCurrency(category.amount)}</b>
            </span>
            <span className="statistics-progress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, category.percentage)}%` }} />
            </span>
            <small>
              {percentageFormatter.format(category.percentage)} %
              {previousPeriodLabel
                ? ` · ${formatSignedCurrency(category.difference)} respecto a ${previousPeriodLabel}`
                : ''}
            </small>
          </span>
          <span className="expense-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  )
}

type EvolutionTabProps = {
  evolution: { key: string; label: string; amount: number }[]
  total: number
  previousTotal: number
  periodMode: StatisticsPeriodMode
  previousPeriodLabel: string
}

function EvolutionTab({
  evolution,
  total,
  previousTotal,
  periodMode,
  previousPeriodLabel,
}: EvolutionTabProps) {
  const maximum = Math.max(...evolution.map((month) => month.amount), 1)
  const comparison = getPeriodComparison(total, previousTotal)

  return (
    <div className="statistics-tab-content">
      <section className="card statistics-section-card">
        <div className="statistics-section-heading">
          <div>
            <span>{periodMode === 'year' ? 'Año seleccionado' : 'Meses recientes'}</span>
            <h2>Evolución</h2>
          </div>
        </div>
        <div className="statistics-evolution-chart" aria-label="Evolución mensual del gasto">
          {evolution.map((month) => (
            <div key={month.key}>
              <span>{month.label}</span>
              <span className="statistics-evolution-track" aria-hidden="true">
                <span style={{ width: `${(month.amount / maximum) * 100}%` }} />
              </span>
              <strong>{formatCurrency(month.amount)}</strong>
            </div>
          ))}
        </div>
      </section>

      {periodMode !== 'history' && (
        <section className="card statistics-evolution-comparison">
          <span>Comparación con {previousPeriodLabel}</span>
          {previousTotal > 0 ? (
            <>
              <strong>{formatSignedCurrency(comparison.difference)}</strong>
              <small>
                {comparison.percentage === null
                  ? ''
                  : `${comparison.percentage >= 0 ? '+' : '−'}${percentageFormatter.format(Math.abs(comparison.percentage))} %`}
              </small>
            </>
          ) : (
            <strong>Sin gasto comparable</strong>
          )}
        </section>
      )}
    </div>
  )
}

type CoupleTabProps = {
  paidBy: MemberStatistic[]
  assumedBy: MemberStatistic[]
  balance: { debtor: ExpenseReadMember | null; creditor: ExpenseReadMember | null; amount: number }
  settlementCount: number
  settledTotal: number
}

function CoupleTab({
  paidBy,
  assumedBy,
  balance,
  settlementCount,
  settledTotal,
}: CoupleTabProps) {
  return (
    <div className="statistics-tab-content">
      <div className="statistics-pair-grid">
        <MemberDistribution title="Cómo se han pagado los gastos" members={paidBy} />
        <MemberDistribution title="Quién ha asumido el gasto" members={assumedBy} />
      </div>

      <p className="statistics-distribution-help">
        El origen de pago muestra de dónde salió el dinero. Asumido muestra a quién corresponde el gasto.
      </p>

      <div className="statistics-pair-grid">
        <section className="card statistics-balance-card">
          <span>Balance actual del hogar</span>
          <strong>
            {balance.debtor && balance.creditor
              ? `${balance.debtor.displayName} debe a ${balance.creditor.displayName}`
              : 'Estáis equilibrados'}
          </strong>
          <b>{formatCurrency(balance.amount)}</b>
          <small>Balance histórico: pagos − repartos + liquidaciones.</small>
        </section>

        <section className="card statistics-settlements-card">
          <span>Liquidaciones del periodo</span>
          <div>
            <strong>{settlementCount}</strong>
            <small>registradas</small>
          </div>
          <div>
            <strong>{formatCurrency(settledTotal)}</strong>
            <small>total liquidado</small>
          </div>
          <p>No se incluyen dentro del gasto.</p>
        </section>
      </div>
    </div>
  )
}

function MemberDistribution({ title, members }: { title: string; members: MemberStatistic[] }) {
  return (
    <section className="card statistics-distribution-card">
      <h2>{title}</h2>
      <div>
        {members.map((member) => (
          <div className="statistics-member-row" key={member.userId}>
            <span>
              <strong>{member.displayName}</strong>
              <b>{formatCurrency(member.amount)}</b>
            </span>
            <span className="statistics-progress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, member.percentage)}%` }} />
            </span>
            <small>{percentageFormatter.format(member.percentage)} %</small>
          </div>
        ))}
      </div>
    </section>
  )
}
