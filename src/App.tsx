import { useState } from 'react'
import { AppShell } from './components/AppShell'
import { AddExpensePage } from './pages/AddExpensePage'
import { ExpenseDetailPage } from './pages/ExpenseDetailPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { initialExpenses } from './pages/expensesData'
import { HomePage } from './pages/HomePage'
import type { Expense } from './types/finance'
import type { AppPage } from './types/navigation'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('home')
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId)

  const goHome = () => setCurrentPage('home')
  const goToExpenses = () => setCurrentPage('expenses')

  const openExpense = (expenseId: string) => {
    setSelectedExpenseId(expenseId)
    setCurrentPage('expense-detail')
  }

  const addExpense = (expense: Expense) => {
    setExpenses((currentExpenses) => [expense, ...currentExpenses])
    setCurrentPage('home')
  }

  const updateExpense = (updatedExpense: Expense) => {
    setExpenses((currentExpenses) =>
      currentExpenses.map((expense) =>
        expense.id === updatedExpense.id ? updatedExpense : expense,
      ),
    )
    setSelectedExpenseId(updatedExpense.id)
    setCurrentPage('expense-detail')
  }

  const deleteExpense = (expenseId: string) => {
    setExpenses((currentExpenses) =>
      currentExpenses.filter((expense) => expense.id !== expenseId),
    )
    setSelectedExpenseId(null)
    setCurrentPage('expenses')
  }

  let pageContent

  if (currentPage === 'home') {
    pageContent = <HomePage />
  } else if (currentPage === 'expenses') {
    pageContent = <ExpensesPage expenses={expenses} onSelectExpense={openExpense} />
  } else if (currentPage === 'add-expense') {
    pageContent = <AddExpensePage onBack={goHome} onExpenseSaved={addExpense} />
  } else if (currentPage === 'expense-detail' && selectedExpense) {
    pageContent = (
      <ExpenseDetailPage
        expense={selectedExpense}
        onBack={goToExpenses}
        onEdit={() => setCurrentPage('edit-expense')}
        onDelete={deleteExpense}
      />
    )
  } else if (currentPage === 'edit-expense' && selectedExpense) {
    pageContent = (
      <AddExpensePage
        initialExpense={selectedExpense}
        onBack={() => setCurrentPage('expense-detail')}
        onExpenseSaved={updateExpense}
      />
    )
  } else {
    pageContent = <ExpensesPage expenses={expenses} onSelectExpense={openExpense} />
  }

  return (
    <AppShell
      currentPage={currentPage}
      onAddExpense={() => {
        setSelectedExpenseId(null)
        setCurrentPage('add-expense')
      }}
      onGoExpenses={goToExpenses}
      onGoHome={goHome}
    >
      {pageContent}
    </AppShell>
  )
}

export default App
