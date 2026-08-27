import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  CommonFundServiceError,
  saveCommonFundSettings,
  setCommonFundBalance,
  topUpCommonFund,
} from '../services/commonFund'
import type { CommonFundState } from '../types/commonFund'
import {
  formatSignedFundAmount,
  getCommonFundBand,
  getCommonFundMonthlyActivity,
  getCommonFundPercentage,
  isCommonFundUnstarted,
} from '../utils/commonFund'
import { formatCurrency } from '../utils/formatCurrency'
import { formatLongDate } from '../utils/formatDate'

type FundDialog = 'top-up' | 'adjust' | 'settings' | null

type CommonFundPageProps = CommonFundState & {
  householdId: string
  loading: boolean
  error: string | null
  onBack: () => void
  onRefresh: () => void | Promise<unknown>
  onRetry: () => void | Promise<unknown>
  initialDialog?: Exclude<FundDialog, null>
}

const percentageFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

export function CommonFundPage({
  householdId,
  settings,
  balance,
  movements,
  loading,
  error,
  onBack,
  onRefresh,
  onRetry,
  initialDialog,
}: CommonFundPageProps) {
  const [dialog, setDialog] = useState<FundDialog>(initialDialog ?? null)
  const [notice, setNotice] = useState<string | null>(null)

  if (loading) {
    return <CommonFundStateScreen onBack={onBack} loading message="Cargando fondo común…" />
  }

  if (error || !settings) {
    return (
      <CommonFundStateScreen
        onBack={onBack}
        message="No hemos podido cargar el fondo común."
        onRetry={onRetry}
      />
    )
  }

  const percentage = getCommonFundPercentage(balance, settings.suggestedContributionAmount)
  const isUnstarted = isCommonFundUnstarted(balance, movements)
  const band = isUnstarted ? 'neutral' : getCommonFundBand(percentage)
  const showProgress = !isUnstarted && settings.suggestedContributionAmount > 0
  const { addedThisMonth, spentThisMonth } = getCommonFundMonthlyActivity(movements)

  const completeAction = async (message: string) => {
    await onRefresh()
    setDialog(null)
    setNotice(message)
  }

  return (
    <div className="common-fund-page">
      <header className="add-expense-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="Volver a Inicio">
          <span aria-hidden="true">←</span>
        </button>
        <h1>Fondo común</h1>
      </header>

      {notice && <p className="expense-update-notice" role="status">✓ {notice}</p>}

      <section className={`card common-fund-hero common-fund-card--${band}`}>
        <span>Saldo disponible</span>
        <strong>{formatCurrency(balance)}</strong>
        {isUnstarted ? (
          <p className="common-fund-hero__empty-copy">
            Aún no habéis añadido dinero al fondo.
          </p>
        ) : showProgress ? (
          <>
            <p>{percentageFormatter.format(percentage)} % del fondo habitual</p>
            <div
              className="common-fund-progress"
              role="progressbar"
              aria-label={
                'Saldo disponible: ' +
                percentageFormatter.format(percentage) +
                ' por ciento del fondo habitual'
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(percentage))}
            >
              <span style={{ width: Math.min(100, percentage) + '%' }} />
            </div>
          </>
        ) : null}
        {!isUnstarted && (
          <div className="common-fund-hero__facts">
            <span>Añadido este mes <b>{formatCurrency(addedThisMonth)}</b></span>
            <span>Por persona <b>{formatCurrency(addedThisMonth / 2)}</b></span>
            <span>Gastado este mes <b>{formatCurrency(spentThisMonth)}</b></span>
          </div>
        )}
      </section>

      <div className="common-fund-page-actions">
        <button type="button" disabled={!settings.enabled} onClick={() => setDialog('top-up')}>
          <span aria-hidden="true">＋</span> Añadir al fondo
        </button>
        <button type="button" disabled={!settings.enabled} onClick={() => setDialog('adjust')}>
          <span aria-hidden="true">≈</span> Ajustar
        </button>
        <button type="button" onClick={() => setDialog('settings')}>
          <span aria-hidden="true">⚙</span> Configurar
        </button>
      </div>

      <section className="card common-fund-movements" aria-labelledby="fund-movements-title">
        <div className="common-fund-section-heading">
          <span>Actividad</span>
          <h2 id="fund-movements-title">Movimientos</h2>
        </div>
        {movements.length ? (
          <div className="common-fund-movement-list">
            {movements.map((movement) => (
              <div key={movement.id}>
                <span className={`fund-movement-icon fund-movement-icon--${movement.movementType}`} aria-hidden="true">
                  {movement.movementType === 'expense' ? (movement.categoryIcon ?? '↗') : movement.amountDelta > 0 ? '↘' : '↗'}
                </span>
                <span>
                  <strong>{getMovementTitle(movement)}</strong>
                  <small>
                    {movement.categoryName ? `${movement.categoryName} · ` : ''}
                    {formatLongDate(movement.expenseDate ?? movement.periodMonth ?? movement.createdAt.slice(0, 10))}
                  </small>
                  {movement.note && movement.movementType !== 'monthly_contribution' && movement.note !== movement.expenseDescription && <em>{movement.note}</em>}
                </span>
                <b className={movement.amountDelta > 0 ? 'fund-movement-positive' : 'fund-movement-negative'}>
                  {formatSignedFundAmount(movement.amountDelta)}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <div className="common-fund-empty">
            <strong>El fondo común está listo</strong>
            <p>Añade dinero al fondo cuando lo necesitéis.</p>
          </div>
        )}
      </section>

      {dialog === 'top-up' && (
        <TopUpDialog
          householdId={householdId}
          suggestedContributionAmount={settings.suggestedContributionAmount}
          onCancel={() => setDialog(null)}
          onSaved={() => completeAction('Aportación añadida')}
        />
      )}
      {dialog === 'adjust' && (
        <AdjustDialog
          householdId={householdId}
          balance={balance}
          onCancel={() => setDialog(null)}
          onSaved={() => completeAction('Saldo ajustado')}
        />
      )}
      {dialog === 'settings' && (
        <SettingsDialog
          householdId={householdId}
          suggestedContributionAmount={settings.suggestedContributionAmount}
          enabled={settings.enabled}
          onCancel={() => setDialog(null)}
          onSaved={() => completeAction('Configuración guardada')}
        />
      )}
    </div>
  )
}

function getMovementTitle(movement: CommonFundState['movements'][number]) {
  if (movement.movementType === 'expense') return movement.expenseDescription ?? 'Gasto del fondo'
  if (movement.movementType === 'monthly_contribution') return 'Aportación al fondo'
  if (movement.movementType === 'top_up') return 'Aportación al fondo'
  return 'Ajuste de saldo'
}

function CommonFundStateScreen({
  onBack,
  loading = false,
  message,
  onRetry,
}: {
  onBack: () => void
  loading?: boolean
  message: string
  onRetry?: () => void | Promise<unknown>
}) {
  return (
    <div className="common-fund-page">
      <header className="add-expense-header">
        <button className="back-button" type="button" onClick={onBack} aria-label="Volver a Inicio">←</button>
        <h1>Fondo común</h1>
      </header>
      <section className="card expense-form-state-card">
        {loading && <span className="loading-spinner" aria-hidden="true" />}
        <p>{message}</p>
        {onRetry && <button className="auth-secondary-button" type="button" onClick={() => void onRetry()}>Volver a intentar</button>}
      </section>
    </div>
  )
}

type DialogProps = {
  householdId: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
}

function TopUpDialog({ householdId, suggestedContributionAmount, onCancel, onSaved }: DialogProps & { suggestedContributionAmount: number }) {
  const [amount, setAmount] = useState(String(suggestedContributionAmount))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const numericAmount = Number(amount)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Introduce una aportación mayor que 0.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await topUpCommonFund(householdId, numericAmount, note.trim())
      await onSaved()
    } catch (caught) {
      setError(caught instanceof CommonFundServiceError ? caught.message : 'No hemos podido añadir dinero al fondo.')
      setSaving(false)
    }
  }

  return (
    <FundDialog title="Añadir al fondo" subtitle="Nueva aportación" onCancel={onCancel} saving={saving}>
      <form className="fund-dialog-form" onSubmit={submit} noValidate>
        <label>Importe<div className="settlement-amount-input"><input autoFocus type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null) }} /><span>€</span></div></label>
        <p className="fund-per-person-copy">{Number.isFinite(numericAmount) && numericAmount > 0 ? `${formatCurrency(numericAmount / 2)} por persona` : 'El fondo común pertenece al 50 % a cada persona.'}</p>
        <label>Nota opcional<textarea rows={3} value={note} placeholder="Por ejemplo, ingreso inicial" onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p className="inline-expense-error" role="alert">{error}</p>}
        <button className="save-expense-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Añadir al fondo'}</button>
      </form>
    </FundDialog>
  )
}

