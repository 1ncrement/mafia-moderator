import type { AppStore } from '../../app/store'
import type { GameState, Seat, Session, SpeechKind, TimerState } from '../../engine'

// Что сейчас происходит в дне: чья речь ожидается и какой таймер считается «живым».
// Общая логика для панели таймера и клавиши «пробел».

export const aliveOf = (game: GameState): Seat[] => game.players.filter((p) => p.status === 'alive').map((p) => p.seat)

export type Expected = { kind: SpeechKind; seat: Seat | null } | null

/** Речь, которую шаг предлагает следующей: её показывает таймер в состоянии «готов». */
export function expectedSpeech(game: GameState): Expected {
  const day = game.day
  if (!day) return null
  const first = (seats: Seat[], kind: SpeechKind): Expected => (seats[0] === undefined ? null : { kind, seat: seats[0] })
  switch (game.step) {
    case 'balagan': return { kind: 'balagan', seat: null }
    case 'speeches': return day.opener === null ? null : first(day.waiting, 'speech')
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
  const next = expectedSpeech(game)
  if (!next) return
  const given = store.speak(next.kind, next.seat)
  if (given.ok && session.config.separateTimerStart) store.timer({ type: 'start' })
}
