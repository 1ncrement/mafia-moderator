import type { Seat, TimerKind, TimerState } from './types'

// Таймер по моменту окончания. Источник истины — endsAt по системным часам:
// остаток каждый раз вычисляется заново, поэтому сон ноутбука и перезагрузка страницы его не сбивают.
// Текущее время приходит параметром.

export type TimerAction =
  | { type: 'start' } | { type: 'pause' } | { type: 'resume' } | { type: 'add'; ms: number } | { type: 'reset' }

export function newTimer(kind: TimerKind, seat: Seat | null, durationMs: number): TimerState {
  return { kind, seat, durationMs, status: 'ready', endsAt: null, remainingMs: durationMs }
}

export function timerReduce(state: TimerState, action: TimerAction, now: number): TimerState {
  switch (action.type) {
    case 'start':
    case 'resume':
      if (state.status === 'running') return state
      return { ...state, status: 'running', endsAt: now + state.remainingMs }
    case 'pause':
      if (state.status !== 'running' || state.endsAt === null) return state
      return { ...state, status: 'paused', endsAt: null, remainingMs: state.endsAt - now }
    case 'add':
      // Из истёкшего состояния добавка отсчитывается от текущего момента.
      if (state.status === 'running' && state.endsAt !== null) {
        return { ...state, endsAt: Math.max(state.endsAt, now) + action.ms }
      }
      return { ...state, remainingMs: Math.max(state.remainingMs, 0) + action.ms }
    case 'reset':
      return { ...state, status: 'ready', endsAt: null, remainingMs: state.durationMs }
  }
}

export function timerView(
  state: TimerState, now: number,
): { remainingMs: number; overrunMs: number; expired: boolean; lastTen: boolean } {
  const left = state.status === 'running' && state.endsAt !== null ? state.endsAt - now : state.remainingMs
  const expired = left <= 0
  return {
    remainingMs: expired ? 0 : left,
    overrunMs: left < 0 ? -left : 0,
    expired,
    lastTen: !expired && state.status !== 'ready' && left <= 10_000,
  }
}

/** Момент нуля попал в (prevNow, now] — сигнал звучит один раз, после сна и перезагрузки не повторяется. */
export function crossedZero(state: TimerState, prevNow: number, now: number): boolean {
  return state.status === 'running' && state.endsAt !== null && prevNow < state.endsAt && state.endsAt <= now
}
