import type { Registry, RoleId } from './types'

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

// ── Раздача с учётом прошлых игр ────────────────────────────────────────────
// Игры текущего игрового дня выравнивают шансы номеров: кто уже играл активную роль, получает её реже,
// ту же самую роль — ещё реже. Это шансы, а не очередь: нулевого веса нет, расклад по прошлым играм не вычислить наверняка.
// Судим только по номерам — людей приложение не знает.

/** Прошлая игра: роли по номерам (индекс = номер − 1) и перечень ролей той игры — по нему решается, какая роль активная. */
export type PastDeal = { roles: readonly RoleId[]; registry: Registry }
/**
 * История номера за учтённые игры: active — в скольких играх у него была активная роль;
 * played — сколько раз он играл роль, ключ — название, под которым роль видна на столе.
 */
export type SeatHistory = { active: number; played: Record<RoleId, number> }

/** Во сколько раз падает вес номера за каждую активную игру и за каждый повтор той же роли. */
export const HISTORY_FACTOR = 3
/**
 * Наибольшая разница показателей между номерами, которую различает раздача: дальше номер и так «почти никогда».
 * Обрезка держит сумму целых весов в диапазоне генератора: 20 мест × 3^8 = 131 220.
 */
export const HISTORY_MAX_SPREAD = 8

/** Активная роль — роль с ночным действием (определение заказчика из дополнения «Свои роли»). */
const wakesAtNight = (registry: Registry, roleId: RoleId): boolean => registry.nightActions.some((a) => a.performers.includes(roleId))
const isFiller = (registry: Registry, roleId: RoleId): boolean => registry.roles.find((r) => r.id === roleId)?.filler === true
/**
 * Одна и та же роль — одно название на столе: мафия и глава мафии не различаются.
 * Своя роль узнаётся по названию: удалённая и заведённая заново под тем же именем получает новый идентификатор, а роль та же.
 * Приставка не даёт названию своей роли совпасть с идентификатором встроенной.
 */
function shownAs(registry: Registry, roleId: RoleId): string {
  const def = registry.roles.find((r) => r.id === roleId)
  return def?.custom && def.name ? `name:${def.name.toLowerCase()}` : def?.displayAs ?? roleId
}

/**
 * Сколько прошлых игр учла раздача, по записи в журнале. Годится только целое положительное число;
 * всё остальное (поля нет, ноль, запись другой версии) — раздача случайная. Одна проверка для команды, журнала и экрана.
 */
export function dealtHistory(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * Счётчики по номерам из прошлых игр. seats — число мест за нынешним столом: у номеров, которых в прошлой игре не было,
 * истории из неё нет; лишние номера прошлой игры отбрасываются. Мирный житель (роль-остаток) не считается вовсе.
 */
export function seatHistory(games: readonly PastDeal[], seats: number): SeatHistory[] {
  const out: SeatHistory[] = Array.from({ length: seats }, () => ({ active: 0, played: {} }))
  for (const game of games) {
    game.roles.slice(0, seats).forEach((roleId, i) => {
      const seat = out[i]
      if (!seat || isFiller(game.registry, roleId)) return
      const key = shownAs(game.registry, roleId)
      seat.played[key] = (seat.played[key] ?? 0) + 1
      if (wakesAtNight(game.registry, roleId)) seat.active++
    })
  }
  return out
}

const NO_HISTORY: SeatHistory = { active: 0, played: {} }

/**
 * Раздача с учётом истории номеров (history[номер − 1]; номер без записи считается новым).
 * 1. Активные карты идут в случайном порядке; очередная достаётся одному из свободных номеров с шансом,
 *    который в HISTORY_FACTOR раз меньше за каждую активную игру номера и ещё во столько же — за каждый раз, когда он играл эту роль.
 * 2. Особые карты без ночного хода раздаются так же, но вес учитывает только повтор роли.
 * 3. Остаток (мирные) получают оставшиеся номера.
 * Колода раздаётся ровно как задана. Истории нет — все веса равны, это полный рандом.
 */
export function dealWithHistory(deck: readonly RoleId[], history: readonly SeatHistory[], registry: Registry, randomInt: RandomInt): RoleId[] {
  const out: RoleId[] = [...deck]
  const free = deck.map((_, i) => i)
  const give = (cards: RoleId[], exponent: (seat: SeatHistory, role: RoleId) => number): void => {
    for (const card of shuffle(cards, randomInt)) {
      const role = shownAs(registry, card)
      const exponents = free.map((i) => {
        const value = exponent(history[i] ?? NO_HISTORY, role)
        return Number.isFinite(value) && value > 0 ? value : 0
      })
      // Важна только разница между номерами: показатели считаются от наименьшего и обрезаются — веса остаются целыми и небольшими.
      const least = Math.min(...exponents)
      const weights = exponents.map((e) => HISTORY_FACTOR ** (HISTORY_MAX_SPREAD - Math.min(HISTORY_MAX_SPREAD, e - least)))
      let point = randomInt(weights.reduce((a, b) => a + b, 0))
      let pick = 0
      while (pick < weights.length - 1 && point >= (weights[pick] as number)) point -= weights[pick++] as number
      out[free[pick] as number] = card
      free.splice(pick, 1)
    }
  }
  const active = deck.filter((card) => wakesAtNight(registry, card))
  const special = deck.filter((card) => !wakesAtNight(registry, card) && !isFiller(registry, card))
  const rest = deck.filter((card) => !wakesAtNight(registry, card) && isFiller(registry, card))
  give(active, (seat, role) => seat.active + (seat.played[role] ?? 0))
  give(special, (seat, role) => seat.played[role] ?? 0)
  rest.forEach((card, i) => { out[free[i] as number] = card })
  return out
}
