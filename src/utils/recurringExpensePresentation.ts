import type { RecurringFrequency } from '../types/recurringExpenses'

type RecurringSchedule = {
  frequency: RecurringFrequency
  intervalCount: number
  anchorDay: number
  anchorMonth: number
}

const monthNames = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function formatRecurringSchedule({
  frequency,
  intervalCount,
  anchorDay,
  anchorMonth,
}: RecurringSchedule) {
  if (frequency === 'weekly') {
    return intervalCount === 1 ? 'Cada semana' : `Cada ${intervalCount} semanas`
  }

  if (frequency === 'monthly') {
    return `${intervalCount === 1 ? 'Cada mes' : `Cada ${intervalCount} meses`} · día ${anchorDay}`
  }

  const frequencyLabel = intervalCount === 1 ? 'Cada año' : `Cada ${intervalCount} años`
  return `${frequencyLabel} · ${anchorDay} ${monthNames[anchorMonth - 1] ?? ''}`.trim()
}
