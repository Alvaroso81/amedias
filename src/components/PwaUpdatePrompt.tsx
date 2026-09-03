import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_, registration) => {
      if (!registration) return

      window.setInterval(() => {
        if (window.navigator.onLine) void registration.update()
      }, 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <span>Nueva versión disponible</span>
      <div className="pwa-update-actions">
        <button type="button" onClick={() => void updateServiceWorker(true)}>
          Actualizar
        </button>
        <button
          className="pwa-update-dismiss"
          type="button"
          onClick={() => setNeedRefresh(false)}
        >
          Ahora no
        </button>
      </div>
    </aside>
  )
}
