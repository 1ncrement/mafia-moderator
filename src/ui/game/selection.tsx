import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Seat } from '../../engine'

// Режим выбора стола, общий для ночи, выставления и обмена ролями:
// над столом вопрос, клик по разрешённой карточке — ответ.

export type Selection = {
  question: string
  allowed: Seat[]
  picked: Seat | null
  /** Подписи на карточках: «прошлая ночь», «уже выставлен». */
  marks: Record<Seat, string>
  onPick(seat: Seat | null): void
  onCancel(): void
  /** Показывать плитку «Никого» (по умолчанию да). */
  nobody?: boolean
  /** Показывать «Отмена» (по умолчанию да). Ночной шаг держит выбор открытым всё время. */
  cancel?: boolean
} | null

type Api = { selection: Selection; ask(s: NonNullable<Selection>): void; clear(): void }
const SelectionContext = createContext<Api | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>(null)
  const ask = useCallback((s: NonNullable<Selection>) => setSelection(s), [])
  const clear = useCallback(() => setSelection(null), [])
  const api = useMemo(() => ({ selection, ask, clear }), [selection, ask, clear])
  return <SelectionContext.Provider value={api}>{children}</SelectionContext.Provider>
}

export function useSelection(): Api {
  const api = useContext(SelectionContext)
  if (!api) throw new Error('useSelection: нет SelectionProvider')
  return api
}

/** Разовый вопрос: после ответа или отмены режим выбора закрывается сам. */
export function useAskOnce() {
  const { ask, clear } = useSelection()
  return useCallback((q: { question: string; allowed: Seat[]; marks?: Record<Seat, string>; nobody?: boolean; onPick(seat: Seat | null): void }) => {
    ask({
      question: q.question, allowed: q.allowed, picked: null, marks: q.marks ?? {}, nobody: q.nobody ?? false,
      onPick: (seat) => {
        clear()
        q.onPick(seat)
      },
      onCancel: clear,
    })
  }, [ask, clear])
}