function AdjustDialog({ householdId, balance, onCancel, onSaved }: DialogProps & { balance: number }) {
  const [target, setTarget] = useState(String(balance))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const numericTarget = Number(target)
  const delta = Number.isFinite(numericTarget) ? numericTarget - balance : 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (target === '' || !Number.isFinite(numericTarget) || numericTarget < 0) {
      setError('El saldo objetivo debe ser 0 o mayor.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await setCommonFundBalance(householdId, numericTarget, note.trim())
      await onSaved()
    } catch (caught) {
      setError(caught instanceof CommonFundServiceError ? caught.message : 'No hemos podido ajustar el saldo.')
      setSaving(false)
    }
  }

  return (
    <FundDialog title="Ajustar saldo" subtitle="Corrección manual" onCancel={onCancel} saving={saving}>
      <form className="fund-dialog-form" onSubmit={submit} noValidate>
        <div className="fund-current-balance"><span>Saldo actual</span><strong>{formatCurrency(balance)}</strong></div>
        <label>Saldo objetivo<div className="settlement-amount-input"><input autoFocus type="number" inputMode="decimal" min="0" step="0.01" value={target} onChange={(event) => { setTarget(event.target.value); setError(null) }} /><span>€</span></div></label>
        <p className="fund-per-person-copy">Movimiento resultante: <strong>{formatSignedFundAmount(delta)}</strong></p>
        <label>Motivo opcional<textarea rows={3} value={note} placeholder="Explica el ajuste" onChange={(event) => setNote(event.target.value)} /></label>
        {error && <p className="inline-expense-error" role="alert">{error}</p>}
        <button className="save-expense-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Ajustar saldo'}</button>
      </form>
    </FundDialog>
  )
}

