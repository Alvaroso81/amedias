import type { CommonFundMovement } from '../types/commonFund'
import { formatCurrency } from './formatCurrency'
import { getMonthKey } from './formatDate'

export type CommonFundBand = 'healthy' | 'good' | 'watch' | 'low' | 'critical'

export function roundToCents(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function getCommonFundMonthlyActivity(
  movements: CommonFundMovement[],
  referenceDate = new Date(),
) {
  const monthKey = getMonthKey(referenceDate)
  let addedThisMonth = 0
  let spentThisMonth = 0

  movements.forEach((movement) => {
    if (
      movement.movementType === 'expense' &&
      movement.expenseDate?.startsWith(monthKey)
    ) {
      spentThisMonth += Math.abs(movement.amountDelta)
      return
    }

    if (
      movement.movementType !== 'top_up' &&
      movement.movementType !== 'monthly_contribution'
    ) {
      return
    }

    const movementMonth =
      movement.movementType === 'monthly_contribution' && movement.periodMonth
        ? movement.periodMonth.slice(0, 7)
        : getMonthKey(new Date(movement.createdAt))

    if (movementMonth === monthKey && movement.amountDelta > 0) {
      addedThisMonth += movement.amountDelta
    }
  })

  return {
    addedThisMonth: roundToCents(addedThisMonth),
    spentThisMonth: roundToCents(spentThisMonth),
  }
}

export function isCommonFundUnstarted(balance: number, movements: CommonFundMovement[]) {
  return roundToCents(balance) === 0 && movements.length === 0
}

export function getCommonFundPercentage(balance: number, suggestedContributionAmount: number) {
  if (suggestedContributionAmount <= 0) return balance > 0 ? 100 : 0
  return Math.max(0, (balance / suggestedContributionAmount) * 100)
}

export function getCommonFundBand(percentage: number): CommonFundBand {
  if (percentage >= 80) return 'healthy'
  if (percentage >= 60) return 'good'
  if (percentage >= 40) return 'watch'
  if (percentage >= 20) return 'low'
  return 'critical'
}

export function formatSignedFundAmount(amount: number) {
  const rounded = roundToCents(amount)
  if (rounded === 0) return formatCurrency(0)
  return `${rounded > 0 ? '+' : '−'}${formatCurrency(Math.abs(rounded))}`
}
