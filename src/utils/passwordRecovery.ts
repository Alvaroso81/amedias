// Capture recovery intent before Supabase consumes the URL fragment. No tokens
// are copied to application storage; the query flag only selects the screen.
export function readPasswordRecoveryUrl(href: string) {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const marker = url.searchParams.get('password-recovery')
  const recovery = hash.get('type') === 'recovery' || marker !== null
  const expired = hash.get('error_code') === 'otp_expired' || url.searchParams.get('error_code') === 'otp_expired'
  const hasError = ['error', 'error_code', 'error_description'].some((key) =>
    hash.has(key) || url.searchParams.has(key))
  return { active: recovery || expired, invalid: marker === 'invalid' || ((recovery || expired) && hasError) }
}

export function markPasswordRecovery(invalid = false) {
  const url = new URL(window.location.href)
  url.searchParams.set('password-recovery', invalid ? 'invalid' : '1')
  if (invalid) url.hash = ''
  window.history.replaceState(window.history.state, '', url)
}

export function capturePasswordRecovery() {
  const recovery = readPasswordRecoveryUrl(window.location.href)
  // Do not remove the fragment here: the SDK must first validate the callback.
  if (recovery.active) {
    const url = new URL(window.location.href)
    url.searchParams.set('password-recovery', recovery.invalid ? 'invalid' : '1')
    window.history.replaceState(window.history.state, '', url)
  }
  return recovery
}

export function clearPasswordRecovery() {
  const url = new URL(window.location.href)
  url.searchParams.delete('password-recovery')
  for (const key of ['error', 'error_code', 'error_description', 'code']) url.searchParams.delete(key)
  url.hash = ''
  window.history.replaceState(window.history.state, '', url)
}

export function createPasswordRecoveryRedirectUrl(origin: string, base: string) {
  const url = new URL(base, origin)
  url.searchParams.set('password-recovery', '1')
  return url.toString()
}

export function validateRecoveryPassword(password: string, confirmation: string) {
  if (!password) return 'Introduce una nueva contraseña.'
  if (password.length < 6) return 'La nueva contraseña debe tener al menos 6 caracteres.'
  if (password !== confirmation) return 'Las contraseñas no coinciden.'
  return null
}