function SettingsDialog({ householdId, suggestedContributionAmount, enabled, onCancel, onSaved }: DialogProps & { suggestedContributionAmount: number; enabled: boolean }) {
  const [amount, setAmount] = useState(String(suggestedContributionAmount))
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const numericAmount = Number(amount)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (amount === '' || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError('La aportación habitual debe ser 0 o mayor.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveCommonFundSettings(householdId, numericAmount, isEnabled)
      await onSaved()
    } catch (caught) {
      setError(caught instanceof CommonFundServiceError ? caught.message : 'No hemos podido guardar la configuración.')
      setSaving(false)
    }
  }

  return (
    <FundDialog title="Configurar fondo" subtitle="Aportación habitual" onCancel={onCancel} saving={saving}>
      <form className="fund-dialog-form" onSubmit={submit} noValidate>
        <label>Aportación habitual<div className="settlement-amount-input"><input autoFocus type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setError(null) }} /><span>€</span></div></label>
        <p className="fund-per-person-copy">{Number.isFinite(numericAmount) && numericAmount >= 0 ? `${formatCurrency(numericAmount / 2)} por persona` : '50 % por persona'}</p>
        <label className="fund-enabled-toggle"><input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} /><span><strong>Fondo común activo</strong><small>Al desactivarlo no se podrá añadir dinero ni pagar gastos desde el fondo.</small></span></label>
        <p className="fund-settings-help">Esta cantidad se utilizará como valor sugerido al añadir dinero al fondo. Puedes cambiarla en cada aportación.</p>
        {error && <p className="inline-expense-error" role="alert">{error}</p>}
        <button className="save-expense-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
      </form>
    </FundDialog>
  )
}

function FundDialog({ title, subtitle, onCancel, saving, children }: { title: string; subtitle: string; onCancel: () => void; saving: boolean; children: ReactNode }) {
  return (
    <div className="dialog-backdrop settlement-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
      <section className="settlement-dialog fund-dialog" role="dialog" aria-modal="true" aria-labelledby="fund-dialog-title">
        <header className="settlement-dialog-header"><div><span>{subtitle}</span><h2 id="fund-dialog-title">{title}</h2></div><button type="button" disabled={saving} aria-label="Cerrar" onClick={onCancel}>×</button></header>
        {children}
      </section>
    </div>
  )
}
