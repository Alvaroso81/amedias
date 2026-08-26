import { useState } from 'react'

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
        <h1>Amedias</h1>
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
