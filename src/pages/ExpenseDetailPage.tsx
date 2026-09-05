import { useState } from 'react'
import { DeleteExpenseDialog } from '../components/DeleteExpenseDialog'
import { ExpenseServiceError } from '../services/expenses'
import { EditableExpenseDetails } from '../components/EditableExpenseDetails'
import type { ExpenseRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatShortDate } from '../utils/formatDate'
import { formatRecurringSchedule } from '../utils/recurringExpensePresentation'
import {
  getExpenseBalanceImpacts,
  getExpensePayerLabel,
} from '../utils/expensePresentation'

type ExpenseDetailPageProps = {
  expense: ExpenseRecord
  householdId: string
  currentUserId: string
  accountingMonthStartDay: number
  commonFundBalance: number
  commonFundEnabled: boolean
  commonFundLoading: boolean
  onBack: () => void
  onUpdated: (expenseId: string) => void | Promise<void>
  onDelete: (expenseId: string) => Promise<void>
  statusMessage: string | null
  onManageRecurringExpense: (recurringExpenseId: string) => void
}

export function ExpenseDetailPage({
  expense,
  householdId,
  currentUserId,
  accountingMonthStartDay,
  commonFundBalance,
  commonFundEnabled,
  commonFundLoading,
  onBack,
  onUpdated,
  onDelete,
  statusMessage,
  onManageRecurringExpense,
}: ExpenseDetailPageProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const impacts = getExpenseBalanceImpacts(expense)
  const creditor = [...impacts].sort((first, second) => second.amount - first.amount)[0]
  const debtor = [...impacts].sort((first, second) => first.amount - second.amount)[0]
  const hasDebt = creditor && debtor && creditor.amount >= 0.01 && debtor.amount <= -0.01
  const owedAmount = hasDebt
    ? Math.min(creditor.amount, Math.abs(debtor.amount))
    : 0

  const handleDelete = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await onDelete(expense.id)
    } catch (error) {
      setDeleteError(
        error instanceof ExpenseServiceError
          ? error.message
          : 'No hemos podido eliminar el gasto. Inténtalo de nuevo.',
      )
      setIsDeleting(false)
    }
  }

  return (
    <div className="expense-detail-page">
      <header className="add-expense-header detail-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="Volver a Gastos">
          <span aria-hidden="true">←</span>
        </button>
        <h1>Detalle del gasto</h1>
      </header>

      {statusMessage && (
        <p className="expense-update-notice" role="status">
          <span aria-hidden="true">✓</span> {statusMessage}
        </p>
      )}

      <section className="card detail-hero-card">
        <span className="detail-category-icon" aria-hidden="true">
          {expense.category.icon}
        </span>
        <p>{expense.description}</p>
        <strong>{formatCurrency(expense.amount)}</strong>
        <span>{expense.category.name}</span>
        <span className="expense-detail-type">{expense.expenseType === 'personal' ? 'Personal' : 'Común'}</span>
        {expense.expenseType === 'personal' && (
          <small className="expense-detail-private-copy">Solo tú puedes ver este gasto.</small>
        )}
      </section>

      <EditableExpenseDetails
        expense={expense}
        householdId={householdId}
        currentUserId={currentUserId}
        accountingMonthStartDay={accountingMonthStartDay}
        commonFundBalance={commonFundBalance}
        commonFundEnabled={commonFundEnabled}
        commonFundLoading={commonFundLoading}
        onUpdated={onUpdated}
      />

      {expense.recurringExpense && (
        <section className="card expense-recurring-detail" aria-labelledby="expense-recurring-title">
          <div className="expense-recurring-heading">
            <div>
              <span>Origen</span>
              <h2 id="expense-recurring-title">Recurrente</h2>
            </div>
            <span className="expense-recurrence-mark">Recurrente</span>
          </div>
          <strong>{formatRecurringSchedule(expense.recurringExpense)}</strong>
          {expense.recurringExpense.deletedAt ? (
            <p className="expense-recurring-inactive">Esta recurrencia ya no está activa.</p>
          ) : (
            <>
              {expense.recurringExpense.isActive ? (
                <p>Próxima: {formatShortDate(expense.recurringExpense.nextDueDate)}</p>
              ) : (
                <p className="expense-recurring-inactive">Recurrencia pausada.</p>
              )}
              <button
                type="button"
                onClick={() => onManageRecurringExpense(expense.recurringExpense!.recurringExpenseId)}
              >
                Gestionar recurrencia
              </button>
            </>
          )}
        </section>
      )}

      <section className={`card balance-impact-card${expense.expenseType === 'personal' ? ' balance-impact-card--personal' : ''}`} aria-labelledby="balance-impact-title">
        <p className="card-label" id="balance-impact-title">
          {expense.expenseType === 'personal' ? 'Gasto personal' : 'Efecto sobre el balance'}
        </p>
        <div className="impact-shares">
          {(expense.paymentSource === 'common_fund' ? expense.splits.map((split) => ({
            userId: split.userId,
            displayName: split.displayName,
            amount: split.sharePercent ?? 50,
          })) : impacts).map((impact) => (
            <div key={impact.userId}>
              <span>{impact.displayName}</span>
              <strong>
                {expense.paymentSource === 'common_fund'
                  ? `${impact.amount} % asumido`
                  : `${impact.amount > 0 ? '+' : ''}${formatCurrency(impact.amount)}`}
              </strong>
            </div>
          ))}
        </div>
        <p className="impact-explanation">
          {expense.expenseType === 'personal'
            ? 'Este gasto te corresponde al 100 % y no afecta al balance del hogar.'
            : expense.paymentSource === 'common_fund'
              ? 'Este gasto se ha pagado con el fondo común y no modifica el balance personal.'
            : hasDebt
              ? `${debtor.displayName} debe ${formatCurrency(owedAmount)} a ${creditor.displayName} por este gasto`
            : `Este gasto no genera deuda pendiente entre sus participantes. Pagador: ${getExpensePayerLabel(expense)}.`}
        </p>
      </section>

      <div className="expense-detail-actions">
        <button
          className="delete-expense-button"
          type="button"
          onClick={() => {
            setDeleteError(null)
            setIsDeleteDialogOpen(true)
          }}
        >
          Eliminar gasto
        </button>
      </div>

      {isDeleteDialogOpen && (
        <DeleteExpenseDialog
          expense={expense}
          isDeleting={isDeleting}
          error={deleteError}
          onCancel={() => {
            setDeleteError(null)
            setIsDeleteDialogOpen(false)
          }}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}
