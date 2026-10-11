import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { createNavigation } from './history'
import type { Navigation, NavigationEntry } from './history'

export const NavigationContext = createContext<{ navigation: Navigation; entry: NavigationEntry } | null>(null)

export function useNavigation() {
  const [navigation] = useState(() => createNavigation({
    get state() { return window.history.state },
    pushState: (state, title) => window.history.pushState(state, title),
    replaceState: (state, title) => window.history.replaceState(state, title),
    go: (offset) => window.history.go(offset),
    addEventListener: (_, listener) => window.addEventListener('popstate', listener),
    removeEventListener: (_, listener) => window.removeEventListener('popstate', listener),
  }, crypto.randomUUID()))
  const entry = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot)
  useEffect(() => {
    navigation.start()
    return () => navigation.stop()
  }, [navigation])
  return { navigation, entry }
}

// A useState equivalent for navigation-relevant UI, scoped to this history entry.
// Standalone renders (e.g. component tests) retain the ordinary local-state behavior.
export function usePageState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(NavigationContext)
  const navigation = context?.navigation
  const id = context?.entry.id
  const [value, setValue] = useState<T>(() => {
    const saved = id !== undefined ? navigation?.getPageState(id, key) : undefined
    return saved !== undefined ? saved as T : typeof initial === 'function' ? (initial as () => T)() : initial
  })
  const setState = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    if (!navigation || id === undefined) { setValue(action); return }
    const previous = navigation.getPageState(id, key)
    const next = typeof action === 'function' ? (action as (value: T) => T)(previous !== undefined ? previous as T : value) : action
    navigation.setPageState(id, key, next)
    setValue(next)
  }, [id, key, navigation, value])
  return [value, setState]
}
