import type { CategoryExpense, Expense, PersonContribution } from '../types/finance'

export const contributions: PersonContribution[] = [
  { name: 'Álvaro', amount: 1438.7, percentage: 59 },
  { name: 'Marta', amount: 1000, percentage: 41 },
]

export const categories: CategoryExpense[] = [
  { name: 'Supermercado', amount: 485, icon: '🛒' },
  { name: 'Comer fuera', amount: 390, icon: '🍽️' },
  { name: 'Casa', amount: 320, icon: '🏠' },
  { name: 'Ropa', amount: 280, icon: '👕' },
  { name: 'Ocio', amount: 245, icon: '🎬' },
]

export const recentExpenses: Expense[] = [
  {
    id: 'mercadona-2026-08-26',
    amount: 82.45,
    description: 'Mercadona',
    category: 'Supermercado',
    paidBy: 'Álvaro',
    date: '2026-08-26',
    split: { alvaro: 50, marta: 50 },
    expenseType: 'common',
    note: '',
    createdAt: '2026-08-26T10:00:00.000Z',
    icon: '🛒',
    displayDate: 'Hoy',
  },
  {
    id: 'cena-italiano-2026-08-25',
    amount: 68,
    description: 'Cena italiano',
    category: 'Comer fuera',
    paidBy: 'Marta',
    date: '2026-08-25',
    split: { alvaro: 50, marta: 50 },
    expenseType: 'common',
    note: '',
    createdAt: '2026-08-25T21:00:00.000Z',
    icon: '🍝',
    displayDate: 'Ayer',
  },
  {
    id: 'zara-ninos-2026-08-22',
    amount: 94.95,
    description: 'Zara niños',
    category: 'Ropa',
    paidBy: 'Álvaro',
    date: '2026-08-22',
    split: { alvaro: 50, marta: 50 },
    expenseType: 'common',
    note: '',
    createdAt: '2026-08-22T17:30:00.000Z',
    icon: '👕',
    displayDate: '22 ago',
  },
]
