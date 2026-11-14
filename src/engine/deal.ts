import type { RoleId } from './types'

/** Равномерное целое из [0, maxExclusive). Источник случайности приходит снаружи. */
export type RandomInt = (maxExclusive: number) => number

/** Перемешивание Фишера–Йетса. Возвращает новый массив, исходный не трогает. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return out
}

/** Раздача: колода перемешивается, номер i получает i-ю карту (индекс = номер игрока − 1). */
export function dealRoles(deck: readonly RoleId[], randomInt: RandomInt): RoleId[] {
  return shuffle(deck, randomInt)
}
