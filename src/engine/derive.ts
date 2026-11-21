import { dayState, nightFarewellSeats } from './day'
import { currentPhase, lastOf, samePhase } from './log'
import { actionOfStepId, deathSeats, nightState, permanentMarks } from './night'
import { leftAtNight, playersNow } from './players'
import { endHintFor } from './roles/rules'
import { balaganInDay } from './setup'
import type { GameState, Morning, NightState, PhaseRef, Registry, Session, SideId, StateWarning, StepId } from './types'

// Вывод состояния стола из журнала. Проход по журналу никогда не бросает исключений:
// событие с неизвестной ссылкой или местом вне диапазона просто пропускается.

export const SUMMARY_STEP: StepId = 'summary'

function defaultStep(session: Session, phase: PhaseRef, night: NightState | null, nightFarewell: boolean): StepId | null {
  // День открывается прощанием выбывших ночью, когда есть кому прощаться; иначе — балаганом или кругом речей.
  if (phase.kind === 'day') return nightFarewell ? 'night_farewell' : balaganInDay(session.config.rules, phase.n) ? 'balagan' : 'speeches'
  if (phase.kind === 'night') return night?.steps[0]?.id ?? SUMMARY_STEP
  return null
}

export function deriveState(session: Session, registry: Registry): GameState {
  const dealt = lastOf(session.log, 'roles_dealt')
  const phase = currentPhase(session.log)
  const views = playersNow(session, registry)

  const bySide: Record<SideId, number> = Object.fromEntries(registry.sides.map((s) => [s.id, 0]))
  let alive = 0
  for (const p of views) {
    if (p.status !== 'alive') continue
    alive++
    if (p.side in bySide) bySide[p.side] = (bySide[p.side] ?? 0) + 1
  }

  const entered = lastOf(session.log, 'step_entered', (e) => samePhase(e.phase, phase))
  const finished = lastOf(session.log, 'game_finished')
  const day = phase.kind === 'day' ? dayState(session, registry, phase.n) : null
  const night = phase.kind === 'night' ? nightState(session, registry, phase.n) : null

  // Носитель шага сменился (выбыл, вернулся, поменял роль) — ведущий остаётся на шаге того же действия.
  // На первый шаг сбрасываемся, только если такого действия в ночи больше нет.
  // Список прощающихся — по статусам, а не по очереди: говорящий сейчас из очереди уже вышел, а шаг остаётся.
  const farewell = day ? nightFarewellSeats(session, views, day.n) : []
  let step = entered?.step ?? defaultStep(session, phase, night, farewell.length > 0)
  if (night && step !== null && step !== SUMMARY_STEP && !night.steps.some((x) => x.id === step)) {
    const actionId = actionOfStepId(step)
    step = night.steps.find((x) => x.actionId === actionId)?.id ?? defaultStep(session, phase, night, false)
  }

  const warnings: StateWarning[] = []
  // Правка прошлой записи не меняет статусы молча: расхождение итога ночи становится предупреждением.
  const nights = phase.kind === 'deal' ? 0 : phase.n
  for (let n = 1; n <= nights; n++) {
    const past = night?.n === n ? night : nightState(session, registry, n)
    // Набор выбывших по подсказке изменился, но совпал с отметкой ведущего — исправлять нечего.
    const expected = deathSeats(past.outcome)
    const same = (seats: readonly number[]) => seats.join() === expected.join()
    if (past.confirmed && !same(past.confirmed.hinted) && !same(past.confirmed.chosen)) {
      warnings.push({ code: 'night_outcome_changed', night: n, expected })
    }
  }
  for (const b of day?.ballots ?? []) if (b.overflow && !b.resolved) warnings.push({ code: 'votes_overflow', ballot: b.n })

  // Утро выводится из статусов после прошлой ночи: ручная правка статуса и правка итога сразу меняют объявление.
  const morning: Morning | null = day && day.n >= 2 ? {
    deaths: leftAtNight(views, day.n - 1), farewell, spared: [], silenced: [],
    announced: session.log.some((e) => e.type === 'morning_announced' && samePhase(e.phase, phase)),
  } : null

  return {
    phase: dealt ? phase : null,
    step,
    players: views,
    counts: { total: views.length, alive, bySide },
    endHint: endHintFor(bySide),
    finished: finished ? { winner: finished.winner } : null,
    warnings,
    day,
    night,
    morning,
    // Ночей в журнале не больше, чем номер текущей фазы.
    permanentMarks: permanentMarks(session, registry, nights),
  }
}
