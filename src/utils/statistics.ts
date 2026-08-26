import type {
  ExpenseReadMember,
  ExpenseRecord,
  SettlementRecord,
} from '../types/expenseRead'

export type StatisticsPeriodMode = 'month' | 'year' | 'history'

export type PeriodRange = {
  start: string | null
  endExclusive: string | null
}

export type CategoryStatistic = {
  key: string
  id: string | null
  name: string
  icon: string
  amount: number
  percentage: number
  difference: number
}

export type CategoryChange = Omit<CategoryStatistic, 'amount' | 'percentage'> & {
  amount: number
}

export type MemberStatistic = {
  userId: string
  displayName: string
  amount: number
  percentage: number
}

export type MonthlyStatistic = {
  key: string
  label: string
  amount: number
}

export type DescriptionStatistic = {
  key: string
  description: string
  count: number
  amount: number
}

export type BalanceStatistic = {
  debtor: ExpenseReadMember | null
  creditor: ExpenseReadMember | null
  amount: number
}

const monthLabelFormatter = new Intl.DateTimeFormat('es-ES', { month: 'short' })

export function toCents(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100)
}

export function fromCents(amount: number) {
  return amount / 100
}

export function roundMoney(amount: number) {
  return fromCents(toCents(amount))
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthFromKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

export function shiftMonth(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1)
}

export function getPeriodRange(mode: StatisticsPeriodMode, anchorDate: Date): PeriodRange {
  if (mode === 'history') return { start: null, endExclusive: null }

  if (mode === 'year') {
    return {
      start: `${anchorDate.getFullYear()}-01-01`,
      endExclusive: `${anchorDate.getFullYear() + 1}-01-01`,
    }
  }

  const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const end = shiftMonth(start, 1)

  return { start: toDateKey(start), endExclusive: toDateKey(end) }
}

export function getPreviousPeriodRange(
  mode: StatisticsPeriodMode,
  anchorDate: Date,
): PeriodRange | null {
  if (mode === 'history') return null

  return getPeriodRange(
    mode,
    mode === 'month'
      ? shiftMonth(anchorDate, -1)
      : new Date(anchorDate.getFullYear() - 1, anchorDate.getMonth(), 1),
  )
}

function dateIsInRange(date: string, range: PeriodRange) {
  return (
    (!range.start || date >= range.start) &&
    (!range.endExclusive || date < range.endExclusive)
  )
}

export function filterExpensesByRange(expenses: ExpenseRecord[], range: PeriodRange) {
  return expenses.filter((expense) => dateIsInRange(expense.expenseDate, range))
}

export function filterSettlementsByRange(
  settlements: SettlementRecord[],
  range: PeriodRange,
) {
  return settlements.filter((settlement) =>
    dateIsInRange(settlement.settlementDate, range),
  )
}

export function sumExpenses(expenses: ExpenseRecord[]) {
  return fromCents(
    expenses.reduce((total, expense) => total + toCents(expense.amount), 0),
  )
}

export function getPeriodComparison(currentTotal: number, previousTotal: number) {
  const currentCents = toCents(currentTotal)
  const previousCents = toCents(previousTotal)
  const difference = fromCents(currentCents - previousCents)

  return {
    difference,
    percentage:
      previousCents > 0
        ? ((currentCents - previousCents) / previousCents) * 100
        : null,
  }
}

type CategoryAccumulator = {
  id: string | null
  name: string
  icon: string
  cents: number
}

function getCategoryMap(expenses: ExpenseRecord[]) {
  const categories = new Map<string, CategoryAccumulator>()

  expenses.forEach((expense) => {
    const key = expense.categoryId ?? expense.category.name
    const current = categories.get(key)
    categories.set(key, {
      id: expense.categoryId,
      name: expense.category.name,
      icon: expense.category.icon,
      cents: (current?.cents ?? 0) + toCents(expense.amount),
    })
  })

  return categories
}

