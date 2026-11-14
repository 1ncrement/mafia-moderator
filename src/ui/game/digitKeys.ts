import { createContext, useContext, useEffect } from 'react'
import type { RefObject } from 'react'

/** Цифровые клавиши отдаются панели шага (ввод голосов): слушатель клавиш на экране один. */
export const DigitKeysContext = createContext<RefObject<((n: number) => void) | null> | null>(null)

export function useDigitKeys(handler: ((n: number) => void) | null): void {
  const ref = useContext(DigitKeysContext)
  useEffect(() => {
    if (!ref) return
    ref.current = handler
    return () => {
      ref.current = null
    }
  })
}
