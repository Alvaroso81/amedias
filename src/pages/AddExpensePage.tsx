import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ExpenseSavedConfirmation } from '../components/ExpenseSavedConfirmation'
import { useExpenseFormData } from '../hooks/useExpenseFormData'
import { createExpense, ExpenseServiceError, updateExpense } from '../services/expenses'
import type {
  ExpenseCategory,
  ExpenseMember,
  SavedExpenseSummary,
} from '../types/expenseCreation'
import type { ExpenseType } from '../types/finance'
import type { PaymentSource } from '../types/commonFund'
import type { ExpenseRecord } from '../types/expenseRead'
import { calculateExpenseSplits } from '../utils/calculateExpenseSplits'
import { getCommonFundSplits } from '../utils/expenseEditing'
import { formatCurrency } from '../utils/formatCurrency'

type AddExpensePageProps = {
  householdId: string
  currentUserId: string
  commonFundBalance: number
  commonFundEnabled: boolean
  commonFundLoading: boolean
  onOpenCommonFund: () => void
  initialExpense?: ExpenseRecord
  onBack: () => void
  onCreated?: () => void | Promise<void>
  onUpdated?: (expenseId: string) => void | Promise<void>
}

type FormErrors = Partial<
  Record<'amount' | 'description' | 'category' | 'paidBy' | 'split' | 'date', string>
>

type SplitValues = Record<string, string>

function getLocalDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getInitialSplits(members: ExpenseMember[], initialExpense?: ExpenseRecord) {
  if (initialExpense) {
    return Object.fromEntries(
      members.map((member) => {
        const savedSplit = initialExpense.splits.find(
          (split) => split.userId === member.userId,
        )
        const percentage =
          savedSplit?.sharePercent ??
          (initialExpense.amount > 0 && savedSplit
            ? Number(((savedSplit.shareAmount / initialExpense.amount) * 100).toFixed(2))
            : 0)

        return [member.userId, String(percentage)]
      }),
    )
  }

  if (members.length === 1) {
    return { [members[0].userId]: '100' }
  }

  return Object.fromEntries(
    members.map((member) => [member.userId, String(member.defaultShare)]),
  )
}

export function AddExpensePage({
  householdId,
  currentUserId,
  commonFundBalance,
  commonFundEnabled,
  commonFundLoading,
  onOpenCommonFund,
  initialExpense,
  onBack,
  onCreated,
  onUpdated,
}: AddExpensePageProps) {
  const isEditing = Boolean(initialExpense)
  const formData = useExpenseFormData(householdId)

  if (!householdId || !currentUserId) {
    return (
      <ExpenseFormState
        message="No hemos podido identificar tu hogar."
        onBack={onBack}
      />
    )
  }

  if (formData.loading) {
    return (
      <ExpenseFormState
        loading
        message="Cargando categorías y miembros…"
        onBack={onBack}
        isEditing={isEditing}
      />
    )
  }

  if (formData.error) {
    return (
      <ExpenseFormState
        message={formData.error}
        onBack={onBack}
        onRetry={() => void formData.reload()}
        isEditing={isEditing}
      />
    )
  }

  return (
    <ExpenseForm
      householdId={householdId}
      currentUserId={currentUserId}
      commonFundBalance={commonFundBalance}
      commonFundEnabled={commonFundEnabled}
      commonFundLoading={commonFundLoading}
      onOpenCommonFund={onOpenCommonFund}
      initialExpense={initialExpense}
      categories={formData.categories}
      members={formData.members}
      onBack={onBack}
      onCreated={onCreated}
      onUpdated={onUpdated}
    />
  )
}

type ExpenseFormStateProps = {
  message: string
  loading?: boolean
  onBack: () => void
  onRetry?: () => void
  isEditing?: boolean
}

function ExpenseFormState({
  message,
  loading = false,
  onBack,
  onRetry,
  isEditing = false,
}: ExpenseFormStateProps) {
  return (
    <div className="add-expense-page">
      <ExpensePageHeader
        onBack={onBack}
        title={isEditing ? 'Editar gasto' : 'Nuevo gasto'}
        isEditing={isEditing}
      />
      <section className="card expense-form-state-card" aria-live="polite">
        {loading && <span className="loading-spinner" aria-hidden="true" />}
        <p>{message}</p>
        {onRetry && (
          <button className="auth-secondary-button" type="button" onClick={onRetry}>
            Volver a intentar
          </button>
        )}
      </section>
    </div>
  )
}

