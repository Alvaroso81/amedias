import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ExpenseDataState } from '../components/ExpenseDataState'
import { useExpenseFormData } from '../hooks/useExpenseFormData'
import {
  createRecurringExpense,
  RecurringExpenseServiceError,
  setRecurringExpenseActive,
  skipRecurringOccurrence,
  updateRecurringExpense,
} from '../services/recurringExpenses'
import type { ExpenseMember } from '../types/expenseCreation'
import type { ExpenseType } from '../types/finance'
import type {
  RecurringExpense,
  RecurringExpenseOccurrence,
  RecurringFrequency,
} from '../types/recurringExpenses'
import {
  getCommonFundSplits,
  getDefaultExpenseSplits,
  getSolePayerSplits,
  updateExpenseSplitPercentages,
} from '../utils/expenseEditing'
import { formatCurrency } from '../utils/formatCurrency'
import { formatShortDate, getTodayIsoDate } from '../utils/formatDate'

type RecurringExpensesPageProps = {
  householdId: string
  currentUserId: string
  recurringExpenses: RecurringExpense[]
  pendingOccurrences: RecurringExpenseOccurrence[]
  commonFundEnabled: boolean
  loading: boolean
  error: string | null
  onBack: () => void
  onRetry: () => void
  onChanged: () => void | Promise<unknown>
  onReviewOccurrence: (occurrence: RecurringExpenseOccurrence) => void
}

const frequencyLabels: Record<RecurringFrequency, string> = {
  weekly: 'semana',
  monthly: 'mes',
  yearly: 'año',
}

function scheduleLabel(frequency: RecurringFrequency, intervalCount: number) {
  const unit = frequencyLabels[frequency]
  return intervalCount === 1 ? `Cada ${unit}` : `Cada ${intervalCount} ${unit}s`
}

