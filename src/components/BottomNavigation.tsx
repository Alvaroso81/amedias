import type { AppPage } from '../types/navigation'

const navigationItems = [
  { label: 'Inicio', icon: '⌂' },
  { label: 'Gastos', icon: '▤' },
  { label: 'Estadísticas', icon: '▥' },
  { label: 'Ajustes', icon: '⚙' },
]

type BottomNavigationProps = {
  currentPage: AppPage
  onAddExpense: () => void
  onGoExpenses: () => void
  onGoHome: () => void
}

export function BottomNavigation({
  currentPage,
  onAddExpense,
  onGoExpenses,
  onGoHome,
}: BottomNavigationProps) {
  const [home, expenses, statistics, settings] = navigationItems
  const isAddingExpense = currentPage === 'add-expense'
  const isExpensesSection = ['expenses', 'expense-detail', 'edit-expense'].includes(currentPage)

  return (
    <nav className="bottom-navigation" aria-label="Navegación principal">
      <NavItem {...home} active={currentPage === 'home'} onClick={onGoHome} />
      <NavItem {...expenses} active={isExpensesSection} onClick={onGoExpenses} />
      <button
        className={`add-expense-button${isAddingExpense ? ' add-expense-button--active' : ''}`}
        type="button"
        aria-label="Añadir gasto"
        aria-current={isAddingExpense ? 'page' : undefined}
        onClick={onAddExpense}
      >
        <span aria-hidden="true">+</span>
      </button>
      <NavItem {...statistics} />
      <NavItem {...settings} />
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
