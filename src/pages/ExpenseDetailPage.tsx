import { useState } from 'react'
import { DeleteExpenseDialog } from '../components/DeleteExpenseDialog'
import type { Expense } from '../types/finance'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'

type ExpenseDetailPageProps = {
  expense: Expense
  onBack: () => void
  onDelete: (expenseId: string) => void
  onEdit: () => void
}

function roundMoney(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function ExpenseDetailPage({
  expense,
  onBack,
  onDelete,
  onEdit,
}: ExpenseDetailPageProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const alvaroShare = roundMoney((expense.amount * expense.split.alvaro) / 100)
  const martaShare = roundMoney(expense.amount - alvaroShare)
  const debtor = expense.paidBy === 'Álvaro' ? 'Marta' : 'Álvaro'
  const creditor = expense.paidBy
  const owedAmount = expense.paidBy === 'Álvaro' ? martaShare : alvaroShare

  return (
    <div className="expense-detail-page">
      <header className="add-expense-header detail-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="Volver a Gastos">
          <span aria-hidden="true">←</span>
        </button>
        <h1>Detalle del gasto</h1>
      </header>

      <section className="card detail-hero-card">
        <span className="detail-category-icon" aria-hidden="true">
          {expense.icon}
        </span>
        <p>{expense.description}</p>
        <strong>{formatCurrency(expense.amount)}</strong>
        <span>{expense.category}</span>
      </section>

      <section className="card expense-detail-card" aria-label="Información del gasto">
        <DetailRow label="Concepto" value={expense.description} />
        <DetailRow label="Importe" value={formatCurrency(expense.amount)} />
        <DetailRow label="Categoría" value={expense.category} />
        <DetailRow label="Pagado por" value={expense.paidBy} />
        <div className="detail-data-row detail-split-row">
          <span>Reparto</span>
          <div>
            <strong>Álvaro {expense.split.alvaro} %</strong>
            <strong>Marta {expense.split.marta} %</strong>
          </div>
        </div>
        <DetailRow label="Fecha" value={formatLongDate(expense.date)} />
        <DetailRow label="Tipo" value={expense.expenseType === 'common' ? 'Común' : 'Personal'} />
        {expense.note && <DetailRow label="Nota" value={expense.note} multiline />}
      </section>

      <section className="card balance-impact-card" aria-labelledby="balance-impact-title">
        <p className="card-label" id="balance-impact-title">
          Efecto sobre el balance
        </p>
        <div className="impact-shares">
          <div>
            <span>Álvaro asume</span>
            <strong>{formatCurrency(alvaroShare)}</strong>
          </div>
          <div>
            <span>Marta asume</span>
            <strong>{formatCurrency(martaShare)}</strong>
          </div>
        </div>
        <p className="impact-explanation">
          {debtor} debe aproximadamente {formatCurrency(owedAmount)} a {creditor} por este gasto
        </p>
      </section>

      <div className="expense-detail-actions">
        <button className="edit-expense-button" type="button" onClick={onEdit}>
          Editar gasto
        </button>
        <button className="delete-expense-button" type="button" onClick={() => setIsDeleteDialogOpen(true)}>
          Eliminar gasto
        </button>
      </div>

      {isDeleteDialogOpen && (
        <DeleteExpenseDialog
          expense={expense}
          onCancel={() => setIsDeleteDialogOpen(false)}
          onConfirm={() => onDelete(expense.id)}
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
