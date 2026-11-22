import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Seat } from '../../engine'

// Метки на карточках, которые ставит панель шага: голоса в голосовании, ночные метки ночью.

/**
 * tone: night — ночная метка, скрывается вместе с ролями; block — «заблокирован», красная, тоже ночная;
 * solo — «сам за себя», часть роли, скрывается вместе с ней; open — «жилет снят · открыт» и silent — «молчит»: это знает весь стол, видны всегда;
 * day — янтарная; plain — обычная; foul — счёт фолов за игру, виден всегда.
 */
export type SeatMark = { text: string; tone: 'plain' | 'day' | 'night' | 'block' | 'solo' | 'open' | 'silent' | 'foul' }
export type TableMarks = { marks: Record<Seat, SeatMark[]>; highlight: Seat | null }

const EMPTY: TableMarks = { marks: {}, highlight: null }
const SetContext = createContext<((value: TableMarks) => void) | null>(null)
const ValueContext = createContext<TableMarks>(EMPTY)

export function TableMarksProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<TableMarks>(EMPTY)
  return (
    <SetContext.Provider value={setValue}>
      <ValueContext.Provider value={value}>{children}</ValueContext.Provider>
    </SetContext.Provider>
  )
}

/** Панель шага сообщает столу свои метки; уходя с шага, снимает их. */
export function useTableMarks(marks: Record<Seat, SeatMark[]>, highlight: Seat | null = null): void {
  const set = useContext(SetContext)
  const key = JSON.stringify([marks, highlight])
  // Значение пересобирается из ключа: метки меняются только вместе с содержимым, а не при каждой перерисовке.
  const value = useMemo<TableMarks>(() => {
    const [parsedMarks, parsedHighlight] = JSON.parse(key) as [Record<Seat, SeatMark[]>, Seat | null]
    return { marks: parsedMarks, highlight: parsedHighlight }
  }, [key])
  useEffect(() => {
    set?.(value)
    return () => set?.(EMPTY)
  }, [set, value])
}

export function useTableMarksValue(): TableMarks {
  return useContext(ValueContext)
}
