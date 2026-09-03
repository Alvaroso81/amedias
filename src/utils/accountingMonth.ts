const accountingMonthPattern = /^(\d{4})-(\d{2})-01$/
const expenseDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

function toAccountingMonth(year: number, zeroBasedMonth: number) {
  const date = new Date(Date.UTC(year, zeroBasedMonth, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function calculateAccountingMonth(expenseDate: string, startDay: number) {
  const match = expenseDatePattern.exec(expenseDate)

  if (!match || !Number.isInteger(startDay) || startDay < 1 || startDay > 28) {
    throw new Error('No se puede calcular el mes contable.')
  }

  const [, rawYear, rawMonth, rawDay] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new Error('No se puede calcular el mes contable.')
  }

  const monthOffset = startDay > 1 && day >= startDay ? 1 : 0
  return toAccountingMonth(year, month - 1 + monthOffset)
}

export function formatAccountingMonth(accountingMonth: string) {
  const match = accountingMonthPattern.exec(accountingMonth)
  if (!match) return accountingMonth

  const [, rawYear, rawMonth] = match
  const date = new Date(Number(rawYear), Number(rawMonth) - 1, 1)
  const formatted = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
  }).format(date).replace(' de ', ' ')

  return `${formatted.charAt(0).toLocaleUpperCase('es-ES')}${formatted.slice(1)}`
}

export function getNaturalAccountingMonth(expenseDate: string) {
  return `${expenseDate.slice(0, 7)}-01`
}

export function accountingMonthDiffersFromExpenseDate(
  accountingMonth: string,
  expenseDate: string,
) {
  return accountingMonth !== getNaturalAccountingMonth(expenseDate)
}

export function changeAccountingMonthPart(
  accountingMonth: string,
  part: 'month' | 'year',
  value: number,
) {
  const match = accountingMonthPattern.exec(accountingMonth)
  if (!match) return accountingMonth

  const year = part === 'year' ? value : Number(match[1])
  const month = part === 'month' ? value : Number(match[2])

  if (year < 1900 || year > 2200 || month < 1 || month > 12) return accountingMonth

  return `${year}-${String(month).padStart(2, '0')}-01`
}
