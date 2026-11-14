import type { SideId } from '../types'

// Правила, которым нужны литералы сторон и ролей. Больше нигде в коде их нет.

/** Чёрных не меньше, чем всех остальных вместе. */
export function blackNotLess(bySide: Record<SideId, number>): boolean {
  const black = bySide.black ?? 0
  const others = Object.entries(bySide).reduce((sum, [side, n]) => (side === 'black' ? sum : sum + n), 0)
  return black >= others
}
