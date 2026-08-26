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
