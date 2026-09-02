const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  timeZone: 'Europe/Madrid',
})

const longDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Madrid',
})

const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Madrid',
})

function parseLocalDate(date: string) {
  return new Date(`${date}T12:00:00`)
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function formatLongDate(date: string) {
  return longDateFormatter.format(parseLocalDate(date))
}

export function formatShortDate(date: string) {
  return shortDateFormatter.format(parseLocalDate(date)).replace('.', '')
}

export function formatExpenseGroupDate(date: string) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const day = parseLocalDate(date).getDate()
  const month = monthFormatter.format(parseLocalDate(date)).toLocaleUpperCase('es-ES')
  const dateLabel = `${day} ${month}`

  if (date === toLocalIsoDate(today)) return `HOY · ${dateLabel}`
  if (date === toLocalIsoDate(yesterday)) return `AYER · ${dateLabel}`

  return dateLabel
}

export function formatRelativeExpenseDate(date: string) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date === toLocalIsoDate(today)) return 'Hoy'
  if (date === toLocalIsoDate(yesterday)) return 'Ayer'

  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(parseLocalDate(date))
}

export function formatMonthYear(date: Date) {
  const parts = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
  }).formatToParts(date)
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const year = parts.find((part) => part.type === 'year')?.value ?? ''

  return `${month.charAt(0).toLocaleUpperCase('es-ES')}${month.slice(1)} ${year}`.trim()
}

export function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getTodayIsoDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((datePart) => datePart.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
}

export function getFirstDayOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`
}
