import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createSettlement,
  SettlementServiceError,
  updateSettlement,
} from '../services/settlements'
import type { ExpenseReadMember, SettlementRecord } from '../types/expenseRead'
import type { SettlementDirection } from '../types/settlement'
import { formatCurrency } from '../utils/formatCurrency'
import { getSettlementMemberName } from '../utils/settlementPresentation'

type SettlementDialogProps = {
  householdId: string
  members: ExpenseReadMember[]
  direction?: SettlementDirection
  initialSettlement?: SettlementRecord
  onCancel: () => void
  onSaved: (settlementId: string) => void | Promise<void>
}

type FormErrors = Partial<Record<'from' | 'to' | 'amount' | 'date', string>>

function getLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function SettlementDialog({
  householdId,
  members,
  direction,
  initialSettlement,
  onCancel,
  onSaved,
}: SettlementDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const isEditing = Boolean(initialSettlement)
  const [fromUserId, setFromUserId] = useState(
    initialSettlement?.fromUserId ?? direction?.fromUserId ?? '',
  )
  const [toUserId, setToUserId] = useState(
    initialSettlement?.toUserId ?? direction?.toUserId ?? '',
  )
  const [amount, setAmount] = useState(
    String(initialSettlement?.amount ?? direction?.amount ?? ''),
  )
  const [date, setDate] = useState(
    initialSettlement?.settlementDate ?? getLocalDate,
  )
  const [note, setNote] = useState(initialSettlement?.note ?? '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const numericAmount = Number(amount)
  const pendingBalance = direction?.amount ?? 0
  const isOverpayment =
    !isEditing && Number.isFinite(numericAmount) && numericAmount > pendingBalance
  const fromName = getSettlementMemberName(members, fromUserId)
  const toName = getSettlementMemberName(members, toUserId)

  useEffect(() => {
    amountInputRef.current?.focus()

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onCancel()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      )
      if (!focusableElements?.length) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [isSaving, onCancel])

  const clearError = (field: keyof FormErrors) => {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  const validate = () => {
    const nextErrors: FormErrors = {}

    if (!members.some((member) => member.userId === fromUserId)) {
      nextErrors.from = 'Selecciona quién entrega el dinero'
    }

    if (!members.some((member) => member.userId === toUserId)) {
      nextErrors.to = 'Selecciona quién recibe el dinero'
    } else if (fromUserId === toUserId) {
      nextErrors.to = 'Las personas deben ser diferentes'
    }

    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      nextErrors.amount = 'Introduce un importe mayor que 0'
    }

    if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      nextErrors.date = 'Selecciona una fecha válida'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    if (isSaving) return
    if (!validate()) return

    setIsSaving(true)

    try {
      const settlementId = initialSettlement
        ? await updateSettlement({
            settlementId: initialSettlement.id,
            fromUserId,
            toUserId,
            amount: numericAmount,
            settlementDate: date,
            note: note.trim(),
          })
        : await createSettlement({
            householdId,
            fromUserId,
            toUserId,
            amount: numericAmount,
            settlementDate: date,
            note: note.trim(),
          })

      await onSaved(settlementId)
    } catch (error) {
      setSubmitError(
        error instanceof SettlementServiceError
          ? error.message
          : isEditing
            ? 'No hemos podido actualizar la liquidación.'
            : 'No hemos podido registrar la liquidación.',
      )
      setIsSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop settlement-dialog-backdrop">
      <section
        ref={dialogRef}
        className="settlement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settlement-dialog-title"
      >
        <header className="settlement-dialog-header">
          <div>
            <span>{isEditing ? 'Liquidación' : 'Saldar cuentas'}</span>
            <h2 id="settlement-dialog-title">
              {isEditing ? 'Editar liquidación' : `${fromName} → ${toName}`}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={isSaving}
            onClick={onCancel}
          >
            ×
          </button>
        </header>

        {!isEditing && (
          <div className="settlement-pending-balance">
            <span>Saldo pendiente</span>
            <strong>{formatCurrency(pendingBalance)}</strong>
          </div>
        )}

        <form className="settlement-form" onSubmit={handleSubmit} noValidate>
          {isEditing && (
            <div className="settlement-parties-grid">
              <div className="form-field">
                <label htmlFor="settlement-from">Entrega</label>
                <div className="select-wrap">
                  <select
                    id="settlement-from"
                    value={fromUserId}
                    aria-invalid={Boolean(errors.from)}
                    aria-describedby={errors.from ? 'settlement-from-error' : undefined}
                    onChange={(event) => {
                      setFromUserId(event.target.value)
                      clearError('from')
                      clearError('to')
                    }}
                  >
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.from && (
                  <p className="field-error" id="settlement-from-error">
                    {errors.from}
                  </p>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="settlement-to">Recibe</label>
                <div className="select-wrap">
                  <select
                    id="settlement-to"
                    value={toUserId}
                    aria-invalid={Boolean(errors.to)}
                    aria-describedby={errors.to ? 'settlement-to-error' : undefined}
                    onChange={(event) => {
                      setToUserId(event.target.value)
                      clearError('to')
                    }}
                  >
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.to && (
                  <p className="field-error" id="settlement-to-error">
                    {errors.to}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="form-field settlement-amount-field">
            <label htmlFor="settlement-amount">Cantidad</label>
            <div className="settlement-amount-input">
              <input
                ref={amountInputRef}
                id="settlement-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                required
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? 'settlement-amount-error' : undefined}
                onChange={(event) => {
                  setAmount(event.target.value)
                  clearError('amount')
                }}
              />
              <span aria-hidden="true">€</span>
            </div>
            {errors.amount && (
              <p className="field-error" id="settlement-amount-error">
                {errors.amount}
              </p>
            )}
          </div>

          {isOverpayment && (
            <p className="settlement-warning" role="status">
              Esta cantidad supera el saldo pendiente. Después de la liquidación, el saldo
              quedará a favor de {fromName}.
            </p>
          )}

          <div className="form-field">
            <label htmlFor="settlement-date">Fecha</label>
            <input
              id="settlement-date"
              type="date"
              value={date}
              required
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? 'settlement-date-error' : undefined}
              onChange={(event) => {
                setDate(event.target.value)
                clearError('date')
              }}
            />
            {errors.date && (
              <p className="field-error" id="settlement-date-error">
                {errors.date}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="settlement-note">Nota</label>
            <textarea
              id="settlement-note"
              rows={3}
              value={note}
              placeholder="Añadir una nota opcional..."
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {submitError && (
            <p className="expense-submit-error" role="alert">
              {submitError}
            </p>
          )}

          <button className="save-expense-button" type="submit" disabled={isSaving}>
            {isSaving
              ? 'Guardando...'
              : isEditing
                ? 'Guardar cambios'
                : 'Registrar liquidación'}
          </button>
        </form>
      </section>
    </div>
  )
}
