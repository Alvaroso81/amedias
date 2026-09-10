import { validateReceipt } from '../types/receiptScan'
import type { ReceiptCategory, ReceiptScanResult } from '../types/receiptScan'
import { merchantAliases, normalizeReceiptText as normalize, plausibleMerchant } from './merchantAliases'

export type ReceiptOcrBlock = { index: number; text: string; confidence: number }
const excludedTotal = /\b(SUB\s*TOTAL|IVA|CAMBIO|EFECTIVO|ENTREGADO|DESCUENTO|AHORRO|BASE|TARJETA|PAGADO|ARTICULOS|UNIDADES|PRODUCTOS)\b/
const totalLabel = /\b(TOTAL\s+A\s+PAGAR|IMPORTE\s+TOTAL|TOTAL\s+EUR|A\s+PAGAR|TOTAL)\b/

function amounts(line: string): number[] {
  return [...line.matchAll(/(?<![\d.,/-])(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}(?![\d.,/%])/g)]
    .map((match) => Number(match[0].replace(/[.,]/g, '')))
    .filter((cents) => Number.isSafeInteger(cents) && cents > 0 && cents <= 999999999999)
}

// Preserve photo order and position. Collapse consecutive duplicates and exact
// suffix/prefix overlap only; never discard distinct totals or dates globally.
export function receiptLines(blocks: ReceiptOcrBlock[]) {
  const result: { text: string; photo: number; firstPhoto: number; firstLine: number; confidence: number }[] = []
  for (const [photo, block] of blocks.entries()) {
    const lines = block.text.slice(0, 100000).split(/\r?\n/).map((text) => text.trim()).filter(Boolean)
      .filter((text, i, all) => i === 0 || normalize(text) !== normalize(all[i - 1]))
    let overlap = 0
    for (let length = 1; length <= Math.min(result.length, lines.length, 30); length++) {
      if (lines.slice(0, length).every((text, i) => normalize(text) === normalize(result[result.length - length + i].text))) overlap = length
    }
    // Keep overlapping lines in the later photo context (important for final total).
    const previous = overlap ? result.splice(result.length - overlap, overlap) : []
    lines.forEach((text, line) => result.push({
      text, photo, firstPhoto: previous[line]?.firstPhoto ?? photo,
      firstLine: previous[line]?.firstLine ?? line,
      confidence: Math.max(previous[line]?.confidence ?? 0, block.confidence),
    }))
  }
  return result
}

export function parseReceiptBlocks(blocks: ReceiptOcrBlock[], categories: ReceiptCategory[]): ReceiptScanResult {
  if (!blocks.length || blocks.length > 5) throw new Error('Se necesitan entre 1 y 5 fotos.')
  const lines = receiptLines(blocks)
  const totals: { cents: number; score: number }[] = []
  const dates: { date: string; score: number }[] = []
  const merchants: { name: string; score: number }[] = []
  lines.forEach((entry, position) => {
    if (entry.confidence < 65) return
    const normalized = normalize(entry.text)
    const alias = merchantAliases.find((alias) => alias.pattern.test(normalized))
    if (alias) merchants.push({ name: alias.name, score: .95 - entry.firstPhoto * .02 })
    // Unknown names are only considered near the top of the first photo.
    else if (entry.firstPhoto === 0 && entry.firstLine < 8 && plausibleMerchant(entry.text)) {
      merchants.push({ name: entry.text, score: .78 - entry.firstLine * .008 })
    }
    const label = normalized.match(totalLabel)
    if (label && !excludedTotal.test(normalized) && !/[$£%]|\b(USD|GBP)\b|[-−]\s*\d/.test(normalized)) {
      let values = amounts(normalized.slice((label.index ?? 0) + label[0].length))
      let score = /A\s+PAGAR|IMPORTE\s+TOTAL|TOTAL\s+EUR/.test(label[0]) ? .97 : .90
      if (!values.length && lines[position + 1] && lines[position + 1].confidence >= 65
        && /^[€\s\d.,]+(?:EUR)?$/i.test(lines[position + 1].text)) {
        values = amounts(lines[position + 1].text); score -= .04
      }
      score += blocks.length > 1 ? .035 * entry.photo / (blocks.length - 1) : 0
      score += .008 * position / Math.max(1, lines.length - 1)
      if (values.length === 1) totals.push({ cents: values[0], score: Math.min(.99, score) })
    }
    if (!/\b(CADUCIDAD|VENCIMIENTO|VALIDO|VALIDEZ)\b/.test(normalized)) {
      for (const match of entry.text.matchAll(/\b(\d{2})([/.-])(\d{2})\2(\d{4}|\d{2})\b/g)) {
        const year = match[4].length === 2 ? `20${match[4]}` : match[4]
        const date = `${year}-${match[3]}-${match[1]}`
        if (Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date) {
          dates.push({ date, score: .92 - entry.firstPhoto * .015 })
        }
      }
    }
  })
  totals.sort((a, b) => b.score - a.score)
  dates.sort((a, b) => b.score - a.score)
  merchants.sort((a, b) => b.score - a.score)
  const total = totals[0]
  const date = dates[0]
  const merchant = merchants[0]
  const totalSafe = total && !totals.some((other) => other.cents !== total.cents && total.score - other.score < .025)
  const dateSafe = date && !dates.some((other) => other.date !== date.date && date.score - other.score < .01)
  const merchantSafe = merchant && !merchants.some((other) => other.name !== merchant.name && merchant.score - other.score < .015)
  const name = merchantSafe ? merchant.name : null
  const alias = merchantAliases.find((alias) => alias.name === name)
  const categoryNames = alias?.categories ?? (/\b(BAR|RESTAURANTE)\b/.test(normalize(name ?? ''))
    ? ['RESTAURANTES', 'RESTAURACION'] : [])
  const matching = categories.filter((category) => categoryNames.includes(normalize(category.name)))
  return validateReceipt({
    merchant: name, totalCents: totalSafe ? total.cents : null,
    date: dateSafe ? date.date : null,
    suggestedCategoryId: matching.length === 1 ? matching[0].id : null,
    confidence: {
      merchant: merchantSafe ? merchant.score : 0, total: totalSafe ? total.score : 0,
      date: dateSafe ? date.score : 0, category: name && matching.length === 1 ? .8 : 0,
    },
  }, categories.map((category) => category.id))
}

export function parseReceipt(text: string, categories: ReceiptCategory[], ocrConfidence = 100): ReceiptScanResult {
  return parseReceiptBlocks([{ index: 0, text, confidence: ocrConfidence }], categories)
}
