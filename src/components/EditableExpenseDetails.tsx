import './EditableExpenseDetails.css'
import { useEffect, useRef, useState } from 'react'
import { ExpenseFormActions } from './ExpenseFormActions'
import { ExpenseConversionDialog } from './ExpenseConversionDialog'
import type { FormEvent, ReactNode } from 'react'
import { AccountingMonthField } from './AccountingMonthField'
import { useExpenseFormData } from '../hooks/useExpenseFormData'
import { ExpenseServiceError, updateExpense } from '../services/expenses'
import type { ExpenseCategory, ExpenseMember } from '../types/expenseCreation'
import type { ExpenseRecord } from '../types/expenseRead'
import type { ExpenseType } from '../types/finance'
import {
  buildExpenseUpdateInput,
  createExpenseEditDraft,
  deriveExpenseType,
  getCommonFundSplits,
  getSolePayerSplits,
  isSolePayerSplit,
  updateExpenseSplitPercentages,
} from '../utils/expenseEditing'
import type { ExpenseEditDraft } from '../utils/expenseEditing'
import {
  calculateAccountingMonth,
  formatAccountingMonth,
} from '../utils/accountingMonth'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'

type EditableField =
  | 'description'
  | 'amount'
  | 'category'
  | 'payer'
  | 'split'
  | 'date'
  | 'accountingMonth'
  | 'note'

