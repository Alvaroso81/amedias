import './EditableExpenseDetails.css'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useExpenseFormData } from '../hooks/useExpenseFormData'
import { ExpenseServiceError, updateExpense } from '../services/expenses'
import type { ExpenseCategory, ExpenseMember } from '../types/expenseCreation'
import type { ExpenseRecord } from '../types/expenseRead'
import type { ExpenseType } from '../types/finance'
import {
  buildExpenseUpdateInput,
  createExpenseEditDraft,
  getCommonFundSplits,
  getDefaultExpenseSplits,
  updateExpenseSplitPercentages,
} from '../utils/expenseEditing'
import type { ExpenseEditDraft } from '../utils/expenseEditing'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'

type EditableField =
  | 'description'
  | 'amount'
  | 'category'
  | 'payer'
  | 'split'
  | 'date'
  | 'type'
  | 'note'

type EditableExpenseDetailsProps = {
  expense: ExpenseRecord
  householdId: string
  currentUserId: string
  commonFundBalance: number
  commonFundEnabled: boolean
  commonFundLoading: boolean
  onUpdated: (expenseId: string) => void | Promise<void>
}

function hasAtMostTwoDecimals(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
}

function validateDraft(
  draft: ExpenseEditDraft,
  categories: ExpenseCategory[],
  members: ExpenseMember[],
  commonFundBalance: number,
  commonFundEnabled: boolean,
  originalExpense: ExpenseRecord,
) {
  const amount = Number(draft.amount)

  if (!draft.description.trim()) return 'El concepto es obligatorio.'
  if (!draft.amount || !Number.isFinite(amount) || amount <= 0) {
    return 'Introduce un importe mayor que 0.'
  }
  if (amount > 9999999999.99 || !hasAtMostTwoDecimals(amount)) {
    return 'El importe debe tener como máximo dos decimales.'
  }
  if (!categories.some((category) => category.id === draft.categoryId)) {
    return 'Selecciona una categoría activa.'
  }
  if (draft.paymentSource === 'common_fund') {
    if (!commonFundEnabled || members.length !== 2) return 'El fondo común no está disponible.'
    const availableBalance = commonFundBalance +
      (originalExpense.paymentSource === 'common_fund' ? originalExpense.amount : 0)
    if (amount > availableBalance) return 'No hay suficiente dinero en el fondo común.'
  } else if (!members.some((member) => member.userId === draft.paidByUserId)) {
    return 'Selecciona quién ha pagado.'
  }
  if (!draft.expenseDate || Number.isNaN(new Date(`${draft.expenseDate}T12:00:00`).getTime())) {
    return 'Selecciona una fecha válida.'
  }

  if (draft.expenseType === 'common' && draft.paymentSource === 'member') {
    const percentages = members.map((member) => draft.splits[member.userId] ?? '')
    const parsedPercentages = percentages.map(Number)
    const hasInvalidPercentage = percentages.some((percentage, index) => {
      const parsedPercentage = parsedPercentages[index]

      return (
        percentage === '' ||
        !Number.isFinite(parsedPercentage) ||
        parsedPercentage < 0 ||
        parsedPercentage > 100 ||
        !hasAtMostTwoDecimals(parsedPercentage)
      )
    })
    const total = parsedPercentages.reduce((sum, percentage) => sum + percentage, 0)

    if (hasInvalidPercentage || Math.abs(total - 100) >= 0.001) {
      return 'El reparto debe sumar 100 %.'
    }
  }

  return null
}

