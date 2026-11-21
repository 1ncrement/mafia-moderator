import type { AppStore } from '../../app/store'
import type { Command, DayState, GameState, Rules, Seat, Session, SpeechKind, TimerState } from '../../engine'

// Что сейчас происходит в дне: чья речь ожидается и какой таймер считается «живым».
// Общая логика для панели таймера и клавиши «пробел».

export const aliveOf = (game: GameState): Seat[] => game.players.filter((p) => p.status === 'alive').map((p) => p.seat)

/** Кого из выгнанных спасёт жилет: он цел, изгнание не сработает, игрок останется в игре. */
export const sparedByVest = (game: GameState, seats: readonly Seat[]): Seat[] => seats.filter((seat) => game.players[seat - 1]?.vest === 'intact')

/**
 * Что идёт после исхода «выгнан»: прощание, если оно включено правилами партии и есть кому прощаться, иначе сразу ночь.
 * Статус «выгнан» ставит сам исход — этот шаг его не меняет. seats — кого выгоняют: спасённый жилетом не прощается.
 */
export function afterExpelled(rules: Rules, day: DayState, game: GameState, seats: readonly Seat[]): Command {
  const leaves = seats.length > sparedByVest(game, seats).length
  return rules.farewellAfterVote && leaves ? { type: 'enterStep', step: 'farewell' } : { type: 'startPhase', phase: { kind: 'night', n: day.n } }
}

export type Expected = { kind: SpeechKind; seat: Seat | null } | null

/** Речь, которую шаг предлагает следующей: её показывает таймер в состоянии «готов». */
export function expectedSpeech(game: GameState): Expected {
  const day = game.day
  if (!day) return null
  const first = (seats: Seat[], kind: SpeechKind): Expected => (seats[0] === undefined ? null : { kind, seat: seats[0] })
  switch (game.step) {
    case 'night_farewell': return first(day.nightFarewell.waiting, 'farewell')
    case 'balagan': return { kind: 'balagan', seat: null }
    // Круг пройден — в День 1 очередь продолжают доп. речи первых двоих. Очередь молчащего — ход без речи и без таймера.
    case 'speeches': {
      if (day.opener === null) return null
      const next = day.waiting[0]
      if (next !== undefined && day.silenced.includes(next)) return { kind: 'silent', seat: next }
      return first(day.waiting, 'speech') ?? first(day.closing.waiting, 'closing')
    }
    case 'defense': return first(day.defense.waiting, 'defense')
    case 'tiebreak': return first(day.tiebreak.waiting, 'tiebreak')
    case 'farewell': return first(day.farewell.waiting, 'farewell')
    default: return null
  }
}

/** Таймер, который идёт на самом деле: свободный или таймер текущей речи. */
export function liveTimer(session: Session, game: GameState): TimerState | null {
  const timer = session.timer
  if (!timer) return null
  if (timer.kind === 'free') return timer
  const speaking = game.day?.speaking
  return speaking && speaking.kind === timer.kind && speaking.seat === timer.seat ? timer : null
}

/** «Старт / Пауза / Продолжить» одной кнопкой и клавишей «пробел». */
export function toggleTimer(store: AppStore, session: Session, game: GameState): void {
  const live = liveTimer(session, game)
  if (live) {
    store.timer({ type: live.status === 'running' ? 'pause' : live.status === 'paused' ? 'resume' : 'start' })
    return
  }
  // Идёт ход молчащего: таймера у него нет, а слово дальше передаёт главная кнопка — пробел тут ничего не делает.
  if (game.day?.speaking?.kind === 'silent') return
  const next = expectedSpeech(game)
  if (!next) return
  const given = store.speak(next.kind, next.seat)
  if (given.ok && session.config.separateTimerStart) store.timer({ type: 'start' })
}
