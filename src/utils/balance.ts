import type { ExpenseReadMember, ExpenseRecord, SettlementRecord } from '../types/expenseRead'
import { getExpenseBalanceImpacts } from './expensePresentation'

export type MemberBalance = { member: ExpenseReadMember; amount: number }
export type CurrentMemberBalance = {
  creditor: MemberBalance | null
  debtor: MemberBalance | null
  amount: number
  currentUserAmount: number
}
const zeroBalance: CurrentMemberBalance = { creditor: null, debtor: null, amount: 0, currentUserAmount: 0 }
const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100)

// Same selection and formula as Home: payments - shares + payments sent - payments received.
// Integer cents make the displayed row effects and total reconcile without float drift.
function summarize(totals: Map<string, number>, members: ExpenseReadMember[], currentUserId: string, perspective: 'member' | 'household'): CurrentMemberBalance {
  const balances = members.map((member) => ({ member, amount: (totals.get(member.userId) ?? 0) / 100 }))
  const own = balances.find(({ member }) => member.userId === currentUserId)
  if (perspective === 'household') {
    const creditor = [...balances].sort((a, b) => b.amount - a.amount)[0]
    const debtor = [...balances].sort((a, b) => a.amount - b.amount)[0]
    if (!creditor || !debtor || creditor.amount < .01 || debtor.amount > -.01) return zeroBalance
    return { creditor, debtor, amount: Math.min(creditor.amount, Math.abs(debtor.amount)), currentUserAmount: own?.amount ?? 0 }
  }
  if (!own || Math.abs(own.amount) < .01) return zeroBalance
  const counterpart = own.amount > 0
    ? balances.filter(({ amount }) => amount <= -.01).sort((a, b) => a.amount - b.amount)[0]
    : balances.filter(({ amount }) => amount >= .01).sort((a, b) => b.amount - a.amount)[0]
  if (!counterpart) return zeroBalance
  const creditor = own.amount > 0 ? own : counterpart
  const debtor = own.amount < 0 ? own : counterpart
  return { creditor, debtor, amount: Math.min(creditor.amount, Math.abs(debtor.amount)), currentUserAmount: own.amount }
}

type Impact = { userId: string; displayName: string; amount: number }
type BalanceRecord = { kind: 'expense'; record: ExpenseRecord } | { kind: 'settlement'; record: SettlementRecord }
export type BalanceRow = BalanceRecord & {
  date: string
  impacts: Impact[]
  effect: CurrentMemberBalance
  before: CurrentMemberBalance
  balance: CurrentMemberBalance
}

export function getBalanceBreakdown(expenses: ExpenseRecord[], settlements: SettlementRecord[], members: ExpenseReadMember[], currentUserId: string, perspective: 'member' | 'household' = 'member') {
  const records: (BalanceRecord & { date: string })[] = [
    ...expenses.filter((expense) => expense.expenseType === 'common' && expense.paymentSource !== 'common_fund')
      .map((record) => ({ kind: 'expense' as const, record, date: record.expenseDate })),
    ...settlements.map((record) => ({ kind: 'settlement' as const, record, date: record.settlementDate })),
  ]
  records.sort((a, b) => a.date.localeCompare(b.date) || a.record.createdAt.localeCompare(b.record.createdAt) || a.record.id.localeCompare(b.record.id))
  const totals = new Map(members.map((member) => [member.userId, 0]))
  const name = (userId: string) => members.find((member) => member.userId === userId)?.displayName ?? 'Antiguo miembro'
  const rows: BalanceRow[] = records.map((entry) => {
    const before = summarize(totals, members, currentUserId, perspective)
    const impacts = entry.kind === 'expense' ? getExpenseBalanceImpacts(entry.record) : [
      { userId: entry.record.fromUserId, displayName: name(entry.record.fromUserId), amount: entry.record.amount },
      { userId: entry.record.toUserId, displayName: name(entry.record.toUserId), amount: -entry.record.amount },
    ]
    const effectTotals = new Map<string, number>()
    impacts.forEach((impact) => {
      const value = cents(impact.amount)
      effectTotals.set(impact.userId, value)
      totals.set(impact.userId, (totals.get(impact.userId) ?? 0) + value)
    })
    return { ...entry, impacts, before, effect: summarize(effectTotals, members, currentUserId, perspective), balance: summarize(totals, members, currentUserId, perspective) }
  })
  return { rows, balance: summarize(totals, members, currentUserId, perspective) }
}

export function describeBalance(balance: CurrentMemberBalance) {
  return balance.debtor && balance.creditor
    ? `${balance.debtor.member.displayName} debe a ${balance.creditor.member.displayName}`
    : 'Estáis equilibrados'
}
