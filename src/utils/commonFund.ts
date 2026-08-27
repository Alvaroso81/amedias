import { formatCurrency } from './formatCurrency'

export type CommonFundBand = 'healthy' | 'good' | 'watch' | 'low' | 'critical'

export function roundToCents(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
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
