import { MAX_IMAGE_BYTES } from '../types/receiptScan'
import type { ReceiptCategory, ReceiptScanResult } from '../types/receiptScan'
export type { ReceiptScanResult } from '../types/receiptScan'

export async function prepareReceiptImage(file: File, signal: AbortSignal): Promise<Blob> {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('Elige una imagen de menos de 15 MB.')
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)
    && !(file.type === '' && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) {
    throw new Error('Usa una foto JPEG, PNG o WebP. No se admiten PDF.')
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  try {
    img.src = url
    await img.decode() // Native browser decoding applies EXIF orientation.
    signal.throwIfAborted()
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 60000000) {
      throw new Error('La resolución es demasiado grande. Elige una foto más pequeña.')
    }
    const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No se pudo preparar la imagen.')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(img, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.86, 0.76]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
        signal.throwIfAborted()
        if (blob && blob.size <= MAX_IMAGE_BYTES) return blob
      }
      throw new Error('La imagen sigue siendo demasiado grande. Recorta el ticket y vuelve a intentarlo.')
    } finally { canvas.width = 0; canvas.height = 0 }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'EncodingError') {
      throw new Error('Este navegador no puede abrir la foto. Prueba con JPEG, PNG o una captura de pantalla.', { cause: error })
    }
    throw error
  } finally { img.src = ''; URL.revokeObjectURL(url) }
}

export type ReceiptScanEngine = (
  images: Blob[], categories: ReceiptCategory[], signal: AbortSignal,
  onProgress?: (message: string) => void,
) => Promise<ReceiptScanResult>

export async function scanReceipt(
  images: Blob[], categories: ReceiptCategory[], signal: AbortSignal,
  onProgress?: (message: string) => void, engine?: ReceiptScanEngine,
) {
  if (images.length < 1 || images.length > 5 || images.some((image) => !image.size || image.size > MAX_IMAGE_BYTES)) {
    throw new Error('Añade entre 1 y 5 fotos preparadas de hasta 2 MB cada una.')
  }
  const scanner = engine ?? (await import('./localReceiptOcr')).localReceiptOcr
  signal.throwIfAborted()
  return scanner(images, categories, signal, onProgress)
}