export function getCategoryStatistics(
  currentExpenses: ExpenseRecord[],
  previousExpenses: ExpenseRecord[],
) {
  const currentCategories = getCategoryMap(currentExpenses)
  const previousCategories = getCategoryMap(previousExpenses)
  const totalCents = currentExpenses.reduce(
    (total, expense) => total + toCents(expense.amount),
    0,
  )

  return [...currentCategories.entries()]
    .map(([key, category]): CategoryStatistic => ({
      key,
      id: category.id,
      name: category.name,
      icon: category.icon,
      amount: fromCents(category.cents),
      percentage: totalCents ? (category.cents / totalCents) * 100 : 0,
      difference: fromCents(
        category.cents - (previousCategories.get(key)?.cents ?? 0),
      ),
    }))
    .filter((category) => category.amount > 0)
    .sort((first, second) => second.amount - first.amount)
}

export function getCategoryChanges(
  currentExpenses: ExpenseRecord[],
  previousExpenses: ExpenseRecord[],
) {
  const currentCategories = getCategoryMap(currentExpenses)
  const previousCategories = getCategoryMap(previousExpenses)
  const keys = new Set([...currentCategories.keys(), ...previousCategories.keys()])

  return [...keys]
    .map((key): CategoryChange => {
      const current = currentCategories.get(key)
      const previous = previousCategories.get(key)
      const category = current ?? previous

      return {
        key,
        id: category?.id ?? null,
        name: category?.name ?? 'Sin categoría',
        icon: category?.icon ?? '📦',
        amount: fromCents((current?.cents ?? 0) - (previous?.cents ?? 0)),
        difference: fromCents((current?.cents ?? 0) - (previous?.cents ?? 0)),
      }
    })
    .filter((category) => category.amount !== 0)
}

export function getMemberStatistics(
  expenses: ExpenseRecord[],
  members: ExpenseReadMember[],
  source: 'payments' | 'splits',
) {
  const amounts = new Map(members.map((member) => [member.userId, 0]))

  expenses.forEach((expense) => {
    if (source === 'payments') {
      expense.payments.forEach((payment) => {
        amounts.set(
          payment.userId,
          (amounts.get(payment.userId) ?? 0) + toCents(payment.amount),
        )
      })
      return
    }

    expense.splits.forEach((split) => {
      amounts.set(
        split.userId,
        (amounts.get(split.userId) ?? 0) + toCents(split.shareAmount),
      )
    })
  })

  const totalCents = [...amounts.values()].reduce((total, amount) => total + amount, 0)

  return members.map((member): MemberStatistic => {
    const cents = amounts.get(member.userId) ?? 0
    return {
      userId: member.userId,
      displayName: member.displayName,
      amount: fromCents(cents),
      percentage: totalCents ? (cents / totalCents) * 100 : 0,
    }
  })
}

function getMonthlyTotalMap(expenses: ExpenseRecord[]) {
  const totals = new Map<string, number>()

  expenses.forEach((expense) => {
    const key = expense.expenseDate.slice(0, 7)
    totals.set(key, (totals.get(key) ?? 0) + toCents(expense.amount))
  })

  return totals
}

export function getMonthlyEvolution(
  expenses: ExpenseRecord[],
  mode: StatisticsPeriodMode,
  anchorDate: Date,
) {
  const totals = getMonthlyTotalMap(expenses)
  let months: Date[]

  if (mode === 'year') {
    months = Array.from({ length: 12 }, (_, index) =>
      new Date(anchorDate.getFullYear(), index, 1),
    )
  } else {
    const historyLastMonth = [...totals.keys()].sort().at(-1)
    const endMonth =
      mode === 'history' && historyLastMonth ? monthFromKey(historyLastMonth) : anchorDate
    months = Array.from({ length: 6 }, (_, index) => shiftMonth(endMonth, index - 5))
  }

  return months.map((month): MonthlyStatistic => {
    const key = toMonthKey(month)
    const rawLabel = monthLabelFormatter.format(month).replace('.', '')
    return {
      key,
      label: `${rawLabel.charAt(0).toLocaleUpperCase('es-ES')}${rawLabel.slice(1)}`,
      amount: fromCents(totals.get(key) ?? 0),
    }
  })
}

function enumerateMonths(firstMonth: Date, lastMonth: Date) {
  const months: string[] = []
  let cursor = new Date(firstMonth.getFullYear(), firstMonth.getMonth(), 1)
  const endKey = toMonthKey(lastMonth)

  while (toMonthKey(cursor) <= endKey) {
    months.push(toMonthKey(cursor))
    cursor = shiftMonth(cursor, 1)
  }

  return months
}