export function EditableExpenseDetails({
  expense,
  householdId,
  currentUserId,
  commonFundBalance,
  commonFundEnabled,
  commonFundLoading,
  onUpdated,
}: EditableExpenseDetailsProps) {
  const formData = useExpenseFormData(householdId)
  const [activeField, setActiveField] = useState<EditableField | null>(null)
  const [draft, setDraft] = useState<ExpenseEditDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingConversion, setPendingConversion] = useState<ExpenseType | null>(null)
  const canEdit = !formData.loading && !formData.error
  const canRestorePersonal = expense.personalOriginOwnerId === currentUserId

  const startEditing = (field: EditableField) => {
    if (!canEdit || isSaving) return
    if (expense.expenseType === 'personal' && (field === 'payer' || field === 'split')) return

    setDraft(createExpenseEditDraft(expense, formData.members))
    setSaveError(null)
    setActiveField(field)
  }

  const cancelEditing = () => {
    if (isSaving) return

    setActiveField(null)
    setDraft(null)
    setSaveError(null)
    setPendingConversion(null)
  }

  const saveEditing = async (confirmedConversion: ExpenseType | null = null) => {
    if (!draft || isSaving) return
    const validationError = validateDraft(
      draft,
      formData.categories,
      formData.members,
      commonFundBalance,
      commonFundEnabled,
      expense,
    )

    if (validationError) {
      setSaveError(validationError)
      return
    }

    const conversionTarget =
      expense.expenseType === draft.expenseType ? null : draft.expenseType

    if (conversionTarget && confirmedConversion !== conversionTarget) {
      setPendingConversion(conversionTarget)
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      await updateExpense(buildExpenseUpdateInput(expense.id, draft, formData.members))
      await onUpdated(expense.id)
      setPendingConversion(null)
      setActiveField(null)
      setDraft(null)
    } catch (error) {
      setSaveError(error instanceof ExpenseServiceError ? error.message : 'No hemos podido actualizar el gasto.')
    } finally {
      setIsSaving(false)
    }
  }

  const updateDraft = (changes: Partial<ExpenseEditDraft>) => {
    setDraft((currentDraft) => currentDraft && { ...currentDraft, ...changes })
    setSaveError(null)
  }

  const handleSplitChange = (userId: string, value: string) => {
    if (!draft) return

    updateDraft({
      splits: updateExpenseSplitPercentages(
        formData.members,
        draft.splits,
        userId,
        value,
      ),
    })
  }

  const handleTypeChange = (expenseType: ExpenseType) => {
    if (!draft) return

    updateDraft({
      expenseType,
      paymentSource: expenseType === 'personal' ? 'member' : draft.paymentSource,
      paidByUserId: expenseType === 'personal' ? currentUserId : draft.paidByUserId,
      splits:
        expenseType === 'common' && draft.expenseType === 'personal'
          ? getDefaultExpenseSplits(formData.members)
          : expenseType === 'personal'
            ? Object.fromEntries(
                formData.members.map((member) => [
                  member.userId,
                  member.userId === currentUserId ? '100' : '0',
                ]),
              )
            : draft.splits,
    })
  }

  const renderEditor = (field: EditableField) => {
    if (!draft || activeField !== field) return null

    if (field === 'description') {
      return (
        <InlineEditor
          label="Concepto"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <input
            autoFocus
            type="text"
            value={draft.description}
            aria-label="Concepto"
            autoComplete="off"
            onChange={(event) => updateDraft({ description: event.target.value })}
          />
        </InlineEditor>
      )
    }

    if (field === 'amount') {
      return (
        <InlineEditor
          label="Importe"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <div className="inline-amount-input">
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={draft.amount}
              aria-label="Importe"
              onChange={(event) => updateDraft({ amount: event.target.value })}
            />
            <span aria-hidden="true">€</span>
          </div>
        </InlineEditor>
      )
    }

    if (field === 'category') {
      return (
        <InlineEditor
          label="Categoría"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <select
            autoFocus
            value={draft.categoryId}
            aria-label="Categoría"
            onChange={(event) => updateDraft({ categoryId: event.target.value })}
          >
            {formData.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icon} {category.name}
              </option>
            ))}
          </select>
        </InlineEditor>
      )
    }

    if (field === 'payer') {
      return (
        <InlineEditor
          label="Pagado con"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <div className="segmented-control inline-segmented-control">
            <button
              className={draft.paymentSource === 'common_fund' ? 'segment-button segment-button--active' : 'segment-button'}
              type="button"
              disabled={commonFundLoading || !commonFundEnabled || formData.members.length !== 2}
              aria-pressed={draft.paymentSource === 'common_fund'}
              onClick={() => updateDraft({
                paymentSource: 'common_fund',
                expenseType: 'common',
                splits: getCommonFundSplits(formData.members),
              })}
            >
              Fondo común
            </button>
            {formData.members.map((member) => (
              <button
                className={
                  draft.paymentSource === 'member' && draft.paidByUserId === member.userId
                    ? 'segment-button segment-button--active'
                    : 'segment-button'
                }
                type="button"
                aria-pressed={draft.paymentSource === 'member' && draft.paidByUserId === member.userId}
                key={member.userId}
                onClick={() => updateDraft({ paymentSource: 'member', paidByUserId: member.userId })}
              >
                {member.displayName}
              </button>
            ))}
          </div>
          <p className="inline-fund-balance">Disponible: {formatCurrency(commonFundBalance)}</p>
        </InlineEditor>
      )
    }

    if (field === 'split') {
      return (
        <InlineEditor
          label="Reparto"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          {draft.paymentSource === 'common_fund' ? (
            <p className="inline-personal-note">
              El fondo común se reparte siempre al 50 %. Este reparto no modifica el balance personal.
            </p>
          ) : draft.expenseType === 'personal' ? (
            <p className="inline-personal-note">
              El gasto personal corresponde al 100 % al pagador. Cambia el tipo a Común para editar el reparto.
            </p>
          ) : (
            <div className="split-input-grid inline-split-inputs">
              {formData.members.map((member) => (
                <label key={member.userId}>
                  <span>{member.displayName}</span>
                  <span className="percentage-input-wrap">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={draft.splits[member.userId] ?? ''}
                      aria-label={`Porcentaje de ${member.displayName}`}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => handleSplitChange(member.userId, event.target.value)}
                    />
                    <span aria-hidden="true">%</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </InlineEditor>
      )
    }

    if (field === 'date') {
      return (
        <InlineEditor
          label="Fecha"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <input
            autoFocus
            type="date"
            value={draft.expenseDate}
            aria-label="Fecha"
            onChange={(event) => updateDraft({ expenseDate: event.target.value })}
          />
        </InlineEditor>
      )
    }

    if (field === 'type') {
      return (
        <InlineEditor
          label="Tipo"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <div className="segmented-control inline-segmented-control">
            <button
              className={
                draft.expenseType === 'common'
                  ? 'segment-button segment-button--active'
                  : 'segment-button'
              }
              type="button"
              aria-pressed={draft.expenseType === 'common'}
              onClick={() => handleTypeChange('common')}
            >
              Común
            </button>
            {(expense.expenseType === 'personal' || canRestorePersonal) && (
              <button
                className={
                  draft.expenseType === 'personal'
                    ? 'segment-button segment-button--active'
                    : 'segment-button'
                }
                type="button"
                aria-pressed={draft.expenseType === 'personal'}
                onClick={() => handleTypeChange('personal')}
              >
                Personal
              </button>
            )}
          </div>
        </InlineEditor>
      )
    }

    return (
      <InlineEditor
        label="Nota"
        isSaving={isSaving}
        error={saveError}
        onSave={saveEditing}
        onCancel={cancelEditing}
      >
        <textarea
          autoFocus
          rows={3}
          value={draft.note}
          aria-label="Nota"
          placeholder="Añadir una nota..."
          onChange={(event) => updateDraft({ note: event.target.value })}
        />
      </InlineEditor>
    )
  }

  const renderRow = (
    field: EditableField,
    label: string,
    value: ReactNode,
    multiline = false,
  ) => (
    <div
      className={`detail-editable-row${multiline ? ' detail-editable-row--multiline' : ''}`}
      key={field}
    >
      {activeField === field ? (
        renderEditor(field)
      ) : (
        <button
          className="detail-edit-trigger"
          type="button"
          disabled={!canEdit || isSaving}
          aria-label={`Editar ${label}`}
          onClick={() => startEditing(field)}
        >
          <span>{label}</span>
          <strong>{value}</strong>
          <span className="detail-edit-chevron" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )

  return (
    <section className="card expense-detail-card" aria-label="Información editable del gasto">
      {formData.loading && (
        <p className="expense-inline-data-state" role="status">
          Preparando edición…
        </p>
      )}
      {formData.error && (
        <div className="expense-inline-data-error" role="alert">
          <span>No hemos podido preparar la edición.</span>
          <button type="button" onClick={() => void formData.reload()}>
            Reintentar
          </button>
        </div>
      )}

      {renderRow('description', 'Concepto', expense.description)}
      {renderRow('amount', 'Importe', formatCurrency(expense.amount))}
      {renderRow('category', 'Categoría', `${expense.category.icon} ${expense.category.name}`)}
      {renderRow(
        'payer',
        'Pagado con',
        expense.paymentSource === 'common_fund' ? (
          'Fondo común'
        ) : (
          <span className="detail-edit-value-lines">
            {expense.payments.length
              ? expense.payments.map((payment) => (
                  <span key={payment.userId}>{payment.displayName}</span>
                ))
              : 'Pagador no disponible'}
          </span>
        ),
      )}
      {renderRow(
        'split',
        'Reparto',
        <span className="detail-edit-value-lines">
          {expense.splits.length
            ? expense.splits.map((split) => (
                <span key={split.userId}>
                  {split.displayName}
                  {split.sharePercent === null ? '' : ` ${split.sharePercent} %`}
                  {' · '}
                  {formatCurrency(split.shareAmount)}
                </span>
              ))
            : 'Reparto no disponible'}
        </span>,
      )}
      {renderRow('date', 'Fecha', formatLongDate(expense.expenseDate))}
      {renderRow('type', 'Tipo', expense.expenseType === 'common' ? 'Común' : 'Personal')}
      {renderRow('note', 'Nota', expense.note || 'Añadir nota', true)}
      {pendingConversion && (
        <div className="inline-conversion-backdrop">
          <div className="inline-conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="conversion-title">
            <h2 id="conversion-title">
              {pendingConversion === 'personal'
                ? 'Convertir en gasto personal'
                : 'Convertir en gasto común'}
            </h2>
            <p>
              {pendingConversion === 'personal'
                ? 'Este gasto dejará de ser visible para los demás miembros del hogar y dejará de formar parte de las cuentas comunes.'
                : 'Al convertir este gasto en común, será visible para los demás miembros del hogar y podrá afectar al balance.'}
            </p>
            <div className="inline-conversion-actions">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveEditing(pendingConversion)}
              >
                {isSaving
                  ? 'Guardando...'
                  : pendingConversion === 'personal'
                    ? 'Convertir en personal'
                    : 'Convertir y guardar'}
              </button>
              <button type="button" disabled={isSaving} onClick={() => setPendingConversion(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

type InlineEditorProps = {
  label: string
  isSaving: boolean
  error: string | null
  onSave: () => void | Promise<void>
  onCancel: () => void
  children: ReactNode
}

function InlineEditor({
  label,
  isSaving,
  error,
  onSave,
  onCancel,
  children,
}: InlineEditorProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSave()
  }

  return (
    <form className="inline-expense-editor" onSubmit={handleSubmit} noValidate>
      <div className="inline-expense-editor__header">
        <span>{label}</span>
        {isSaving && <span role="status">Guardando...</span>}
      </div>
      {children}
      {error && (
        <p className="inline-expense-error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-expense-actions">
        <button className="inline-save-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
        <button type="button" disabled={isSaving} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
