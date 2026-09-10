import { validateReceipt } from '../types/receiptScan'
import type { ReceiptScanEngine } from './receiptScanner'

export const localReceiptOcr: ReceiptScanEngine = (images, categories, signal, onProgress) => {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./receiptOcr.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', abort) }
    const fail = () => {
      cleanup()
      reject(new Error('No hemos podido leer el ticket. Comprueba la conexión si falta descargar el OCR, prueba otra foto o introdúcelo manualmente.'))
    }
    const abort = () => { cleanup(); reject(new DOMException('Escaneo cancelado', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = fail
    worker.onmessageerror = fail
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data.value)
      else if (data.type === 'result') {
        try {
          const result = validateReceipt(data.result, categories.map((category) => category.id))
          cleanup(); resolve(result)
        } catch { fail() }
      } else fail()
    }
    try { worker.postMessage({ images, categories }) } catch { fail() }
  })
}