type EditableExpenseDetailsProps = {
  expense: ExpenseRecord
  householdId: string
  currentUserId: string
  accountingMonthStartDay: number
  commonFundBalance: number
  commonFundEnabled: boolean
  commonFundLoading: boolean
  onUpdated: (expenseId: string) => void | Promise<void>
  onEditingChange?: (editing: boolean) => void
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
  const keepsHistoricalCategory = draft.categoryId === originalExpense.categoryId
  if (
    !keepsHistoricalCategory &&
    !categories.some((category) => category.id === draft.categoryId)
  ) {
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
  if (!/^\d{4}-\d{2}-01$/.test(draft.accountingMonth)) {
    return 'Selecciona un mes contable válido.'
  }

  if (draft.paymentSource === 'member') {
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
  accountingMonthStartDay,
  commonFundBalance,
  commonFundEnabled,
  commonFundLoading,
  onUpdated,
  onEditingChange,
}: EditableExpenseDetailsProps) {
  const regionRef = useRef<HTMLElement>(null)
  const saveInFlight = useRef(false)
  const formData = useExpenseFormData(householdId)
  const [activeField, setActiveField] = useState<EditableField | null>(null)
  const [draft, setDraft] = useState<ExpenseEditDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingConversion, setPendingConversion] = useState<ExpenseType | null>(null)
  const [accountingMonthManuallyChanged, setAccountingMonthManuallyChanged] = useState(false)
  const canEdit = !formData.loading && !formData.error
  const canRestorePersonal = expense.personalOriginOwnerId === currentUserId

  const startEditing = (field: EditableField) => {
    if (!canEdit || isSaving) return
    setDraft(createExpenseEditDraft(expense, formData.members))
    setAccountingMonthManuallyChanged(
      expense.accountingMonth !==
        calculateAccountingMonth(expense.expenseDate, accountingMonthStartDay),
    )
    setSaveError(null)
    setActiveField(field)
    onEditingChange?.(true)
  }

  const restoreEditingFocus = () => {
    const field = activeField
    window.requestAnimationFrame(() => {
      regionRef.current?.querySelector<HTMLButtonElement>(`[data-edit-field="${field}"]`)?.focus()
    })
  }

  const cancelEditing = () => {
    if (isSaving) return

    setActiveField(null)
    setDraft(null)
    setSaveError(null)
    setPendingConversion(null)
    setAccountingMonthManuallyChanged(false)
    onEditingChange?.(false)
    restoreEditingFocus()
  }

  const saveEditing = async (confirmedConversion: ExpenseType | null = null) => {
    if (!draft || saveInFlight.current) return
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

    saveInFlight.current = true
    setIsSaving(true)
    setSaveError(null)

    try {
      await updateExpense(buildExpenseUpdateInput(expense.id, draft, formData.members))
      await onUpdated(expense.id)
      setPendingConversion(null)
      setActiveField(null)
      setDraft(null)
      setAccountingMonthManuallyChanged(false)
      onEditingChange?.(false)
      restoreEditingFocus()
    } catch (error) {
      setSaveError(error instanceof ExpenseServiceError ? error.message : 'No hemos podido actualizar el gasto.')
    } finally {
      saveInFlight.current = false
      setIsSaving(false)
    }
  }

  const updateDraft = (changes: Partial<ExpenseEditDraft>) => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft

      const nextDraft = { ...currentDraft, ...changes }

      return {
        ...nextDraft,
        expenseType: deriveExpenseType({
          paymentSource: nextDraft.paymentSource,
          paidByUserId: nextDraft.paidByUserId,
          currentUserId,
          members: formData.members,
          splits: nextDraft.splits,
          canBePersonal: canRestorePersonal,
        }),
      }
    })
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
            aria-invalid={Boolean(saveError)}
            aria-describedby={saveError ? 'expense-inline-error' : undefined}
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
              aria-invalid={Boolean(saveError)}
              aria-describedby={saveError ? 'expense-inline-error' : undefined}
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
            aria-invalid={Boolean(saveError)}
            aria-describedby={saveError ? 'expense-inline-error' : undefined}
            autoFocus
            value={draft.categoryId}
            aria-label="Categoría"
            onChange={(event) => updateDraft({ categoryId: event.target.value })}
          >
            {!formData.categories.some((category) => category.id === draft.categoryId) &&
              draft.categoryId === expense.categoryId && (
                <option value={draft.categoryId}>
                  {expense.category.icon} {expense.category.name} (inactiva)
                </option>
              )}
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
      const selectedPayer = formData.members.find(
        (member) => member.userId === draft.paidByUserId,
      )
      const hasEqualSplit =
        formData.members.length === 2 &&
        formData.members.every(
          (member) => Math.abs(Number(draft.splits[member.userId]) - 50) < 0.001,
        )
      const hasSolePayerSplit = isSolePayerSplit(
        formData.members,
        draft.splits,
        draft.paidByUserId,
      )
      const isOtherMemberSoleExpense =
        draft.paidByUserId !== currentUserId && hasSolePayerSplit
      const typeHint = draft.expenseType === 'personal'
        ? 'Solo tú podrás ver este gasto.'
        : isOtherMemberSoleExpense
          ? 'Los gastos personales solo puede registrarlos cada usuario desde su propia cuenta.'
          : 'Este gasto será compartido.'

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
          ) : (
            <>
              <div className="segmented-control inline-split-shortcuts" aria-label="Atajos de reparto">
                <button
                  className={
                    hasEqualSplit
                      ? 'segment-button segment-button--active'
                      : 'segment-button'
                  }
                  type="button"
                  aria-pressed={hasEqualSplit}
                  onClick={() => updateDraft({
                    splits: getCommonFundSplits(formData.members),
                  })}
                >
                  50 / 50
                </button>
                {selectedPayer && (
                  <button
                    className={
                      hasSolePayerSplit
                        ? 'segment-button segment-button--active'
                        : 'segment-button'
                    }
                    type="button"
                    aria-pressed={hasSolePayerSplit}
                    onClick={() => updateDraft({
                      splits: getSolePayerSplits(
                        formData.members,
                        selectedPayer.userId,
                      ),
                    })}
                  >
                    Solo {selectedPayer.displayName}
                  </button>
                )}
              </div>
              <div className="split-input-grid inline-split-inputs">
              {formData.members.map((member) => (
                <label key={member.userId}>
                  <span>{member.displayName}</span>
                  <span className="percentage-input-wrap">
                    <input
                      aria-invalid={Boolean(saveError)}
                      aria-describedby={saveError ? 'expense-inline-error' : undefined}
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
              <p className="inline-personal-note">{typeHint}</p>
            </>
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
            aria-invalid={Boolean(saveError)}
            aria-describedby={saveError ? 'expense-inline-error' : undefined}
            autoFocus
            type="date"
            value={draft.expenseDate}
            aria-label="Fecha"
            onChange={(event) => {
              const nextDate = event.target.value
              const changes: Partial<ExpenseEditDraft> = { expenseDate: nextDate }

              if (!accountingMonthManuallyChanged && nextDate) {
                try {
                  changes.accountingMonth = calculateAccountingMonth(
                    nextDate,
                    accountingMonthStartDay,
                  )
                } catch {
                  // The date validation handles incomplete native input values.
                }
              }

              updateDraft(changes)
            }}
          />
        </InlineEditor>
      )
    }

    if (field === 'accountingMonth') {
      const accountingMonthDraft = draft
      let automaticAccountingMonth = accountingMonthDraft.accountingMonth

      try {
        automaticAccountingMonth = calculateAccountingMonth(
          accountingMonthDraft.expenseDate,
          accountingMonthStartDay,
        )
      } catch {
        // The saved value remains selectable while the date is incomplete.
      }

      return (
        <InlineEditor
          label="Mes contable"
          isSaving={isSaving}
          error={saveError}
          onSave={saveEditing}
          onCancel={cancelEditing}
        >
          <AccountingMonthField
            errorId={saveError ? 'expense-inline-error' : undefined}
            id="inline-accounting-month"
            value={accountingMonthDraft.accountingMonth}
            automaticValue={automaticAccountingMonth}
            disabled={isSaving}
            onChange={(nextAccountingMonth) => {
              updateDraft({ accountingMonth: nextAccountingMonth })
              setAccountingMonthManuallyChanged(
                nextAccountingMonth !== automaticAccountingMonth,
              )
            }}
            onUseAutomatic={() => {
              updateDraft({ accountingMonth: automaticAccountingMonth })
              setAccountingMonthManuallyChanged(false)
            }}
          />
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
          aria-invalid={Boolean(saveError)}
          aria-describedby={saveError ? 'expense-inline-error' : undefined}
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
          disabled={!canEdit || isSaving || activeField !== null}
          data-edit-field={field}
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
    <section ref={regionRef} className="card expense-detail-card" aria-label="Información editable del gasto">
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
      {renderRow(
        'accountingMonth',
        'Mes contable',
        formatAccountingMonth(expense.accountingMonth),
      )}
      {renderRow('note', 'Nota', expense.note || 'Añadir nota', true)}
      {pendingConversion && (
        <ExpenseConversionDialog target={pendingConversion} isSaving={isSaving} error={saveError}
          onConfirm={() => void saveEditing(pendingConversion)} onCancel={() => setPendingConversion(null)} />
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
  const form = useRef<HTMLFormElement>(null)
  const focusEditor = () => {
    const control = form.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
      ?? form.current?.querySelector<HTMLElement>('fieldset button:not(:disabled)')
    control?.focus({ preventScroll: true })
    form.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  useEffect(() => { focusEditor() }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSave()
    window.requestAnimationFrame(() => {
      if (form.current?.querySelector('#expense-inline-error')) focusEditor()
    })
  }

  return (
    <form ref={form} className="inline-expense-editor" aria-label={`Editar ${label}`}
      aria-busy={isSaving} data-invalid={Boolean(error)} onSubmit={handleSubmit} noValidate>
      <div className="inline-expense-editor__header"><span>{label}</span></div>
      <fieldset className="inline-expense-fields" disabled={isSaving}
        aria-label={label} aria-invalid={Boolean(error)} aria-describedby={error ? 'expense-inline-error' : undefined}>
        {children}
      </fieldset>
      {error && <p className="inline-expense-error" id="expense-inline-error" role="alert">{error}</p>}
      <ExpenseFormActions onCancel={onCancel} isSaving={isSaving} saveLabel="Guardar cambios" />
    </form>
  )
}
