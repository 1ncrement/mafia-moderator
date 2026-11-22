import { currentPhase } from './log'
import { aliveSeats, isSeat, playersNow } from './players'
import type { EventOf, FoulPenalty, FoulsState, GameEvent, Registry, Seat, Session } from './types'

// Фолы: счёт за игру и наказание за каждый третий. Счёт ведёт журнал событий; наказание — решение ведущего.

/** Сколько фолов до наказания: порог — каждый третий фол (3, 6, 9…). */
export const FOULS_PER_PENALTY = 3

/** Достигнутый порог при таком счёте: 0, 3, 6… */
export function foulLevel(count: number): number {
  return Math.floor(count / FOULS_PER_PENALTY) * FOULS_PER_PENALTY
}

const isFoul = (session: Session, e: GameEvent): e is EventOf<'foul_given'> => e.type === 'foul_given' && isSeat(session, e.seat)

/** Фолы за игру по местам: counts[seat - 1]. */
export function foulCounts(session: Session): number[] {
  const counts = Array.from({ length: session.config.playerCount }, () => 0)
  for (const e of session.log) if (isFoul(session, e)) counts[e.seat - 1] = (counts[e.seat - 1] ?? 0) + 1
  return counts
}

/** Который по счёту фол игрока записан этим событием. */
export function foulOrdinal(session: Session, event: EventOf<'foul_given'>): number {
  return session.log.filter((e) => isFoul(session, e) && e.seat === event.seat && e.seq <= event.seq).length
}

/**
 * Решения ведущего, которые в силе: последнее на каждый порог каждого игрока.
 * Решение по порогу, до которого счёт больше не дотягивает (фол сняли), не считается.
 */
export function foulPenalties(session: Session): FoulPenalty[] {
  const counts = foulCounts(session)
  const last = new Map<string, FoulPenalty>()
  // Позднее решение записано позже: порядок — по seq.
  for (const e of [...session.log].sort((a, b) => a.seq - b.seq)) {
    if (e.type !== 'foul_penalty' || !isSeat(session, e.seat) || (counts[e.seat - 1] ?? 0) < e.level) continue
    last.set(`${e.seat}:${e.level}`, { seat: e.seat, level: e.level, applied: e.applied === true, day: e.day, eventId: e.id })
  }
  return [...last.values()].sort((a, b) => a.seat - b.seat || a.level - b.level)
}

/** Кто не говорит в День n за фолы — по применённым решениям; выбыл игрок или нет, здесь не проверяется. */
export function penalizedOn(session: Session, n: number): Seat[] {
  return [...new Set(foulPenalties(session).filter((p) => p.applied && p.day === n).map((p) => p.seat))].sort((a, b) => a - b)
}

/**
 * На какой день придётся наказание, если применить его сейчас: игрок не говорит один день — ближайшую свою очередь в круге.
 * Днём, пока он ещё ждёт слова (waiting — кто ждёт слова в сегодняшнем круге), это сегодня; он уже говорил, говорит сейчас,
 * пропущен или идёт ночь — следующий день.
 */
export function penaltyDay(session: Session, seat: Seat, waiting: readonly Seat[]): number {
  const phase = currentPhase(session.log)
  if (phase.kind === 'deal') return 1
  return phase.kind === 'day' && waiting.includes(seat) ? phase.n : phase.n + 1
}

/**
 * Неотбытые наказания: применённые, чей ход без речи ещё впереди — день наказания не раньше ближайшей своей очереди игрока.
 * Заказчик: «наказания до исполнения не накапливаются, накапливаются фолы» — пока у игрока есть такое, новое ему не добавляется.
 */
export function upcomingPenalties(session: Session, waiting: readonly Seat[]): FoulPenalty[] {
  return foulPenalties(session).filter((p) => p.applied && p.day >= penaltyDay(session, p.seat, waiting))
}

/** Порог level игрока пришёлся на неотбытое наказание: так записан сам фол, которым порог достигнут. */
function isAbsorbed(session: Session, seat: Seat, level: number): boolean {
  const given = session.log.filter((e): e is EventOf<'foul_given'> => isFoul(session, e) && e.seat === seat).sort((a, b) => a.seq - b.seq)
  return given[level - 1]?.absorbed === true
}

/** Порог, по которому ведущий ещё не решил: достигнут, решения нет, на неотбытое наказание он не пришёлся. 0 — такого нет. */
function openLevel(session: Session, seat: Seat, count: number, penalties: readonly FoulPenalty[]): number {
  const level = foulLevel(count)
  if (level === 0 || penalties.some((p) => p.seat === seat && p.level === level) || isAbsorbed(session, seat, level)) return 0
  return level
}

/**
 * Порог, к которому относится решение ведущего сейчас. По порядку:
 * нерешённый порог; иначе неотбытое наказание игрока; иначе его последнее решение, если наказание по нему не применено.
 * Счёт мог уйти дальше порога наказания (фолы при неотбытом наказании считаются, но нового не дают):
 * «Отменить наказание» и «Применить наказание» меняют то самое решение, а не заводят второе.
 * 0 — решать нечего. Отбытое наказание окончательно: его не отменить и не применить заново —
 * иначе день считался бы снова, и одно решение дало бы два дня без речи.
 */
export function decisionLevel(session: Session, seat: Seat, waiting: readonly Seat[]): number {
  const penalties = foulPenalties(session)
  const open = openLevel(session, seat, foulCounts(session)[seat - 1] ?? 0, penalties)
  if (open > 0) return open
  const upcoming = upcomingPenalties(session, waiting).filter((p) => p.seat === seat).at(-1)
  if (upcoming) return upcoming.level
  const last = penalties.filter((p) => p.seat === seat).at(-1)
  return last && !last.applied ? last.level : 0
}

/** Состояние фолов: счёт, решения и пороги, по которым ведущий ещё не решил. waiting — кто ждёт слова в сегодняшнем круге. */
export function foulsState(session: Session, registry: Registry, waiting: readonly Seat[]): FoulsState {
  const counts = foulCounts(session)
  const penalties = foulPenalties(session)
  const alive = new Set(aliveSeats(playersNow(session, registry)))
  const pending = counts.flatMap((count, i) => {
    const seat = i + 1
    const level = openLevel(session, seat, count, penalties)
    // Выбывшего не наказывают: вопрос появится, если он вернётся в игру.
    if (level === 0 || !alive.has(seat)) return []
    return [{ seat, level, day: penaltyDay(session, seat, waiting) }]
  })
  return { counts, penalties, upcoming: upcomingPenalties(session, waiting), pending }
}
