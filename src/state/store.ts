import { useEffect, useState } from 'preact/hooks'

export interface Store<T> {
  get(): T
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void
  subscribe(fn: (s: T) => void): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const subs = new Set<(s: T) => void>()
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...p }
      subs.forEach((fn) => fn(state))
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function useStore<T extends object>(store: Store<T>): T {
  const [s, setS] = useState(store.get())
  useEffect(() => {
    setS(store.get())
    return store.subscribe(setS)
  }, [store])
  return s
}