export function RecurringExpensesPage({
  householdId,
  currentUserId,
  recurringExpenses,
  pendingOccurrences,
  commonFundEnabled,
  loading,
  error,
  onBack,
  onRetry,
  onChanged,
  onReviewOccurrence,
}: RecurringExpensesPageProps) {
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed')
  const [editingTemplate, setEditingTemplate] = useState<RecurringExpense | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const activeTemplates = recurringExpenses.filter((template) => template.isActive)
  const pausedTemplates = recurringExpenses.filter((template) => !template.isActive)

  const handleToggle = async (template: RecurringExpense) => {
    setActionId(template.id)
    setActionError(null)
    try {
      await setRecurringExpenseActive(template.id, !template.isActive)
      await onChanged()
    } catch (toggleError) {
      setActionError(
        toggleError instanceof RecurringExpenseServiceError
          ? toggleError.message
          : 'No hemos podido cambiar el estado.',
      )
    } finally {
      setActionId(null)
    }
  }

  const handleSkip = async (occurrence: RecurringExpenseOccurrence) => {
    if (!window.confirm(`¿Omitir “${occurrence.recurringExpense.description}” del ${formatShortDate(occurrence.dueDate)}?`)) {
      return
    }

    setActionId(occurrence.id)
    setActionError(null)
    try {
      await skipRecurringOccurrence(occurrence.id)
      await onChanged()
    } catch (skipError) {
      setActionError(
        skipError instanceof RecurringExpenseServiceError
          ? skipError.message
          : 'No hemos podido omitir este gasto.',
      )
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="recurring-page">
      <header className="add-expense-header recurring-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="Volver a Ajustes">
          <span aria-hidden="true">←</span>
        </button>
        <div>
          <span>Planificación</span>
          <h1>Gastos recurrentes</h1>
        </div>
      </header>

      {formMode !== 'closed' ? (
        <RecurringTemplateForm
          key={editingTemplate?.id ?? 'new-recurring'}
          householdId={householdId}
          currentUserId={currentUserId}
          commonFundEnabled={commonFundEnabled}
          initialTemplate={formMode === 'edit' ? editingTemplate : null}
          onCancel={() => {
            setFormMode('closed')
            setEditingTemplate(null)
          }}
          onSaved={async () => {
            await onChanged()
            setFormMode('closed')
            setEditingTemplate(null)
          }}
        />
      ) : (
        <>
          <button
            className="recurring-new-button"
            type="button"
            onClick={() => {
              setEditingTemplate(null)
              setFormMode('create')
            }}
          >
            <span aria-hidden="true">+</span> Nuevo recurrente
          </button>

          {actionError && <p className="expense-submit-error" role="alert">{actionError}</p>}

          {loading ? (
            <ExpenseDataState loading title="Cargando recurrentes" message="Estamos preparando tus plantillas…" />
          ) : error ? (
            <ExpenseDataState title="No hemos podido cargar los recurrentes" message={error} onRetry={onRetry} />
          ) : (
            <>
              {pendingOccurrences.length > 0 && (
                <section className="card recurring-section recurring-pending-section">
                  <div className="recurring-section-heading">
                    <div>
                      <span>Por revisar</span>
                      <h2>Pendientes</h2>
                    </div>
                    <strong>{pendingOccurrences.length}</strong>
                  </div>
                  <div className="recurring-list">
                    {pendingOccurrences.map((occurrence) => (
                      <article className="recurring-pending-row" key={occurrence.id}>
                        <div className="recurring-item-icon" aria-hidden="true">
                          {occurrence.recurringExpense.category.icon}
                        </div>
                        <div className="recurring-item-copy">
                          <strong>{occurrence.recurringExpense.description}</strong>
                          <span>{formatShortDate(occurrence.dueDate)} · {formatCurrency(occurrence.recurringExpense.amountCents / 100)}</span>
                        </div>
                        <div className="recurring-row-actions">
                          <button type="button" onClick={() => onReviewOccurrence(occurrence)}>Revisar</button>
                          <button
                            className="recurring-skip-button"
                            type="button"
                            disabled={actionId === occurrence.id}
                            onClick={() => void handleSkip(occurrence)}
                          >
                            {actionId === occurrence.id ? 'Omitiendo…' : 'Omitir'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <TemplateSection
                title="Activos"
                eyebrow="En curso"
                templates={activeTemplates}
                emptyMessage="Todavía no hay gastos recurrentes activos."
                actionId={actionId}
                onEdit={(template) => {
                  setEditingTemplate(template)
                  setFormMode('edit')
                }}
                onToggle={(template) => void handleToggle(template)}
              />
              {pausedTemplates.length > 0 && (
                <TemplateSection
                  title="Pausados"
                  eyebrow="Sin nuevas ocurrencias"
                  templates={pausedTemplates}
                  actionId={actionId}
                  onEdit={(template) => {
                    setEditingTemplate(template)
                    setFormMode('edit')
                  }}
                  onToggle={(template) => void handleToggle(template)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

type TemplateSectionProps = {
  title: string
  eyebrow: string
  templates: RecurringExpense[]
  emptyMessage?: string
  actionId: string | null
  onEdit: (template: RecurringExpense) => void
  onToggle: (template: RecurringExpense) => void
}

function TemplateSection({ title, eyebrow, templates, emptyMessage, actionId, onEdit, onToggle }: TemplateSectionProps) {
  return (
    <section className="card recurring-section">
      <div className="recurring-section-heading">
        <div><span>{eyebrow}</span><h2>{title}</h2></div>
        <strong>{templates.length}</strong>
      </div>
      {templates.length ? (
        <div className="recurring-list">
          {templates.map((template) => (
            <article className="recurring-template-row" key={template.id}>
              <div className="recurring-item-icon" aria-hidden="true">{template.category.icon}</div>
              <div className="recurring-item-copy">
                <strong>{template.description}</strong>
                <span>{formatCurrency(template.amountCents / 100)} · {scheduleLabel(template.frequency, template.intervalCount)}</span>
                <small>{template.expenseType === 'personal' ? 'Personal' : 'Común'} · próxima {formatShortDate(template.nextDueDate)}</small>
              </div>
              <div className="recurring-row-actions recurring-row-actions--template">
                <button type="button" onClick={() => onEdit(template)}>Editar</button>
                <button type="button" disabled={actionId === template.id} onClick={() => onToggle(template)}>
                  {actionId === template.id ? 'Guardando…' : template.isActive ? 'Pausar' : 'Reactivar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="recurring-empty">{emptyMessage}</p>}
    </section>
  )
}

type RecurringTemplateFormProps = {
  householdId: string
  currentUserId: string
  commonFundEnabled: boolean
  initialTemplate: RecurringExpense | null
  onCancel: () => void
  onSaved: () => void | Promise<unknown>
}

function initialSplits(template: RecurringExpense | null, members: ExpenseMember[]) {
  if (!template) return getDefaultExpenseSplits(members)
  return Object.fromEntries(
    members.map((member) => [
      member.userId,
      String(template.splitConfig.find((split) => split.userId === member.userId)?.sharePercent ?? 0),
    ]),
  )
}

function RecurringTemplateForm({ householdId, currentUserId, commonFundEnabled, initialTemplate, onCancel, onSaved }: RecurringTemplateFormProps) {
  const formData = useExpenseFormData(householdId)

  if (formData.loading) {
    return <ExpenseDataState loading title="Preparando formulario" message="Cargando categorías y miembros…" />
  }
  if (formData.error) {
    return <ExpenseDataState title="No hemos podido preparar el formulario" message={formData.error} onRetry={() => void formData.reload()} />
  }

  return (
    <RecurringTemplateFields
      householdId={householdId}
      currentUserId={currentUserId}
      commonFundEnabled={commonFundEnabled}
      initialTemplate={initialTemplate}
      members={formData.members}
      categories={formData.categories}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  )
}

type RecurringTemplateFieldsProps = RecurringTemplateFormProps & {
  members: ExpenseMember[]
  categories: ReturnType<typeof useExpenseFormData>['categories']
}

function RecurringTemplateFields({ householdId, currentUserId, commonFundEnabled, initialTemplate, members, categories, onCancel, onSaved }: RecurringTemplateFieldsProps) {
  const [description, setDescription] = useState(initialTemplate?.description ?? '')
  const [amount, setAmount] = useState(initialTemplate ? String(initialTemplate.amountCents / 100) : '')
  const [categoryId, setCategoryId] = useState(initialTemplate?.categoryId ?? '')
  const [expenseType, setExpenseType] = useState<ExpenseType>(initialTemplate?.expenseType ?? 'common')
  const [paymentSource, setPaymentSource] = useState(initialTemplate?.paymentSource ?? 'member')
  const [payerUserId, setPayerUserId] = useState(initialTemplate?.payerUserId ?? currentUserId)
  const [splits, setSplits] = useState(() => initialSplits(initialTemplate, members))
  const [frequency, setFrequency] = useState<RecurringFrequency>(initialTemplate?.frequency ?? 'monthly')
  const [intervalCount, setIntervalCount] = useState(String(initialTemplate?.intervalCount ?? 1))
  const [startDate, setStartDate] = useState(initialTemplate?.startDate ?? getTodayIsoDate())
  const [endDate, setEndDate] = useState(initialTemplate?.endDate ?? '')
  const [note, setNote] = useState(initialTemplate?.note ?? '')
  const [isActive, setIsActive] = useState(initialTemplate?.isActive ?? true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const usesFund = paymentSource === 'common_fund'
  const effectiveSplits = useMemo(() => {
    if (expenseType === 'personal') return getSolePayerSplits(members, currentUserId)
    if (usesFund) return getCommonFundSplits(members)
    return splits
  }, [currentUserId, expenseType, members, splits, usesFund])
  const splitTotal = members.reduce((sum, member) => sum + Number(effectiveSplits[member.userId] ?? 0), 0)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    const amountNumber = Number(amount)
    const cents = Math.round(amountNumber * 100)
    const interval = Number(intervalCount)
    const splitConfig = members.map((member) => ({
      userId: member.userId,
      sharePercent: Number(effectiveSplits[member.userId] ?? 0),
    })).filter((split) => split.sharePercent > 0)

    if (!description.trim() || !Number.isFinite(amountNumber) || cents < 1 || Math.abs(amountNumber * 100 - cents) > 0.000001 || !categoryId) {
      setSubmitError('Completa el concepto, el importe y la categoría con valores válidos.')
      return
    }
    if (!Number.isInteger(interval) || interval < 1 || interval > 120 || !startDate || (endDate && endDate < startDate)) {
      setSubmitError('Revisa la frecuencia y las fechas.')
      return
    }
    if (Math.abs(splitTotal - 100) > 0.001 || !splitConfig.length) {
      setSubmitError('El reparto debe sumar 100 %.')
      return
    }
    if (usesFund && (!commonFundEnabled || members.length !== 2)) {
      setSubmitError('El fondo común no está disponible para este hogar.')
      return
    }

    setIsSaving(true)
    try {
      const normalizedSource = expenseType === 'personal' ? 'member' : paymentSource
      const normalizedPayer = normalizedSource === 'common_fund' ? null : expenseType === 'personal' ? currentUserId : payerUserId
      if (initialTemplate) {
        await updateRecurringExpense({
          recurringExpenseId: initialTemplate.id,
          description: description.trim(), amountCents: cents, categoryId,
          paymentSource: normalizedSource, payerUserId: normalizedPayer, splitConfig,
          frequency, intervalCount: interval, startDate, endDate: endDate || null, note: note.trim(),
        })
      } else {
        await createRecurringExpense({
          householdId, description: description.trim(), amountCents: cents, categoryId,
          expenseType, paymentSource: normalizedSource, payerUserId: normalizedPayer,
          splitConfig, frequency, intervalCount: interval, startDate,
          endDate: endDate || null, note: note.trim(), isActive,
        })
      }
      await onSaved()
    } catch (saveError) {
      setSubmitError(saveError instanceof RecurringExpenseServiceError ? saveError.message : 'No hemos podido guardar el recurrente.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="add-expense-form recurring-form" onSubmit={handleSubmit} noValidate>
      <section className="card amount-card">
        <label htmlFor="recurring-amount">Importe sugerido</label>
        <div className="amount-input-wrap">
          <input id="recurring-amount" className="amount-input" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} placeholder="0,00" onChange={(event) => setAmount(event.target.value)} />
          <span aria-hidden="true">€</span>
        </div>
      </section>

      <section className="card form-card">
        <div className="form-field"><label htmlFor="recurring-description">Concepto</label><input id="recurring-description" value={description} placeholder="Alquiler, Netflix, gimnasio…" onChange={(event) => setDescription(event.target.value)} /></div>
        <div className="form-divider" />
        <div className="form-field"><label htmlFor="recurring-category">Categoría</label><div className="select-wrap"><select id="recurring-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Selecciona una categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></div></div>
      </section>

      <section className="card form-card sharing-card">
        <fieldset className="form-field form-fieldset">
          <legend>Tipo</legend>
          <div className="segmented-control">
            <button className={expenseType === 'common' ? 'segment-button segment-button--active' : 'segment-button'} type="button" disabled={Boolean(initialTemplate)} onClick={() => { setExpenseType('common'); setPaymentSource('member'); setSplits(getDefaultExpenseSplits(members)) }}>Común</button>
            <button className={expenseType === 'personal' ? 'segment-button segment-button--active' : 'segment-button'} type="button" disabled={Boolean(initialTemplate)} onClick={() => { setExpenseType('personal'); setPaymentSource('member'); setPayerUserId(currentUserId); setSplits(getSolePayerSplits(members, currentUserId)) }}>Personal</button>
          </div>
          <p className="personal-split-note">{expenseType === 'personal' ? 'Solo tú podrás ver, editar y confirmar esta recurrencia.' : 'Será visible para los miembros del hogar.'}</p>
        </fieldset>
        <div className="form-divider" />
        <fieldset className="form-field form-fieldset">
          <legend>Pagado por</legend>
          <div className="segmented-control payer-control">
            <button className={usesFund ? 'segment-button segment-button--active' : 'segment-button'} type="button" disabled={expenseType === 'personal' || !commonFundEnabled || members.length !== 2} onClick={() => { setPaymentSource('common_fund'); setSplits(getCommonFundSplits(members)) }}>Fondo común</button>
            {members.map((member) => <button key={member.userId} className={!usesFund && payerUserId === member.userId ? 'segment-button segment-button--active' : 'segment-button'} type="button" disabled={expenseType === 'personal' && member.userId !== currentUserId} onClick={() => { setPaymentSource('member'); setPayerUserId(member.userId) }}>{member.displayName}</button>)}
          </div>
        </fieldset>
        <div className="form-divider" />
        <fieldset className="form-field form-fieldset split-fieldset">
          <legend>Reparto</legend>
          {expenseType === 'personal' || usesFund ? (
            <div className="split-summary">{members.map((member) => <div key={member.userId}><span>{member.displayName}</span><strong>{effectiveSplits[member.userId] ?? 0} %</strong></div>)}</div>
          ) : (
            <div className="split-input-grid split-input-grid--direct">{members.map((member) => <label key={member.userId}><span>{member.displayName}</span><span className="percentage-input-wrap"><input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={splits[member.userId] ?? ''} onChange={(event) => setSplits((current) => updateExpenseSplitPercentages(members, current, member.userId, event.target.value))} /><span aria-hidden="true">%</span></span></label>)}</div>
          )}
        </fieldset>
      </section>

      <section className="card form-card recurring-schedule-card">
        <div className="recurring-schedule-grid">
          <div className="form-field"><label htmlFor="recurring-frequency">Frecuencia</label><div className="select-wrap"><select id="recurring-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}><option value="weekly">Semanal</option><option value="monthly">Mensual</option><option value="yearly">Anual</option></select></div></div>
          <div className="form-field"><label htmlFor="recurring-interval">Cada</label><input id="recurring-interval" type="number" inputMode="numeric" min="1" max="120" step="1" value={intervalCount} onChange={(event) => setIntervalCount(event.target.value)} /></div>
        </div>
        <p className="recurring-schedule-help">{scheduleLabel(frequency, Number(intervalCount) || 1)}. En meses cortos se usa su último día sin perder la fecha original.</p>
        <div className="form-divider" />
        <div className="recurring-schedule-grid">
          <div className="form-field"><label htmlFor="recurring-start">Primera fecha</label><input id="recurring-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div className="form-field"><label htmlFor="recurring-end">Fecha final opcional</label><input id="recurring-end" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
        </div>
        <div className="form-divider" />
        <div className="form-field note-field"><label htmlFor="recurring-note">Nota opcional</label><textarea id="recurring-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></div>
        {!initialTemplate && <label className="recurring-active-check"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span>Crear como activo</span></label>}
      </section>

      {submitError && <p className="expense-submit-error" role="alert">{submitError}</p>}
      <div className="recurring-form-actions">
        <button className="auth-secondary-button" type="button" disabled={isSaving} onClick={onCancel}>Cancelar</button>
        <button className="save-expense-button" type="submit" disabled={isSaving}>{isSaving ? 'Guardando…' : initialTemplate ? 'Guardar cambios' : 'Crear recurrente'}</button>
      </div>
    </form>
  )
}
