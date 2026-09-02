import { useState } from 'react'
import amediasLogo from '../assets/amedias-logo.png'

type AppHeaderProps = {
  displayName: string
  householdName: string
  currentPeriod: string
  isSigningOut: boolean
  signOutError: string | null
  onSignOut: () => void
}

export function AppHeader({
  displayName,
  householdName,
  currentPeriod,
  isSigningOut,
  signOutError,
  onSignOut,
}: AppHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const avatarLetter = Array.from(displayName.trim())[0]?.toLocaleUpperCase('es-ES') ?? 'U'

  return (
    <header className="app-header">
      <div>
        <div className="app-logo-frame">
          <img className="app-logo" src={amediasLogo} alt="Amedias" />
        </div>
        <p className="current-period">{currentPeriod}</p>
        <p className="brand-tagline">Tus gastos compartidos, en equilibrio.</p>
      </div>
      <div className="profile-menu-wrap">
        <button
          className="avatar"
          type="button"
          aria-label={`Abrir menú de ${displayName}`}
          aria-expanded={isMenuOpen}
          aria-controls="profile-menu"
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          {avatarLetter}
        </button>

        {isMenuOpen && (
          <div className="profile-menu" id="profile-menu">
            <strong>{displayName}</strong>
            <span>{householdName}</span>
            <button type="button" disabled={isSigningOut} onClick={onSignOut}>
              {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
            {signOutError && <p role="alert">{signOutError}</p>}
          </div>
        )}
      </div>
    </header>
  )
}
