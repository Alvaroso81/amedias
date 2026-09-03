import { useEffect, useState } from 'react'

export function PwaConnectionStatus() {
  const [isOffline, setIsOffline] = useState(() => !window.navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <aside className="pwa-connection-notice" role="status" aria-live="polite">
      Sin conexión. No puedes cargar ni guardar datos.
    </aside>
  )
}
