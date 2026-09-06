import type { SavingsGoal, SavingsParticipant } from '../types/savings'

export const MAX_SAVINGS_CENTS = 999999999999n

export function parseSavingsCents(input: string): bigint {
  const normalized = input.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Introduce un importe válido con un máximo de dos decimales.')
  const [whole, fraction = ''] = normalized.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents < 1n || cents > MAX_SAVINGS_CENTS) throw new Error('El importe debe estar entre 0,01 € y 9.999.999.999,99 €.')
  return cents
}

export function savingsCentsInput(cents: bigint) {
  return (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0')
}

export function formatSavingsCents(cents: bigint) {
  const absolute = cents < 0n ? -cents : cents
  return (cents < 0n ? '−' : '') + (absolute / 100n).toLocaleString('es-ES', { useGrouping: true }) + ',' + (absolute % 100n).toString().padStart(2, '0') + ' €'
}

export function savingsBalance(goal: SavingsGoal) {
  return goal.movements.reduce((total, movement) =>
    total + (movement.type === 'contribution' ? movement.amountCents : -movement.amountCents), 0n)
}

export function savingsContributed(goal: SavingsGoal, userId: string) {
  return goal.movements.reduce((total, movement) =>
    total + (movement.type === 'contribution' && movement.contributorUserId === userId ? movement.amountCents : 0n), 0n)
}

export function savingsProgress(balance: bigint, target: bigint | null) {
  return target ? Number((balance * 100n + target / 2n) / target) : null
}

// Exact largest-remainder allocation; stable user id breaks equal remainders.
export function savingsTargetShares(target: bigint, participants: SavingsParticipant[]) {
  const rows = participants.map(p => ({
    userId: p.userId,
    cents: target * BigInt(p.percentage) / 100n,
    remainder: target * BigInt(p.percentage) % 100n,
  }))
  let remaining = target - rows.reduce((sum, row) => sum + row.cents, 0n)
  const ordered = [...rows].sort((a, b) =>
    a.remainder === b.remainder ? a.userId.localeCompare(b.userId) : a.remainder > b.remainder ? -1 : 1)
  for (const row of ordered) {
    if (remaining <= 0n) break
    row.cents += 1n
    remaining -= 1n
  }
  return new Map(rows.map(row => [row.userId, row.cents]))
}
