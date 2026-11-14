import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../common/Button'

// Главная кнопка одна на игровой экран. Панель шага сообщает подпись и действие,
// рисует кнопку GameScreen внизу панели шага; цвет — по фазе.

export type MainAction = { label: string; onPress(): void; disabled?: boolean } | null

type Registered = { label: string; disabled: boolean; press(): void } | null
const SetContext = createContext<((action: Registered) => void) | null>(null)
const ValueContext = createContext<Registered>(null)

export function MainActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<Registered>(null)
  return (
    <SetContext.Provider value={setAction}>
      <ValueContext.Provider value={action}>{children}</ValueContext.Provider>
    </SetContext.Provider>
  )
}

/** Панель шага сообщает подпись и действие главной кнопки. */
export function useMainAction(action: MainAction): void {
  const set = useContext(SetContext)
  if (!set) throw new Error('useMainAction: нет MainActionProvider')
  const latest = useRef(action)
  useEffect(() => {
    latest.current = action
  })
  const label = action?.label ?? null
  const disabled = action?.disabled === true
  useEffect(() => {
    set(label === null ? null : { label, disabled, press: () => latest.current?.onPress() })
    return () => set(null)
  }, [label, disabled, set])
}

/** Нажатие главной кнопки — для клика и для клавиши Enter. */
export function useMainPress(): { label: string | null; disabled: boolean; press(): void } {
  const action = useContext(ValueContext)
  const press = useCallback(() => {
    if (action && !action.disabled) action.press()
  }, [action])
  return useMemo(() => ({ label: action?.label ?? null, disabled: action?.disabled ?? true, press }), [action, press])
}

export function MainButton({ main }: { main: ReturnType<typeof useMainPress> }) {
  if (main.label === null) return null
  return (
    <Button variant="primary" size="xl" className="main-button" kbd="Enter" disabled={main.disabled} onClick={main.press}>
      {main.label}
    </Button>
  )
}