type ExpenseFormProps = {
  householdId: string
  currentUserId: string
  commonFundBalance: number
  commonFundEnabled: boolean
  commonFundLoading: boolean
  onOpenCommonFund: () => void
  categories: ExpenseCategory[]
  members: ExpenseMember[]
  initialExpense?: ExpenseRecord
  onBack: () => void
  onCreated?: () => void | Promise<void>
  onUpdated?: (expenseId: string) => void | Promise<void>
}

function ExpenseForm({
  householdId,
  currentUserId,
  commonFundBalance,
  commonFundEnabled,
  commonFundLoading,
  onOpenCommonFund,
  categories,
  members,
  initialExpense,
  onBack,
  onCreated,
  onUpdated,
}: ExpenseFormProps) {
  const isEditing = Boolean(initialExpense)
  const defaultPayerId =
    initialExpense?.payments[0]?.userId ??
    members.find((member) => member.userId === currentUserId)?.userId ??
    members[0]?.userId ??
    ''
  const [amount, setAmount] = useState(() =>
    initialExpense ? String(initialExpense.amount) : '',
  )
  const [description, setDescription] = useState(initialExpense?.description ?? '')
  const [categoryId, setCategoryId] = useState(initialExpense?.categoryId ?? '')
  const [paidByUserId, setPaidByUserId] = useState(defaultPayerId)
  const [paymentSource, setPaymentSource] = useState<PaymentSource>(
    initialExpense?.paymentSource ?? 'member',
  )
  const [split, setSplit] = useState<SplitValues>(() => getInitialSplits(members, initialExpense))
  const [isSplitOpen, setIsSplitOpen] = useState(Boolean(initialExpense))
  const [date, setDate] = useState(initialExpense?.expenseDate ?? getLocalDate)
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(
    Boolean(initialExpense && (initialExpense.expenseType === 'personal' || initialExpense.note)),
  )
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    initialExpense?.expenseType ?? 'common',
  )
  const [note, setNote] = useState(initialExpense?.note ?? '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [savedExpense, setSavedExpense] = useState<SavedExpenseSummary | null>(null)

  const usesCommonFund = paymentSource === 'common_fund'
  const numericAmount = Number(amount)
  const fundHasInsufficientBalance =
    usesCommonFund && Number.isFinite(numericAmount) && numericAmount > commonFundBalance
  const splitEntries = members.map((member) => ({
    member,
    value: usesCommonFund
      ? '50'
      : expenseType === 'personal'
        ? (member.userId === paidByUserId ? '100' : '0')
        : split[member.userId] ?? '',
  }))
  const splitTotal = splitEntries.reduce((total, entry) => total + Number(entry.value), 0)
  const splitIsValid =
    splitEntries.length > 0 &&
    splitEntries.every(
      (entry) =>
        entry.value !== '' &&
        Number(entry.value) >= 0 &&
        Number(entry.value) <= 100,
    ) &&
    Math.abs(splitTotal - 100) < 0.001

  useEffect(() => {
    if (!savedExpense || isEditing || !onCreated) return

    const returnTimer = window.setTimeout(() => void onCreated(), 1000)

    return () => window.clearTimeout(returnTimer)
  }, [isEditing, onCreated, savedExpense])

  const clearError = (field: keyof FormErrors) => {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  const handleSplitChange = (userId: string, value: string) => {
    clearError('split')

    if (value === '') {
      setSplit((currentSplit) => ({ ...currentSplit, [userId]: '' }))
      return
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue)) return

    const normalizedValue = Math.min(100, Math.max(0, parsedValue))

    if (members.length === 2) {
      const otherMember = members.find((member) => member.userId !== userId)

      if (otherMember) {
        setSplit({
          [userId]: String(normalizedValue),
          [otherMember.userId]: String(Number((100 - normalizedValue).toFixed(2))),
        })
        return
      }
    }

    setSplit((currentSplit) => ({
      ...currentSplit,
      [userId]: String(normalizedValue),
    }))
  }

  const validateForm = () => {
    const nextErrors: FormErrors = {}
    const numericAmount = Number(amount)

    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      nextErrors.amount = 'Introduce un importe mayor que 0'
    }

    if (!description.trim()) {
      nextErrors.description = 'Introduce un concepto'
    }

    if (!categoryId || !categories.some((category) => category.id === categoryId)) {
      nextErrors.category = 'Selecciona una categoría'
    }

    if (usesCommonFund) {
      if (!commonFundEnabled || members.length !== 2) {
        nextErrors.paidBy = 'El fondo común no está disponible'
      }
      if (fundHasInsufficientBalance) {
        nextErrors.amount = 'Saldo insuficiente en el fondo común.'
      }
    } else if (!paidByUserId || !members.some((member) => member.userId === paidByUserId)) {
      nextErrors.paidBy = 'Selecciona quién ha pagado'
    }

    if (!splitIsValid) {
      nextErrors.split = 'El reparto debe sumar 100 %'
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

    if (!validateForm()) return

    const numericAmount = Number(amount)
    const selectedCategory = categories.find((category) => category.id === categoryId)
    const selectedPayer = members.find((member) => member.userId === paidByUserId)

    if (!selectedCategory || (!usesCommonFund && !selectedPayer)) return

    setIsSaving(true)

    try {
      const effectiveExpenseType: ExpenseType = usesCommonFund ? 'common' : expenseType
      const splits = calculateExpenseSplits(
        numericAmount,
        members,
        usesCommonFund ? getCommonFundSplits(members) : split,
        effectiveExpenseType,
        paidByUserId,
      )

      if (isEditing && initialExpense) {
        if (!onUpdated) {
          throw new ExpenseServiceError('No hemos podido preparar la edición del gasto.')
        }

        const expenseId = await updateExpense({
          expenseId: initialExpense.id,
          description: description.trim(),
          amount: numericAmount,
          categoryId,
          expenseDate: date,
          expenseType: effectiveExpenseType,
          note: note.trim(),
          paymentSource,
          payments: usesCommonFund ? [] : [{ userId: paidByUserId, amount: numericAmount }],
          splits,
        })

        await onUpdated(expenseId)
        return
      }

      if (!onCreated) {
        throw new ExpenseServiceError(
          'No hemos podido identificar tu hogar para guardar el gasto.',
        )
      }

      const expenseId = await createExpense({
        householdId,
        description: description.trim(),
        amount: numericAmount,
        categoryId,
        expenseDate: date,
        expenseType: effectiveExpenseType,
        note: note.trim(),
        paymentSource,
        paidByUserId: usesCommonFund ? null : paidByUserId,
        payerAmount: usesCommonFund ? null : numericAmount,
        splits,
      })

      setSavedExpense({
        id: expenseId,
        amount: numericAmount,
        description: description.trim(),
        paidBy: usesCommonFund ? 'Fondo común' : (selectedPayer?.displayName ?? 'Miembro'),
      })
    } catch (error) {
      setSubmitError(
        error instanceof ExpenseServiceError
          ? error.message
          : isEditing
            ? 'No hemos podido actualizar el gasto. Inténtalo de nuevo.'
            : 'No hemos podido guardar el gasto. Inténtalo de nuevo.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (savedExpense) {
    return (
      <div className="add-expense-page">
        <ExpensePageHeader onBack={onBack} title="Nuevo gasto" />
        <ExpenseSavedConfirmation expense={savedExpense} />
      </div>
    )
  }

  return (
    <div className="add-expense-page">
      <ExpensePageHeader
        onBack={onBack}
        title={isEditing ? 'Editar gasto' : 'Nuevo gasto'}
        isEditing={isEditing}
      />

      <form className="add-expense-form" onSubmit={handleSubmit} noValidate>
        <section className="card amount-card">
          <label htmlFor="expense-amount">Importe</label>
          <div className="amount-input-wrap">
            <input
              id="expense-amount"
              className="amount-input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={amount}
              placeholder="0,00"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'expense-amount-error' : undefined}
              onChange={(event) => {
                setAmount(event.target.value)
                clearError('amount')
              }}
            />
            <span aria-hidden="true">€</span>
          </div>
          {errors.amount && (
            <p className="field-error" id="expense-amount-error">
              {errors.amount}
            </p>
          )}
        </section>

        <section className="card form-card">
          <div className="form-field">
            <label htmlFor="expense-description">Concepto</label>
            <input
              id="expense-description"
              type="text"
              value={description}
              placeholder="Mercadona, cena, gasolina..."
              autoComplete="off"
              required
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'expense-description-error' : undefined}
              onChange={(event) => {
                setDescription(event.target.value)
                clearError('description')
              }}
            />
            {errors.description && (
              <p className="field-error" id="expense-description-error">
                {errors.description}
              </p>
            )}
          </div>

          <div className="form-divider" />

          <div className="form-field">
            <label htmlFor="expense-category">Categoría</label>
            <div className="select-wrap">
              <select
                id="expense-category"
                value={categoryId}
                required
                aria-invalid={Boolean(errors.category)}
                aria-describedby={errors.category ? 'expense-category-error' : undefined}
                onChange={(event) => {
                  setCategoryId(event.target.value)
                  clearError('category')
                }}
              >
                <option value="">Selecciona una categoría</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
            {errors.category && (
              <p className="field-error" id="expense-category-error">
                {errors.category}
              </p>
            )}
          </div>
        </section>

        <section className="card form-card sharing-card">
          <fieldset className="form-field form-fieldset">
            <legend>¿Cómo se ha pagado?</legend>
            <div className="segmented-control payer-control">
              <button
                className={usesCommonFund ? 'segment-button segment-button--active' : 'segment-button'}
                type="button"
                disabled={commonFundLoading || !commonFundEnabled || members.length !== 2 || expenseType === 'personal'}
                aria-pressed={usesCommonFund}
                onClick={() => {
                  setPaymentSource('common_fund')
                  setExpenseType('common')
                  setSplit(getCommonFundSplits(members))
                  setIsSplitOpen(false)
                  clearError('paidBy')
                  clearError('split')
                }}
              >
                Fondo común
              </button>
              {members.map((member) => (
                <button
                  className={
                    !usesCommonFund && paidByUserId === member.userId
                      ? 'segment-button segment-button--active'
                      : 'segment-button'
                  }
                  type="button"
                  aria-pressed={!usesCommonFund && paidByUserId === member.userId}
                  key={member.userId}
                  onClick={() => {
                    setPaymentSource('member')
                    setPaidByUserId(member.userId)
                    clearError('paidBy')
                  }}
                >
                  {member.displayName}
                </button>
              ))}
            </div>
            {errors.paidBy && <p className="field-error">{errors.paidBy}</p>}
            <p className="fund-payment-balance">
              Fondo disponible: <strong>{commonFundLoading ? 'Cargando…' : formatCurrency(commonFundBalance)}</strong>
            </p>
            {fundHasInsufficientBalance && (
              <div className="fund-insufficient-message" role="alert">
                <span>Saldo insuficiente en el fondo común.</span>
                <button type="button" onClick={onOpenCommonFund}>Recargar fondo</button>
              </div>
            )}
          </fieldset>

          <div className="form-divider" />

          <fieldset className="form-field form-fieldset split-fieldset">
            <legend>¿Cómo se reparte?</legend>
            <div
              className="split-summary"
              aria-label={splitEntries
                .map((entry) => `${entry.member.displayName} ${entry.value || 0} por ciento`)
                .join(', ')}
            >
              {splitEntries.map((entry) => (
                <div key={entry.member.userId}>
                  <span>{entry.member.displayName}</span>
                  <strong>{entry.value || 0} %</strong>
                </div>
              ))}
            </div>

            {usesCommonFund ? (
              <p className="personal-split-note">El fondo común pertenece al 50 % a cada uno.</p>
            ) : expenseType === 'common' ? (
              <button
                className="inline-action"
                type="button"
                aria-expanded={isSplitOpen}
                aria-controls="custom-split"
                onClick={() => setIsSplitOpen((isOpen) => !isOpen)}
              >
                {isSplitOpen ? 'Ocultar reparto' : 'Personalizar reparto'}
              </button>
            ) : (
              <p className="personal-split-note">El gasto corresponde íntegramente al pagador.</p>
            )}

            {isSplitOpen && !usesCommonFund && expenseType === 'common' && (
              <div className="split-input-grid" id="custom-split">
                {members.map((member) => (
                  <label key={member.userId}>
                    <span>{member.displayName}</span>
                    <span className="percentage-input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="0.01"
                        value={split[member.userId] ?? ''}
                        aria-label={`Porcentaje de ${member.displayName}`}
                        aria-invalid={!splitIsValid}
                        aria-describedby={!splitIsValid ? 'expense-split-error' : undefined}
                        onChange={(event) => handleSplitChange(member.userId, event.target.value)}
                      />
                      <span aria-hidden="true">%</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {(errors.split || (isSplitOpen && !usesCommonFund && !splitIsValid)) && (
              <p className="field-error" id="expense-split-error">
                El reparto debe sumar 100 %
              </p>
            )}
          </fieldset>

          <div className="form-divider" />

          <div className="form-field">
            <label htmlFor="expense-date">Fecha</label>
            <input
              id="expense-date"
              type="date"
              value={date}
              required
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? 'expense-date-error' : undefined}
              onChange={(event) => {
                setDate(event.target.value)
                clearError('date')
              }}
            />
            {errors.date && (
              <p className="field-error" id="expense-date-error">
                {errors.date}
              </p>
            )}
          </div>
        </section>

        <section className="card more-options-card">
          <button
            className="more-options-toggle"
            type="button"
            aria-expanded={isMoreOptionsOpen}
            aria-controls="more-expense-options"
            onClick={() => setIsMoreOptionsOpen((isOpen) => !isOpen)}
          >
            <span>Más opciones</span>
            <span className="toggle-symbol" aria-hidden="true">
              {isMoreOptionsOpen ? '−' : '+'}
            </span>
          </button>

          {isMoreOptionsOpen && (
            <div className="more-options-content" id="more-expense-options">
              <div className="form-divider" />
              <fieldset className="form-field form-fieldset">
                <legend>Tipo de gasto</legend>
                <div className="segmented-control">
                  <button
                    className={
                      expenseType === 'common'
                        ? 'segment-button segment-button--active'
                        : 'segment-button'
                    }
                    type="button"
                    aria-pressed={expenseType === 'common'}
                    onClick={() => {
                      setExpenseType('common')
                      clearError('split')
                    }}
                  >
                    Común
                  </button>
                  <button
                    className={
                      expenseType === 'personal'
                        ? 'segment-button segment-button--active'
                        : 'segment-button'
                    }
                    type="button"
                    aria-pressed={expenseType === 'personal'}
                    disabled={usesCommonFund}
                    onClick={() => {
                      setExpenseType('personal')
                      setPaymentSource('member')
                      clearError('split')
                    }}
                  >
                    Personal
                  </button>
                </div>
              </fieldset>

              <div className="form-field note-field">
                <label htmlFor="expense-note">Nota</label>
                <textarea
                  id="expense-note"
                  rows={3}
                  value={note}
                  placeholder="Añadir una nota..."
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </div>
          )}
        </section>

        {submitError && (
          <p className="expense-submit-error" role="alert">
            {submitError}
          </p>
        )}

        <button className="save-expense-button" type="submit" disabled={isSaving || fundHasInsufficientBalance}>
          {isSaving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar gasto'}
        </button>
      </form>
    </div>
  )
}

type ExpensePageHeaderProps = {
  title: string
  onBack: () => void
  isEditing?: boolean
}

function ExpensePageHeader({ title, onBack, isEditing = false }: ExpensePageHeaderProps) {
  return (
    <header className="add-expense-header">
      <button
        className="back-button"
        type="button"
        onClick={onBack}
        aria-label={isEditing ? 'Volver al detalle del gasto' : 'Volver a Inicio'}
      >
        <span aria-hidden="true">←</span>
      </button>
      <h1>{title}</h1>
    </header>
  )
}
