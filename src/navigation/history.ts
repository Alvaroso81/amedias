import type { AppPage, NavigationParams } from '../types/navigation'

export type NavigationEntry = {
  id: number
  page: AppPage
  params: NavigationParams
  view: Record<string, unknown>
}

type BrowserHistory = {
  readonly state: unknown
  pushState: (state: unknown, title: string) => void
  replaceState: (state: unknown, title: string) => void
  go: (offset: number) => void
  addEventListener: (type: 'popstate', listener: (event: { state: unknown }) => void) => void
  removeEventListener: (type: 'popstate', listener: (event: { state: unknown }) => void) => void
}

type Marker = { session: string; id: number; index: number }
function readMarker(state: unknown): Marker | null {
  if (!state || typeof state !== 'object' || !('amediasNavigation' in state)) return null
  const marker = state.amediasNavigation
  if (!marker || typeof marker !== 'object') return null
  if (!('session' in marker) || typeof marker.session !== 'string' ||
      !('id' in marker) || typeof marker.id !== 'number' ||
      !('index' in marker) || !Number.isInteger(marker.index)) return null
  return marker as Marker
}

// Views stay in memory; browser entries contain only an opaque session/entry marker.
export function createNavigation(browser: BrowserHistory, session: string) {
  let sequence = 0
  let entries: NavigationEntry[] = [{ id: sequence++, page: 'home', params: {}, view: {} }]
  let index = 0
  let current = entries[index]
  let pendingRoot: NavigationEntry | null = null
  let travelling = false
  const rootViews = new Map<AppPage, Record<string, unknown>>()
  const listeners = new Set<() => void>()
  const emit = () => { current = entries[index]; listeners.forEach((listener) => listener()) }
  const markerState = () => ({
    ...(browser.state && typeof browser.state === 'object' ? browser.state : {}),
    amediasNavigation: { session, id: entries[index].id, index },
  })
  const replaceRoot = (entry: NavigationEntry) => {
    entries = [entry]
    index = 0
    pendingRoot = null
    travelling = false
    browser.replaceState(markerState(), '')
    emit()
  }
  const onPopState = (event: { state: unknown }) => {
    const marker = readMarker(event.state)
    if (!marker || marker.session !== session) return
    if (pendingRoot) {
      if (marker.index === 0) replaceRoot(pendingRoot)
      return
    }
    const destination = entries.findIndex((entry) => entry.id === marker.id)
    if (destination < 0) {
      // Resetting a tab leaves obsolete native Forward entries until the next push.
      travelling = true
      browser.go(index - marker.index)
      return
    }
    index = destination
    travelling = false
    emit()
  }

  return {
    start() {
      browser.replaceState(markerState(), '')
      browser.addEventListener('popstate', onPopState)
    },
    stop() { browser.removeEventListener('popstate', onPopState) },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => current,
    previous: () => index > 0 ? entries[index - 1] : null,
    getPageState: (id: number, key: string) => entries.find((entry) => entry.id === id)?.view[key],
    setPageState(id: number, key: string, value: unknown) {
      const entry = entries.find((candidate) => candidate.id === id)
      if (!entry) return
      entry.view[key] = value
      if (entry === entries[0]) rootViews.set(entry.page, entry.view)
    },
    navigate(page: AppPage, params: NavigationParams = {}, options: { root?: boolean; replace?: boolean } = {}) {
      const next = { id: sequence++, page, params, view: options.root ? rootViews.get(page) ?? {} : {} }
      if (options.root) {
        if (pendingRoot) { pendingRoot = next; return }
        if (travelling) return
        if (index === 0) replaceRoot(next)
        else {
          pendingRoot = next
          travelling = true
          browser.go(-index)
        }
        return
      }
      if (travelling) return
      if (options.replace) {
        entries[index] = next
        browser.replaceState(markerState(), '')
      } else {
        entries = entries.slice(0, index + 1)
        entries.push(next)
        index++
        browser.pushState(markerState(), '')
      }
      emit()
    },
    goBack() {
      if (index === 0 || travelling) return
      travelling = true
      browser.go(-1)
    },
  }
}

export type Navigation = ReturnType<typeof createNavigation>
