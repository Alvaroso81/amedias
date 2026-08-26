import type { ReactNode } from 'react'
import type { AppPage } from '../types/navigation'
import { BottomNavigation } from './BottomNavigation'

type AppShellProps = {
  children: ReactNode
  currentPage: AppPage
  onAddExpense: () => void
  onGoExpenses: () => void
  onGoHome: () => void
  onGoSettings: () => void
}

export function AppShell({
  children,
  currentPage,
  onAddExpense,
  onGoExpenses,
  onGoHome,
  onGoSettings,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <main className="app-content">{children}</main>
      <BottomNavigation
        currentPage={currentPage}
        onAddExpense={onAddExpense}
        onGoExpenses={onGoExpenses}
        onGoHome={onGoHome}
        onGoSettings={onGoSettings}
      />
    </div>
  )
}
