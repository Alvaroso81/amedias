const currencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
})

const wholeCurrencyFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  useGrouping: true,
})

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount)
}

export function formatWholeCurrency(amount: number) {
  return wholeCurrencyFormatter.format(amount)
}
