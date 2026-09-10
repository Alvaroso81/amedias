export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export type ReceiptCategory = { id: string; name: string }
export type ReceiptScanResult = {
  merchant: string | null
  totalCents: number | null
  date: string | null
  suggestedCategoryId: string | null
  confidence: { merchant: number; total: number; date: number; category: number }
}

export function validateReceipt(value: unknown, categoryIds: string[]): ReceiptScanResult {
  if (!value || typeof value !== 'object') throw new Error('Invalid receipt')
  const r = value as Record<string, unknown>
  const c = r.confidence as Record<string, unknown> | undefined
  if (!c || ['merchant', 'total', 'date', 'category'].some((key) =>
    typeof c[key] !== 'number' || !Number.isFinite(c[key]) || c[key] < 0 || c[key] > 1)) {
    throw new Error('Invalid confidence')
  }
  const confidence: ReceiptScanResult['confidence'] = {
    merchant: c.merchant as number, total: c.total as number,
    date: c.date as number, category: c.category as number,
  }
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    && Number.isFinite(Date.parse(r.date)) && new Date(r.date).toISOString().slice(0, 10) === r.date
    && r.date >= '1900-01-01' ? r.date : null
  return {
    merchant: typeof r.merchant === 'string' && confidence.merchant >= 0.7
      ? r.merchant.trim().slice(0, 160) || null : null,
    totalCents: typeof r.totalCents === 'number' && Number.isSafeInteger(r.totalCents)
      && r.totalCents > 0 && r.totalCents <= 999999999999 && confidence.total >= 0.85 ? r.totalCents : null,
    date: confidence.date >= 0.8 ? date : null,
    suggestedCategoryId: typeof r.suggestedCategoryId === 'string' && confidence.category >= 0.75
      && categoryIds.includes(r.suggestedCategoryId) ? r.suggestedCategoryId : null,
    confidence,
  }
}
