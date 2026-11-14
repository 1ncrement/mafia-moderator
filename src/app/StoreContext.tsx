import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { translate } from './i18n'
import type { Lang, Params, TKey } from './i18n'
import type { AppState, AppStore } from './store'

const StoreContext = createContext<AppStore | null>(null)

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): AppStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore: нет StoreProvider')
  return store
}

/** Состояние приложения; компонент перерисовывается при каждом изменении. */
export function useApp(): AppState {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getState)
}

export function useLang(): Lang {
  return useApp().settings.lang
}

export type T = (key: TKey, params?: Params) => string

export function useT(): T {
  const lang = useLang()
  return useCallback((key, params) => translate(lang, key, params), [lang])
}
