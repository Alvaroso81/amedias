import type { ReactNode } from 'react'
import type { AppPage } from '../types/navigation'
import { BottomNavigation } from './BottomNavigation'

type AppShellProps = {
  children: ReactNode
  currentPage: AppPage
  onAdd: () => void
  onGoExpenses: () => void
  onGoHome: () => void
  onGoStatistics: () => void
  onGoSettings: () => void
}

export function AppShell({
  children,
  currentPage,
  onAdd,
  onGoExpenses,
  onGoHome,
  onGoStatistics,
  onGoSettings,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <main className="app-content">{children}</main>
      <BottomNavigation
        currentPage={currentPage}
        onAdd={onAdd}
        onGoExpenses={onGoExpenses}
        onGoHome={onGoHome}
        onGoStatistics={onGoStatistics}
        onGoSettings={onGoSettings}
      />
    </div>
  )
}
