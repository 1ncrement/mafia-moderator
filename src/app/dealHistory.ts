import type { PhaseRef } from '../engine'

// Игровой день для раздачи с учётом прошлых игр. Часы — забота приложения: движок о времени не знает.

/** Час, с которого начинается игровой день: вечер, затянувшийся за полночь, остаётся одним днём. */
export const GAME_DAY_START_HOUR = 6

/** Начало текущего игрового дня: ближайшие прошедшие 6:00 по часам этого компьютера. */
export function gameDayStart(now: number): number {
  const d = new Date(now)
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), GAME_DAY_START_HOUR).getTime()
  return now >= today ? today : new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, GAME_DAY_START_HOUR).getTime()
}

/** Игра дошла до Ночи 1 — роли действительно сыграны. Раздача без игры и игра, брошенная в День 1, не в счёт. */
export function reachedNight(phase: PhaseRef): boolean {
  return phase.kind === 'night' || (phase.kind === 'day' && phase.n >= 2)
}

/** Время на часах этого компьютера: «19:05». */
export function clockText(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
