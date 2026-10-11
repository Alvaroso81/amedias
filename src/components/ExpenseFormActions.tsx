type ExpenseFormActionsProps = {
  onCancel: () => void
  isSaving: boolean
  saveLabel?: string
}

export function ExpenseFormActions({ onCancel, isSaving, saveLabel = 'Guardar gasto' }: ExpenseFormActionsProps) {
  return (
    <div className="expense-form-actions" role="group" aria-label="Acciones del gasto">
      <button className="expense-cancel-button" type="button" disabled={isSaving} onClick={onCancel}>
        Cancelar
      </button>
      <button className="save-expense-button" type="submit" disabled={isSaving}>
        {isSaving ? 'Guardando…' : saveLabel}
      </button>
      <span className="visually-hidden" role="status">{isSaving ? 'Guardando el gasto. Espera un momento.' : ''}</span>
    </div>
  )
}
