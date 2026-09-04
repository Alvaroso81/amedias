import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CategorySettings } from '../components/CategorySettings'
import { PasswordChangeForm } from '../components/PasswordChangeForm'
import {
  createHouseholdInvite,
  getHouseholdInvites,
  getHouseholdMembers,
  HouseholdInviteServiceError,
  revokeHouseholdInvite,
} from '../services/householdInvites'
import { HouseholdSettingsServiceError } from '../services/householdSettings'
import type { HouseholdRole } from '../types/household'
import type { HouseholdInvite, HouseholdMemberSummary } from '../types/householdInvites'
import { createInviteLink } from '../utils/pendingInvite'

type SettingsPageProps = {
  householdId: string
  householdName: string
  accountingMonthStartDay: number
  displayName: string
  email: string
  role: HouseholdRole
  isSigningOut: boolean
  signOutError: string | null
  onSignOut: () => void
  onViewSettlements: () => void
  onAccountingMonthStartDayChange: (startDay: number) => Promise<void>
  onCategoriesChanged: () => void | Promise<unknown>
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const invitationStatusLabels = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  revoked: 'Revocada',
  expired: 'Caducada',
} as const

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function SettingsPage({
  householdId,
  householdName,
  accountingMonthStartDay,
  displayName,
  email,
  role,
  isSigningOut,
  signOutError,
  onSignOut,
  onViewSettlements,
  onAccountingMonthStartDayChange,
  onCategoriesChanged,
}: SettingsPageProps) {
  const requestId = useRef(0)
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([])
  const [invitations, setInvitations] = useState<HouseholdInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isInviteFormOpen, setIsInviteFormOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null)
  const [inviteSubmitError, setInviteSubmitError] = useState<string | null>(null)
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [isSavingAccountingMonth, setIsSavingAccountingMonth] = useState(false)
  const [accountingMonthError, setAccountingMonthError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setLoadError(null)

    try {
      const [loadedMembers, loadedInvitations] = await Promise.all([
        getHouseholdMembers(householdId),
        role === 'owner' ? getHouseholdInvites(householdId) : Promise.resolve([]),
      ])

      if (currentRequest !== requestId.current) return

      setMembers(loadedMembers)
      setInvitations(loadedInvitations)
      setLoading(false)
    } catch (error) {
      if (currentRequest !== requestId.current) return

      setLoadError(
        error instanceof HouseholdInviteServiceError
          ? error.message
          : 'No hemos podido cargar los ajustes del hogar.',
      )
      setLoading(false)
    }
  }, [householdId, role])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadSettings(), 0)

    return () => {
      window.clearTimeout(loadTimer)
      requestId.current += 1
    }
  }, [loadSettings])

  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInviteEmailError(null)
    setInviteSubmitError(null)
    setCopyStatus(null)

    const normalizedEmail = inviteEmail.trim().toLocaleLowerCase('es-ES')

    if (!emailPattern.test(normalizedEmail)) {
      setInviteEmailError('Introduce un correo electrónico válido')
      return
    }

    setIsCreatingInvite(true)

    try {
      const token = await createHouseholdInvite(householdId, normalizedEmail)
      setGeneratedLink(createInviteLink(token))
      await loadSettings()
    } catch (error) {
      setInviteSubmitError(
        error instanceof HouseholdInviteServiceError
          ? error.message
          : 'No hemos podido crear la invitación.',
      )
    } finally {
      setIsCreatingInvite(false)
    }
  }

  const handleCopyLink = async () => {
    if (!generatedLink) return

    if (!navigator.clipboard?.writeText) {
      setCopyStatus('Selecciona el enlace y cópialo manualmente.')
      return
    }

    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopyStatus('Enlace copiado')
    } catch {
      setCopyStatus('No se pudo copiar. Selecciona el enlace y cópialo manualmente.')
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setRevokingId(inviteId)
    setLoadError(null)

    try {
      await revokeHouseholdInvite(inviteId)
      await loadSettings()
    } catch (error) {
      setLoadError(
        error instanceof HouseholdInviteServiceError
          ? error.message
          : 'No hemos podido revocar la invitación.',
      )
    } finally {
      setRevokingId(null)
    }
  }

  const handleAccountingMonthStartDayChange = async (startDay: number) => {
    if (role !== 'owner' || startDay === accountingMonthStartDay) return

    setIsSavingAccountingMonth(true)
    setAccountingMonthError(null)

    try {
      await onAccountingMonthStartDayChange(startDay)
    } catch (error) {
      setAccountingMonthError(
        error instanceof HouseholdSettingsServiceError
          ? error.message
          : 'No hemos podido guardar el inicio del mes contable.',
      )
    } finally {
      setIsSavingAccountingMonth(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <p>Ajustes</p>
        <h1>Tu espacio</h1>
      </header>

      <section className="card settings-card" aria-labelledby="household-settings-title">
        <div className="settings-section-heading">
          <div>
            <span>Mi hogar</span>
            <h2 id="household-settings-title">{householdName}</h2>
          </div>
          <span className="settings-role-badge">
            {role === 'owner' ? 'Propietario' : 'Miembro'}
          </span>
        </div>

        <div className="settings-divider" />

        <div className="accounting-month-setting">
          <div>
            <label htmlFor="accounting-month-start-day">Inicio del mes contable</label>
            <p>
              Los gastos realizados desde este día se asignarán por defecto al mes siguiente.
            </p>
          </div>
          {role === 'owner' ? (
            <select
              id="accounting-month-start-day"
              value={accountingMonthStartDay}
              disabled={isSavingAccountingMonth}
              onChange={(event) =>
                void handleAccountingMonthStartDayChange(Number(event.target.value))
              }
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option value={day} key={day}>Día {day}</option>
              ))}
            </select>
          ) : (
            <strong>Día {accountingMonthStartDay}</strong>
          )}
        </div>
        <p className="accounting-month-setting-example">
          {accountingMonthStartDay === 1
            ? 'Los gastos se asignan a su mes natural.'
            : `Un gasto del ${accountingMonthStartDay} de agosto se asignará por defecto a septiembre.`}
        </p>
        {isSavingAccountingMonth && <p className="settings-saving-note">Guardando…</p>}
        {accountingMonthError && (
          <p className="auth-submit-error" role="alert">{accountingMonthError}</p>
        )}

        <div className="settings-divider" />

        <div className="settings-section-heading settings-section-heading--members">
          <div>
            <span>Miembros</span>
            <h2>Personas del hogar</h2>
          </div>
          {role === 'owner' && (
            <button
              className="settings-inline-button"
              type="button"
              aria-expanded={isInviteFormOpen}
              aria-controls="household-invite-panel"
              onClick={() => {
                setIsInviteFormOpen((isOpen) => !isOpen)
                setGeneratedLink(null)
                setInviteSubmitError(null)
                setCopyStatus(null)
              }}
            >
              Invitar miembro
            </button>
          )}
        </div>

        {loading ? (
          <div className="settings-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            Cargando hogar…
          </div>
        ) : (
          <ul className="settings-member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <span className="settings-member-avatar" aria-hidden="true">
                  {Array.from(member.displayName)[0]?.toLocaleUpperCase('es-ES') ?? 'M'}
                </span>
                <div>
                  <strong>{member.displayName}</strong>
                  <span>{member.role === 'owner' ? 'Propietario' : 'Miembro'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {role === 'owner' && isInviteFormOpen && (
          <div className="invite-panel" id="household-invite-panel">
            {!generatedLink ? (
              <form className="invite-form" onSubmit={handleCreateInvite} noValidate>
                <div className="form-field">
                  <label htmlFor="invite-email">Correo electrónico</label>
                  <input
                    id="invite-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={inviteEmail}
                    placeholder="marta@ejemplo.com"
                    required
                    aria-invalid={Boolean(inviteEmailError)}
                    aria-describedby={inviteEmailError ? 'invite-email-error' : undefined}
                    onChange={(event) => {
                      setInviteEmail(event.target.value)
                      setInviteEmailError(null)
                    }}
                  />
                  {inviteEmailError && (
                    <p className="field-error" id="invite-email-error">
                      {inviteEmailError}
                    </p>
                  )}
                </div>

                {inviteSubmitError && (
                  <p className="auth-submit-error" role="alert">
                    {inviteSubmitError}
                  </p>
                )}

                <button className="settings-primary-button" type="submit" disabled={isCreatingInvite}>
                  {isCreatingInvite ? 'Preparando enlace…' : 'Crear invitación'}
                </button>
              </form>
            ) : (
              <div className="invite-ready" aria-live="polite">
                <span className="invite-ready-mark" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <h3>Invitación preparada</h3>
                  <p>Comparte este enlace de forma privada. Caduca en 7 días y solo se puede usar una vez.</p>
                </div>
                <label htmlFor="generated-invite-link">Enlace privado</label>
                <div className="invite-link-row">
                  <input
                    id="generated-invite-link"
                    type="text"
                    value={generatedLink}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button type="button" onClick={() => void handleCopyLink()}>
                    Copiar
                  </button>
                </div>
                {copyStatus && <p className="copy-status">{copyStatus}</p>}
              </div>
            )}
          </div>
        )}

        {loadError && (
          <div className="settings-load-error" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={() => void loadSettings()}>
              Volver a intentar
            </button>
          </div>
        )}

        {role === 'owner' && invitations.length > 0 && (
          <div className="settings-invitations">
            <h3>Invitaciones</h3>
            <ul>
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span>
                      {invitationStatusLabels[invitation.status]}
                      {invitation.status === 'pending'
                        ? ` · caduca el ${formatShortDate(invitation.expiresAt)}`
                        : ''}
                    </span>
                  </div>
                  {invitation.status === 'pending' && (
                    <button
                      type="button"
                      disabled={revokingId === invitation.id}
                      onClick={() => void handleRevokeInvite(invitation.id)}
                    >
                      {revokingId === invitation.id ? 'Revocando…' : 'Revocar'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <CategorySettings
        householdId={householdId}
        onCategoriesChanged={onCategoriesChanged}
      />

      <section className="card settings-card settings-settlements-card">
        <div className="settings-section-heading">
          <div>
            <span>Movimientos</span>
            <h2>Liquidaciones</h2>
          </div>
          <button
            className="settings-navigation-button"
            type="button"
            onClick={onViewSettlements}
          >
            Ver histórico <span aria-hidden="true">›</span>
          </button>
        </div>
        <p>Consulta las transferencias registradas para equilibrar las cuentas del hogar.</p>
      </section>

      <section className="card settings-card" aria-labelledby="account-settings-title">
        <div className="settings-section-heading">
          <div>
            <span>Mi cuenta</span>
            <h2 id="account-settings-title">{displayName}</h2>
          </div>
          <button
            className="settings-inline-button"
            type="button"
            aria-expanded={isPasswordFormOpen}
            aria-controls="password-change-panel"
            onClick={() => {
              setPasswordNotice(null)
              setIsPasswordFormOpen((isOpen) => !isOpen)
            }}
          >
            {isPasswordFormOpen ? 'Cerrar' : 'Cambiar contraseña'}
          </button>
        </div>
        <p className="settings-account-email">{email}</p>

        {isPasswordFormOpen && (
          <div className="password-change-panel" id="password-change-panel">
            <PasswordChangeForm
              onCancel={() => setIsPasswordFormOpen(false)}
              onSuccess={() => {
                setIsPasswordFormOpen(false)
                setPasswordNotice('Contraseña actualizada')
              }}
            />
          </div>
        )}

        {passwordNotice && (
          <div className="password-change-success" role="status" aria-live="polite">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>{passwordNotice}</strong>
              <p>Ya puedes utilizar tu nueva contraseña.</p>
            </div>
          </div>
        )}

        <button
          className="settings-signout-button"
          type="button"
          disabled={isSigningOut}
          onClick={onSignOut}
        >
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
        {signOutError && (
          <p className="auth-submit-error" role="alert">
            {signOutError}
          </p>
        )}
      </section>
    </div>
  )
}
