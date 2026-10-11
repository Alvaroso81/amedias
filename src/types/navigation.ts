export type AppPage =
  | 'home'
  | 'expenses'
  | 'add-expense'
  | 'expense-detail'
  | 'common-fund'
  | 'settlements'
  | 'settlement-detail'
  | 'statistics'
  | 'settings'
  | 'categories'
  | 'recurring-expenses'
  | 'recurring-occurrence'
  | 'savings'
  | 'add-savings'
  | 'savings-detail'

export type NavigationParams = {
  expenseId?: string
  settlementId?: string
  savingsId?: string
  occurrenceId?: string
  templateId?: string
  recurringMode?: 'create' | 'edit'
  savingsMode?: 'edit' | 'contribution' | 'withdrawal'
  statisticsScope?: 'common' | 'personal'
  statisticsFilter?: import('./expenseFilters').StatisticsExpenseFilter
  commonFundDialog?: 'top-up'
}

export const pageLabels: Record<AppPage, string> = {
  home: 'Inicio', expenses: 'Gastos', 'add-expense': 'Nuevo gasto',
  'expense-detail': 'Gasto', 'common-fund': 'Fondo común',
  settlements: 'Liquidaciones', 'settlement-detail': 'Liquidación',
  statistics: 'Estadísticas', settings: 'Ajustes', categories: 'Categorías',
  'recurring-expenses': 'Recurrentes', 'recurring-occurrence': 'Revisión del gasto',
  savings: 'Ahorros', 'add-savings': 'Nuevo ahorro', 'savings-detail': 'Ahorro',
}
