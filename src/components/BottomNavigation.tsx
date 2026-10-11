import type { AppPage } from '../types/navigation'

const navigationItems = [
  { label: 'Inicio', icon: '⌂' },
  { label: 'Gastos', icon: '▤' },
  { label: 'Estadísticas', icon: '▥' },
  { label: 'Ajustes', icon: '⚙' },
]

type BottomNavigationProps = {
  currentPage: AppPage
  onAdd: () => void
  onGoExpenses: () => void
  onGoHome: () => void
  onGoStatistics: () => void
  onGoSettings: () => void
}

export function BottomNavigation({
  currentPage,
  onAdd,
  onGoExpenses,
  onGoHome,
  onGoStatistics,
  onGoSettings,
}: BottomNavigationProps) {
  const [home, expenses, statistics, settings] = navigationItems
  const isAddingExpense = currentPage === 'add-expense' || currentPage === 'add-savings'
  const isHomeSection = ['home', 'common-fund', 'savings', 'savings-detail'].includes(currentPage)
  const isExpensesSection = ['expenses', 'expense-detail'].includes(currentPage)
  const isSettingsSection = ['settings', 'categories', 'settlements', 'settlement-detail', 'recurring-expenses', 'recurring-occurrence'].includes(currentPage)

  // Expense screens provide their own contextual actions instead of global navigation.
  if (['add-expense', 'recurring-occurrence', 'expense-detail'].includes(currentPage)) return null

  return (
    <nav className="bottom-navigation" aria-label="Navegación principal">
      <NavItem {...home} active={isHomeSection} onClick={onGoHome} />
      <NavItem {...expenses} active={isExpensesSection} onClick={onGoExpenses} />
      <button
        className={`add-expense-button${isAddingExpense ? ' add-expense-button--active' : ''}`}
        type="button"
        aria-label="Añadir gasto o ahorro"
        aria-haspopup="dialog"
        aria-current={isAddingExpense ? 'page' : undefined}
        onClick={onAdd}
      >
        <span aria-hidden="true">+</span>
      </button>
      <NavItem
        {...statistics}
        active={currentPage === 'statistics'}
        onClick={onGoStatistics}
      />
      <NavItem
        {...settings}
        active={isSettingsSection}
        onClick={onGoSettings}
      />
    </nav>
  )
}

type NavItemProps = (typeof navigationItems)[number] & {
  active?: boolean
  onClick?: () => void
}

function NavItem({ label, icon, active = false, onClick }: NavItemProps) {
  return (
    <button
      className={`navigation-item${active ? ' navigation-item--active' : ''}`}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="navigation-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
