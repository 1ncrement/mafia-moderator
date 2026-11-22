import { useEffect, useRef, useState } from 'react'
import { useApp, useStore } from '../../app/StoreContext'
import { crossedWarning, crossedZero } from '../../engine'
import { useNow } from './useNow'

const FLASH_MS = 3000

/**
 * Сигналы таймера — любого: речи, доп. минуты, оправдания, речи при ничьей, прощания, балагана и свободного.
 * Когда остаётся 10 секунд — короткое предупреждение; по нулю — сигнал конца и мигание панели около трёх секунд.
 * После сна ноутбука и перезагрузки страницы сигналы не повторяются. Возвращает «мигать ли сейчас».
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
      if (settings.sound) store.beep('end')
      setFlashUntil(now + FLASH_MS)
    } else if (timer && crossedWarning(timer, prev.current, now)) {
      // Осталось 10 секунд — отдельный короткий сигнал; цифры таймера в это же время меняют цвет.
      if (settings.sound) store.beep('warn')
    }
    prev.current = now
  }, [timer, now, settings.sound, store])

  return now < flashUntil
}
