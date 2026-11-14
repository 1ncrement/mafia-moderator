import type { SideId } from '../types'

// Правила, которым нужны литералы сторон и ролей. Больше нигде в коде их нет.

/** Чёрных не меньше, чем всех остальных вместе. */
export function blackNotLess(bySide: Record<SideId, number>): boolean {
  const black = bySide.black ?? 0
  const others = Object.entries(bySide).reduce((sum, [side, n]) => (side === 'black' ? sum : sum + n), 0)
  return black >= others
}

/** Подсказка о фактическом конце игры: чёрных не осталось или их не меньше остальных. */
export function endHintFor(bySide: Record<SideId, number>): 'no_black' | 'black_not_less' | null {
  if ((bySide.black ?? 0) === 0) return 'no_black'
  return blackNotLess(bySide) ? 'black_not_less' : null
}
