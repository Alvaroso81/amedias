const pendingInviteStorageKey = 'amedias_pending_invite'
let memoryToken: string | null = null

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(pendingInviteStorageKey)
  } catch {
    return memoryToken
  }
}

function storeToken(token: string) {
  memoryToken = token

  try {
    window.sessionStorage.setItem(pendingInviteStorageKey, token)
  } catch {
    // The in-memory fallback still preserves the token for this page lifecycle.
  }
}

export function capturePendingInviteToken() {
  const url = new URL(window.location.href)
  const queryToken = url.searchParams.get('invite')?.trim() ?? ''

  if (queryToken) {
    storeToken(queryToken)
    url.searchParams.delete('invite')
    window.history.replaceState(window.history.state, '', url)
    return queryToken
  }

  return readStoredToken()
}

export function clearPendingInviteToken() {
  memoryToken = null

  try {
    window.sessionStorage.removeItem(pendingInviteStorageKey)
  } catch {
    // Nothing else is stored and the in-memory fallback has already been cleared.
  }

  const url = new URL(window.location.href)

  if (url.searchParams.has('invite')) {
    url.searchParams.delete('invite')
    window.history.replaceState(window.history.state, '', url)
  }
}

export function createInviteLink(token: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('invite', token)
  return url.toString()
}

export function createInviteEmailRedirectUrl(token: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin)
  url.searchParams.set('invite', token)
  return url.toString()
}
