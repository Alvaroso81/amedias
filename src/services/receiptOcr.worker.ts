import { createWorker, OEM, PSM } from 'tesseract.js'
import { parseReceiptBlocks } from '../utils/receiptParser'
import type { ReceiptOcrBlock } from '../utils/receiptParser'
import type { ReceiptCategory } from '../types/receiptScan'

// Owned outer worker lets the UI terminate the entire worker tree even while
// Tesseract's asynchronous createWorker is still loading its engine/language.
self.onmessage = async (event: MessageEvent<{ images: (Blob | null)[]; categories: ReceiptCategory[] }>) => {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined
  let index = 0
  const { images, categories } = event.data
  try {
    if (images.length < 1 || images.length > 5) throw new Error('Invalid image count')
    worker = await createWorker('spa', OEM.LSTM_ONLY, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int',
      cacheMethod: 'write', // Caches only the public language model, never receipts.
      logger: (message) => self.postMessage({ type: 'progress', value: message.status === 'recognizing text'
        ? `Analizando foto ${index + 1} de ${images.length}… ${Math.round(message.progress * 100)}%` : 'Cargando OCR… La primera vez puede tardar más.' }),
      errorHandler: () => self.postMessage({ type: 'error' }),
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const blocks: ReceiptOcrBlock[] = []
    for (index = 0; index < images.length; index++) {
      self.postMessage({ type: 'progress', value: `Analizando foto ${index + 1} de ${images.length}…` })
      const image = images[index]
      if (!image) throw new Error('Missing image')
      const { data } = await worker.recognize(image, {}, { text: true })
      blocks.push({ index, text: data.text, confidence: data.confidence })
      images[index] = null
    }
    self.postMessage({ type: 'progress', value: 'Interpretando ticket…' })
    const result = parseReceiptBlocks(blocks, categories)
    if (!result.merchant && !result.totalCents && !result.date) self.postMessage({ type: 'error' })
    else self.postMessage({ type: 'result', result })
  } catch {
    self.postMessage({ type: 'error' })
  } finally { await worker?.terminate() }
}
