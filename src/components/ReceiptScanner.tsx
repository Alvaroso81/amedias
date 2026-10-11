import { useEffect, useRef, useState } from 'react'
import { prepareReceiptImage, scanReceipt } from '../services/receiptScanner'
import type { ReceiptScanResult } from '../services/receiptScanner'
import type { ReceiptCategory } from '../types/receiptScan'
import './ReceiptScanner.css'

type Props = { categories: ReceiptCategory[]; disabled: boolean; onResult: (result: ReceiptScanResult) => void }
type Photo = { id: number; blob: Blob; url: string }

export function ReceiptScanner({ categories, disabled, onResult }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const active = useRef<AbortController | null>(null)
  const photoRefs = useRef<Photo[]>([])
  const sequence = useRef(0)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState('Preparando fotos…')
  useEffect(() => () => {
    active.current?.abort()
    photoRefs.current.forEach((photo) => URL.revokeObjectURL(photo.url))
    photoRefs.current = []
  }, [])

  function close() {
    active.current?.abort()
    active.current = null
    photoRefs.current.forEach((photo) => URL.revokeObjectURL(photo.url))
    photoRefs.current = []
    setPhotos([]); setBusy(false); setError('')
    if (camera.current) camera.current.value = ''
    if (picker.current) picker.current.value = ''
    dialog.current?.close()
  }

  async function addPhotos(files: File[]) {
    if (!files.length || active.current) return
    if (files.length + photoRefs.current.length > 5) {
      setError('Puedes añadir un máximo de 5 fotos. Selecciona menos imágenes.')
      if (picker.current) picker.current.value = ''
      return
    }
    const controller = new AbortController()
    active.current = controller
    setBusy(true); setError(''); setProgress('Preparando fotos…')
    try {
      for (const file of files) {
        const blob = await prepareReceiptImage(file, controller.signal)
        if (active.current !== controller || controller.signal.aborted) return
        const photo = { id: sequence.current++, blob, url: URL.createObjectURL(blob) }
        photoRefs.current = [...photoRefs.current, photo]
        setPhotos(photoRefs.current)
      }
    } catch (error) {
      if (active.current === controller) setError(error instanceof Error ? error.message : 'No se pudo preparar la foto.')
    } finally {
      if (active.current === controller) {
        active.current = null; setBusy(false)
        if (camera.current) camera.current.value = ''
        if (picker.current) picker.current.value = ''
      }
    }
  }

  function removePhoto(id: number) {
    const removed = photoRefs.current.find((photo) => photo.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    photoRefs.current = photoRefs.current.filter((photo) => photo.id !== id)
    setPhotos(photoRefs.current); setError('')
  }

  async function analyze() {
    if (!photoRefs.current.length || active.current) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true); setError(''); setNotice('')
    setProgress('Analizando ticket… La primera carga del OCR puede tardar más.')
    const timer = setTimeout(() => controller.abort('timeout'), 120000 * photoRefs.current.length)
    try {
      const result = await scanReceipt(photoRefs.current.map((photo) => photo.blob), categories, controller.signal, (value) => {
        if (active.current === controller && !controller.signal.aborted) setProgress(value)
      })
      if (active.current !== controller || controller.signal.aborted) return
      onResult(result)
      close()
      setNotice([
        'Datos propuestos: revísalos antes de Guardar gasto.',
        !result.merchant ? 'No se pudo identificar el comercio. Escribe el concepto.' : '',
        !result.totalCents ? 'No hemos podido identificar el total. Revísalo manualmente.' : '',
        !result.date ? 'No se pudo detectar la fecha con seguridad; se ha usado hoy.' : '',
        !result.suggestedCategoryId ? 'Elige la categoría.' : '',
      ].filter(Boolean).join(' '))
    } catch (error) {
      if (active.current === controller) {
        setError(controller.signal.aborted ? 'El análisis está tardando demasiado. Inténtalo de nuevo.'
          : error instanceof Error ? error.message : 'No hemos podido leer el ticket.')
      }
    } finally {
      clearTimeout(timer)
      if (active.current === controller) { active.current = null; setBusy(false) }
    }
  }

  return (
    <section className="receipt-scanner">
      <button type="button" className="secondary-button" disabled={disabled || busy} aria-haspopup="dialog"
        onClick={() => { setError(''); dialog.current?.showModal() }}><span aria-hidden="true">📷</span> Escanear ticket</button>
      {notice && <p className="receipt-notice" role="status">{notice}</p>}
      <dialog ref={dialog} className="receipt-dialog" aria-labelledby="receipt-title"
        onCancel={(event) => { event.preventDefault(); close() }}>
        <h2 id="receipt-title">Escanear ticket</h2>
        <p>El escaneo básico se procesa en tu dispositivo. No subimos las fotos ni guardamos el texto leído.</p>
        <p>Añade de 1 a 5 fotos del mismo ticket, de arriba hacia abajo. Revisa los datos antes de guardar el gasto.</p>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden
          onChange={(event) => { void addPhotos(Array.from(event.target.files ?? [])) }} />
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden
          onChange={(event) => { void addPhotos(Array.from(event.target.files ?? [])) }} />
        {photos.length > 0 && <>
          <h3>Fotos del ticket ({photos.length}/5)</h3>
          <ol className="receipt-photos">
            {photos.map((photo, index) => <li key={photo.id}>
              <img src={photo.url} alt={`Foto ${index + 1} del ticket`} />
              <span>Foto {index + 1}</span>
              <button type="button" className="secondary-button" disabled={busy}
                aria-label={`Eliminar foto ${index + 1}`} onClick={() => removePhoto(photo.id)}>Eliminar</button>
            </li>)}
          </ol>
        </>}
        {busy ? <p role="status" aria-live="polite">{progress}</p> : <>
          {error && <p role="alert" className="field-error">{error}</p>}
          {photos.length < 5 && <>
            {photos.length > 0 && <h3>+ Añadir otra foto</h3>}
            <button type="button" className="secondary-button" onClick={() => camera.current?.click()}>Hacer foto</button>
            <button type="button" className="secondary-button" onClick={() => picker.current?.click()}>Elegir imagen</button>
          </>}
          <button type="button" className="primary-button" disabled={!photos.length}
            onClick={() => { void analyze() }}>{error && photos.length ? 'Intentar de nuevo · Analizar ticket' : 'Analizar ticket'}</button>
        </>}
        <p>La primera vez necesitas conexión para descargar el OCR en español.</p>
        <button type="button" className="secondary-button" onClick={close}>{error ? 'Introducir manualmente' : 'Cancelar'}</button>
      </dialog>
    </section>
  )
}
