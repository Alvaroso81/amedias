import { useEffect, useRef } from 'react'
import type { ExpenseType } from '../types/finance'

type Props = {
  target: ExpenseType
  isSaving: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function ExpenseConversionDialog({ target, isSaving, error, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element?.showModal()
    cancel.current?.focus()
    return () => {
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={dialog} className="inline-conversion-dialog" aria-labelledby="conversion-title"
    aria-describedby="conversion-description" onCancel={(event) => {
      event.preventDefault()
      if (!isSaving) onCancel()
    }}>
    <h2 id="conversion-title">{target === 'personal' ? 'Convertir en gasto personal' : 'Convertir en gasto común'}</h2>
    <p id="conversion-description">{target === 'personal'
      ? 'Este gasto dejará de ser visible para los demás miembros del hogar y dejará de formar parte de las cuentas comunes.'
      : 'Al convertir este gasto en común, será visible para los demás miembros del hogar y podrá afectar al balance.'}</p>
    {error && <p className="inline-expense-error" role="alert">{error}</p>}
    <div className="inline-conversion-actions">
      <button type="button" disabled={isSaving} onClick={onConfirm}>
        {isSaving ? 'Guardando…' : target === 'personal' ? 'Convertir en personal' : 'Convertir y guardar'}
      </button>
      <button ref={cancel} type="button" disabled={isSaving} onClick={onCancel}>Cancelar</button>
    </div>
  </dialog>
}
