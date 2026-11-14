import { useEffect, useRef, useState } from 'react'
import { useApp, useStore } from '../../app/StoreContext'
import { crossedZero } from '../../engine'
import { useNow } from './useNow'

const FLASH_MS = 3000

/**
 * Сигнал по нулю таймера: один звук в момент пересечения нуля и мигание панели около трёх секунд.
 * После сна ноутбука и перезагрузки страницы сигнал не повторяется. Возвращает «мигать ли сейчас».
 */
export function useTimerSignal(): boolean {
  const { session, settings } = useApp()
  const store = useStore()
  const now = useNow()
  const prev = useRef(now)
  const [flashUntil, setFlashUntil] = useState(0)
  const timer = session?.timer ?? null

  useEffect(() => {
    if (timer && crossedZero(timer, prev.current, now)) {
      if (settings.sound) store.beep()
      setFlashUntil(now + FLASH_MS)
    }
    prev.current = now
  }, [timer, now, settings.sound, store])

  return now < flashUntil
}
