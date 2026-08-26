import { useState } from 'react'
import { DeleteSettlementDialog } from '../components/DeleteSettlementDialog'
import { SettlementServiceError } from '../services/settlements'
import type { ExpenseReadMember, SettlementRecord } from '../types/expenseRead'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'
import { getSettlementDirectionLabel } from '../utils/settlementPresentation'

type SettlementDetailPageProps = {
  settlement: SettlementRecord
  members: ExpenseReadMember[]
  statusMessage: string | null
  onBack: () => void
  onEdit: () => void
  onDelete: (settlementId: string) => Promise<void>
}

export function SettlementDetailPage({
  settlement,
  members,
  statusMessage,
  onBack,
  onEdit,
  onDelete,
}: SettlementDetailPageProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await onDelete(settlement.id)
    } catch (error) {
      setDeleteError(
        error instanceof SettlementServiceError
          ? error.message
          : 'No hemos podido eliminar la liquidación.',
      )
      setIsDeleting(false)
    }
  }

  return (
    <div className="settlement-detail-page">
      <header className="add-expense-header detail-page-header">
        <button
          className="back-button"
          type="button"
          onClick={onBack}
          aria-label="Volver a Liquidaciones"
        >
          <span aria-hidden="true">←</span>
        </button>
        <h1>Liquidación</h1>
      </header>

      {statusMessage && (
        <p className="expense-update-notice" role="status">
          <span aria-hidden="true">✓</span> {statusMessage}
        </p>
      )}

      <section className="card settlement-detail-hero">
        <span aria-hidden="true">↔</span>
        <p>{getSettlementDirectionLabel(settlement, members)}</p>
        <strong>{formatCurrency(settlement.amount)}</strong>
        <small>{formatLongDate(settlement.settlementDate)}</small>
      </section>

      {settlement.note && (
        <section className="card settlement-note-card">
          <span>Nota</span>
          <p>{settlement.note}</p>
        </section>
      )}

      <div className="expense-detail-actions">
        <button className="edit-expense-button" type="button" onClick={onEdit}>
          Editar liquidación
        </button>
        <button
          className="delete-expense-button"
          type="button"
          onClick={() => {
            setDeleteError(null)
            setIsDeleteDialogOpen(true)
          }}
        >
          Eliminar liquidación
        </button>
      </div>

      {isDeleteDialogOpen && (
        <DeleteSettlementDialog
          settlement={settlement}
          members={members}
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
