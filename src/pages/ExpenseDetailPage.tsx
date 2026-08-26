import { useState } from 'react'
import { DeleteExpenseDialog } from '../components/DeleteExpenseDialog'
import { ExpenseServiceError } from '../services/expenses'
import type { ExpenseRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'
import {
  getExpenseBalanceImpacts,
  getExpensePayerLabel,
} from '../utils/expensePresentation'

type ExpenseDetailPageProps = {
  expense: ExpenseRecord
  onBack: () => void
  onEdit: () => void
  onDelete: (expenseId: string) => Promise<void>
  statusMessage: string | null
}

export function ExpenseDetailPage({
  expense,
  onBack,
  onEdit,
  onDelete,
  statusMessage,
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
      </section>

      <section className="card expense-detail-card" aria-label="Información del gasto">
        <DetailRow label="Concepto" value={expense.description} />
        <DetailRow label="Importe" value={formatCurrency(expense.amount)} />
        <DetailRow label="Categoría" value={expense.category.name} />
        <div className="detail-data-row detail-split-row">
          <span>Pagado por</span>
          <div>
            {expense.payments.length ? (
              expense.payments.map((payment) => (
                <strong key={payment.userId}>
                  {payment.displayName} · {formatCurrency(payment.amount)}
                </strong>
              ))
            ) : (
              <strong>Pagador no disponible</strong>
            )}
          </div>
        </div>
        <div className="detail-data-row detail-split-row">
          <span>Reparto</span>
          <div>
            {expense.splits.length ? (
              expense.splits.map((split) => (
                <strong key={split.userId}>
                  {split.displayName}
                  {split.sharePercent === null ? '' : ` ${split.sharePercent} %`}
                  {' · '}
                  {formatCurrency(split.shareAmount)}
                </strong>
              ))
            ) : (
              <strong>Reparto no disponible</strong>
            )}
          </div>
        </div>
        <DetailRow label="Fecha" value={formatLongDate(expense.expenseDate)} />
        <DetailRow label="Tipo" value={expense.expenseType === 'common' ? 'Común' : 'Personal'} />
        {expense.note && <DetailRow label="Nota" value={expense.note} multiline />}
      </section>

      <section className="card balance-impact-card" aria-labelledby="balance-impact-title">
        <p className="card-label" id="balance-impact-title">
          Efecto sobre el balance
        </p>
        <div className="impact-shares">
          {impacts.map((impact) => (
            <div key={impact.userId}>
              <span>{impact.displayName}</span>
              <strong>
                {impact.amount > 0 ? '+' : ''}
                {formatCurrency(impact.amount)}
              </strong>
            </div>
          ))}
        </div>
        <p className="impact-explanation">
          {hasDebt
            ? `${debtor.displayName} debe ${formatCurrency(owedAmount)} a ${creditor.displayName} por este gasto`
            : `Este gasto no genera deuda pendiente entre sus participantes. Pagador: ${getExpensePayerLabel(expense)}.`}
        </p>
      </section>

      <div className="expense-detail-actions">
        <button className="edit-expense-button" type="button" onClick={onEdit}>
          Editar gasto
        </button>
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

type DetailRowProps = {
  label: string
  value: string
  multiline?: boolean
}

function DetailRow({ label, value, multiline = false }: DetailRowProps) {
  return (
    <div className={`detail-data-row${multiline ? ' detail-data-row--multiline' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
