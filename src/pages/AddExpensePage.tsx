import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ExpenseSavedConfirmation } from '../components/ExpenseSavedConfirmation'
import type { Expense, ExpenseType, PaidBy } from '../types/finance'
import { expenseCategories } from './expenseOptions'

type AddExpensePageProps = {
  initialExpense?: Expense
  onBack: () => void
  onExpenseSaved: (expense: Expense) => void
}

type FormErrors = Partial<
  Record<'amount' | 'description' | 'category' | 'paidBy' | 'split' | 'date', string>
>

type SplitValues = {
  alvaro: string
  marta: string
}

function getLocalDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function AddExpensePage({
  initialExpense,
  onBack,
  onExpenseSaved,
}: AddExpensePageProps) {
  const isEditing = Boolean(initialExpense)
  const [amount, setAmount] = useState(() =>
    initialExpense ? String(initialExpense.amount) : '',
  )
  const [description, setDescription] = useState(initialExpense?.description ?? '')
  const [category, setCategory] = useState(initialExpense?.category ?? '')
  const [paidBy, setPaidBy] = useState<PaidBy>(initialExpense?.paidBy ?? 'Álvaro')
  const [split, setSplit] = useState<SplitValues>(() => ({
    alvaro: String(initialExpense?.split.alvaro ?? 50),
    marta: String(initialExpense?.split.marta ?? 50),
  }))
  const [isSplitOpen, setIsSplitOpen] = useState(
    Boolean(initialExpense && (initialExpense.split.alvaro !== 50 || initialExpense.split.marta !== 50)),
  )
  const [date, setDate] = useState(initialExpense?.date ?? getLocalDate)
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(
    Boolean(initialExpense && (initialExpense.expenseType === 'personal' || initialExpense.note)),
  )
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    initialExpense?.expenseType ?? 'common',
  )
  const [note, setNote] = useState(initialExpense?.note ?? '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null)

  const alvaroSplit = Number(split.alvaro)
  const martaSplit = Number(split.marta)
  const splitIsValid =
    split.alvaro !== '' &&
    split.marta !== '' &&
    alvaroSplit >= 0 &&
    alvaroSplit <= 100 &&
    martaSplit >= 0 &&
    martaSplit <= 100 &&
    Math.abs(alvaroSplit + martaSplit - 100) < 0.001

  useEffect(() => {
    if (!savedExpense || isEditing) return

    const returnTimer = window.setTimeout(() => onExpenseSaved(savedExpense), 1000)

    return () => window.clearTimeout(returnTimer)
  }, [isEditing, onExpenseSaved, savedExpense])

  const clearError = (field: keyof FormErrors) => {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) return currentErrors

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  const handleSplitChange = (person: keyof SplitValues, value: string) => {
    clearError('split')

    if (value === '') {
      setSplit((currentSplit) => ({ ...currentSplit, [person]: '' }))
      return
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue)) return

    const normalizedValue = Math.min(100, Math.max(0, parsedValue))
    const otherPerson = person === 'alvaro' ? 'marta' : 'alvaro'

    setSplit({
      [person]: String(normalizedValue),
      [otherPerson]: String(Number((100 - normalizedValue).toFixed(2))),
    } as SplitValues)
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

    if (!category) {
      nextErrors.category = 'Selecciona una categoría'
    }

    if (!paidBy) {
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateForm()) return

    const selectedCategory = expenseCategories.find((option) => option.name === category)
    const expense: Expense = {
      id: initialExpense?.id ?? crypto.randomUUID(),
      amount: Number(amount),
      description: description.trim(),
      category,
      paidBy,
      date,
      split: { alvaro: alvaroSplit, marta: martaSplit },
      expenseType,
      note: note.trim(),
      createdAt: initialExpense?.createdAt ?? new Date().toISOString(),
      icon: selectedCategory?.icon ?? '📦',
      displayDate: initialExpense?.displayDate,
    }

    console.log(expense)

    if (isEditing) {
      onExpenseSaved(expense)
      return
    }

    setSavedExpense(expense)
  }

  return (
    <div className="add-expense-page">
      <header className="add-expense-header">
        <button
          className="back-button"
          type="button"
          onClick={onBack}
          aria-label={isEditing ? 'Volver al detalle del gasto' : 'Volver a Inicio'}
        >
          <span aria-hidden="true">←</span>
        </button>
        <h1>{isEditing ? 'Editar gasto' : 'Nuevo gasto'}</h1>
      </header>

      {savedExpense ? (
        <ExpenseSavedConfirmation expense={savedExpense} onUndo={() => setSavedExpense(null)} />
      ) : (
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
                  value={category}
                  required
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={errors.category ? 'expense-category-error' : undefined}
                  onChange={(event) => {
                    setCategory(event.target.value)
                    clearError('category')
                  }}
                >
                  <option value="">Selecciona una categoría</option>
                  {expenseCategories.map((option) => (
                    <option value={option.name} key={option.name}>
                      {option.icon} {option.name}
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
              <legend>¿Quién ha pagado?</legend>
              <div className="segmented-control payer-control">
                {(['Álvaro', 'Marta'] as PaidBy[]).map((person) => (
                  <button
                    className={paidBy === person ? 'segment-button segment-button--active' : 'segment-button'}
                    type="button"
                    aria-pressed={paidBy === person}
                    key={person}
                    onClick={() => {
                      setPaidBy(person)
                      clearError('paidBy')
                    }}
                  >
                    {person}
                  </button>
                ))}
              </div>
              {errors.paidBy && <p className="field-error">{errors.paidBy}</p>}
            </fieldset>

            <div className="form-divider" />

            <fieldset className="form-field form-fieldset split-fieldset">
              <legend>¿Cómo se reparte?</legend>
              <div className="split-summary" aria-label={`Álvaro ${split.alvaro} por ciento, Marta ${split.marta} por ciento`}>
                <div>
                  <span>Álvaro</span>
                  <strong>{split.alvaro || 0} %</strong>
                </div>
                <div>
                  <span>Marta</span>
                  <strong>{split.marta || 0} %</strong>
                </div>
              </div>
              <button
                className="inline-action"
                type="button"
                aria-expanded={isSplitOpen}
                aria-controls="custom-split"
                onClick={() => setIsSplitOpen((isOpen) => !isOpen)}
              >
                {isSplitOpen ? 'Ocultar reparto' : 'Personalizar reparto'}
              </button>

              {isSplitOpen && (
                <div className="split-input-grid" id="custom-split">
                  <label>
                    <span>Álvaro</span>
                    <span className="percentage-input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="1"
                        value={split.alvaro}
                        aria-label="Porcentaje de Álvaro"
                        aria-invalid={!splitIsValid}
                        aria-describedby={!splitIsValid ? 'expense-split-error' : undefined}
                        onChange={(event) => handleSplitChange('alvaro', event.target.value)}
                      />
                      <span aria-hidden="true">%</span>
                    </span>
                  </label>
                  <label>
                    <span>Marta</span>
                    <span className="percentage-input-wrap">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="1"
                        value={split.marta}
                        aria-label="Porcentaje de Marta"
                        aria-invalid={!splitIsValid}
                        aria-describedby={!splitIsValid ? 'expense-split-error' : undefined}
                        onChange={(event) => handleSplitChange('marta', event.target.value)}
                      />
                      <span aria-hidden="true">%</span>
                    </span>
                  </label>
                </div>
              )}
              {(errors.split || (isSplitOpen && !splitIsValid)) && (
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
                      className={expenseType === 'common' ? 'segment-button segment-button--active' : 'segment-button'}
                      type="button"
                      aria-pressed={expenseType === 'common'}
                      onClick={() => setExpenseType('common')}
                    >
                      Común
                    </button>
                    <button
                      className={expenseType === 'personal' ? 'segment-button segment-button--active' : 'segment-button'}
                      type="button"
                      aria-pressed={expenseType === 'personal'}
                      onClick={() => setExpenseType('personal')}
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

          <button className="save-expense-button" type="submit">
            {isEditing ? 'Guardar cambios' : 'Guardar gasto'}
          </button>
        </form>
      )}
    </div>
  )
}
