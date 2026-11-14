import { useEffect, useReducer } from 'react'
import { useStore } from '../../app/StoreContext'

/**
 * Текущее время по часам приложения. Тики только перерисовывают экран: остаток таймера
 * каждый раз считается от момента окончания. После сна ноутбука и возврата во вкладку
 * время обновляется сразу — по visibilitychange, focus и pageshow.
 */
export function useNow(intervalMs = 250): number {
  const store = useStore()
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    window.addEventListener('pageshow', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
      window.removeEventListener('pageshow', tick)
    }
  }, [intervalMs])
  return store.now()
}
