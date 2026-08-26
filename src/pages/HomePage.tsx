import { AppHeader } from '../components/AppHeader'
import { BalanceCard } from '../components/BalanceCard'
import { CategoryList } from '../components/CategoryList'
import { ExpenseSummary } from '../components/ExpenseSummary'
import { RecentExpenses } from '../components/RecentExpenses'
import { categories, contributions, recentExpenses } from './homeData'

export function HomePage() {
  return (
    <div className="home-page">
      <AppHeader />

      <div className="summary-grid">
        <ExpenseSummary total={2438.7} contributions={contributions} />
        <BalanceCard debtor="Marta" creditor="Álvaro" amount={219.35} />
      </div>

      <div className="details-grid">
        <CategoryList categories={categories} />
        <RecentExpenses expenses={recentExpenses} />
      </div>
    </div>
  )
}