export function getMonthlyAverage(
  expenses: ExpenseRecord[],
  mode: StatisticsPeriodMode,
  anchorDate: Date,
  today = new Date(),
) {
  if (!expenses.length) return 0

  const activityMonths = expenses.map((expense) => expense.expenseDate.slice(0, 7)).sort()
  const firstActivity = monthFromKey(activityMonths[0])
  const lastActivity = monthFromKey(activityMonths.at(-1) ?? activityMonths[0])
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  let firstMonth: Date
  let lastMonth: Date

  if (mode === 'history') {
    firstMonth = firstActivity
    lastMonth = lastActivity
  } else if (mode === 'year') {
    firstMonth = new Date(anchorDate.getFullYear(), 0, 1)
    lastMonth = new Date(anchorDate.getFullYear(), 11, 1)
  } else {
    firstMonth = shiftMonth(anchorDate, -5)
    lastMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  }

  if (firstMonth < firstActivity) firstMonth = firstActivity
  if (lastMonth > currentMonth) lastMonth = currentMonth
  if (firstMonth > lastMonth) return 0

  const months = enumerateMonths(firstMonth, lastMonth)
  const totals = getMonthlyTotalMap(expenses)
  const totalCents = months.reduce((total, month) => total + (totals.get(month) ?? 0), 0)

  return months.length ? fromCents(Math.round(totalCents / months.length)) : 0
}

function normalizeDescription(description: string) {
  return description.trim().toLocaleLowerCase('es-ES')
}

export function getTopDescriptions(expenses: ExpenseRecord[], limit = 5) {
  const descriptions = new Map<
    string,
    { description: string; count: number; cents: number }
  >()

  expenses.forEach((expense) => {
    const trimmedDescription = expense.description.trim()
    const key = normalizeDescription(trimmedDescription)
    const current = descriptions.get(key)
    descriptions.set(key, {
      description: current?.description ?? trimmedDescription,
      count: (current?.count ?? 0) + 1,
      cents: (current?.cents ?? 0) + toCents(expense.amount),
    })
  })

  return [...descriptions.entries()]
    .map(([key, value]): DescriptionStatistic => ({
      key,
      description: value.description,
      count: value.count,
      amount: fromCents(value.cents),
    }))
    .sort((first, second) => second.amount - first.amount || second.count - first.count)
    .slice(0, limit)
}

export function getCurrentBalance(
  expenses: ExpenseRecord[],
  settlements: SettlementRecord[],
  members: ExpenseReadMember[],
): BalanceStatistic {
  const balances = new Map(members.map((member) => [member.userId, 0]))

  expenses.forEach((expense) => {
    expense.payments.forEach((payment) => {
      balances.set(
        payment.userId,
        (balances.get(payment.userId) ?? 0) + toCents(payment.amount),
      )
    })
    expense.splits.forEach((split) => {
      balances.set(
        split.userId,
        (balances.get(split.userId) ?? 0) - toCents(split.shareAmount),
      )
    })
  })

  settlements.forEach((settlement) => {
    balances.set(
      settlement.fromUserId,
      (balances.get(settlement.fromUserId) ?? 0) + toCents(settlement.amount),
    )
    balances.set(
      settlement.toUserId,
      (balances.get(settlement.toUserId) ?? 0) - toCents(settlement.amount),
    )
  })

  const memberBalances = members.map((member) => ({
    member,
    cents: balances.get(member.userId) ?? 0,
  }))
  const creditor = [...memberBalances].sort((first, second) => second.cents - first.cents)[0]
  const debtor = [...memberBalances].sort((first, second) => first.cents - second.cents)[0]

  if (!creditor || !debtor || creditor.cents < 1 || debtor.cents > -1) {
    return { creditor: null, debtor: null, amount: 0 }
  }

  return {
    creditor: creditor.member,
    debtor: debtor.member,
    amount: fromCents(Math.min(creditor.cents, Math.abs(debtor.cents))),
  }
}

export function sumSettlements(settlements: SettlementRecord[]) {
  return fromCents(
    settlements.reduce(
      (total, settlement) => total + toCents(settlement.amount),
      0,
    ),
  )
}
