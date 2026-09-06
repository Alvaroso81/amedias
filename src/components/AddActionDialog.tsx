import { useEffect, useRef } from 'react'

export function AddActionDialog({ onCancel, onExpense, onSavings }: {
  onCancel: () => void; onExpense: () => void; onSavings: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector('button')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel() }
      if (event.key !== 'Tab') return
      const buttons = ref.current?.querySelectorAll('button')
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
      previous?.focus()
    }
  }, [onCancel])
  return (
    <div className="dialog-backdrop savings-add-backdrop" onClick={event => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="card savings-add-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="add-action-title">
        <h2 id="add-action-title">¿Qué quieres añadir?</h2>
        <button type="button" className="savings-add-option" onClick={onExpense}><span aria-hidden="true">💸</span> Gasto</button>
        <button type="button" className="savings-add-option" onClick={onSavings}><span aria-hidden="true">💰</span> Ahorro</button>
        <button type="button" className="auth-secondary-button" onClick={onCancel}>Cancelar</button>
      </section>
    </div>
  )
}
