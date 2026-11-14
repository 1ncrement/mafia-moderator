import { useEffect, useRef } from 'react'

export type HotkeyName = 'space' | 'enter' | 'undo' | 'hide' | 'escape' | `digit${number}`
export type HotkeyMap = Partial<Record<HotkeyName, () => void>>

function keyName(e: KeyboardEvent): HotkeyName | null {
  const command = e.metaKey || e.ctrlKey
  if (command) return !e.altKey && !e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') ? 'undo' : null
  if (e.altKey) return null
  if (e.key === ' ' || e.code === 'Space') return 'space'
  if (e.key === 'Enter') return 'enter'
  if (e.key === 'Escape') return 'escape'
  // По физической клавише: в русской раскладке на месте H стоит «р».
  if (e.code === 'KeyH' || e.key.toLowerCase() === 'h') return 'hide'
  if (/^[0-9]$/.test(e.key)) return `digit${Number(e.key)}`
  return null
}

const inField = (el: Element | null) =>
  el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)

/** Кнопка, на которую ведущий пришёл клавишей Tab: Enter и пробел остаются за ней. */
function keyboardFocused(el: Element | null): boolean {
  if (!(el instanceof HTMLElement) || !el.matches('button, a[href], [role="menuitem"], [role="switch"], [role="radio"]')) return false
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}

/**
 * Горячие клавиши экрана: один слушатель keydown на document, снимается при уходе с экрана.
 * Клавиши не действуют под открытым окном и в поле ввода; автоповтор игнорируется.
 */
export function useHotkeys(map: HotkeyMap, enabled: boolean): void {
  const latest = useRef(map)
  useEffect(() => {
    latest.current = map
  })
  useEffect(() => {
    if (!enabled) return
    const active = (e: KeyboardEvent) =>
      !document.querySelector('[role="dialog"]') && !inField(e.target as Element | null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || !active(e)) return
      const name = keyName(e)
      const handler = name ? latest.current[name] : undefined
      if (!name || !handler) return
      if ((name === 'enter' || name === 'space') && keyboardFocused(e.target as Element | null)) return
      // Иначе Enter ещё и «нажал» бы кнопку, по которой только что кликнули мышью.
      e.preventDefault()
      handler()
    }
    // Пробел нажимает кнопку в фокусе на отпускании клавиши — гасим и его.
    const onKeyUp = (e: KeyboardEvent) => {
      if (keyName(e) === 'space' && latest.current.space && active(e) && !keyboardFocused(e.target as Element | null)) e.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [enabled])
}
