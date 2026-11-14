import { dayState } from './day'
import { currentPhase, lastOf, samePhase } from './log'
import { nightState, permanentMarks } from './night'
import { playersNow } from './players'
import { endHintFor } from './roles/rules'
import type { GameState, NightState, PhaseRef, Registry, Session, SideId, StateWarning, StepId } from './types'

// Вывод состояния стола из журнала. Проход по журналу никогда не бросает исключений:
// событие с неизвестной ссылкой или местом вне диапазона просто пропускается.

export const SUMMARY_STEP: StepId = 'summary'

function defaultStep(session: Session, phase: PhaseRef, night: NightState | null): StepId | null {
  if (phase.kind === 'day') return phase.n < session.config.rules.balaganFromDay ? 'speeches' : 'balagan'
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

  // Шаг ночи, которого больше нет (носитель выбыл задним числом), сбрасывается на первый.
  let step = entered?.step ?? defaultStep(session, phase, night)
  if (night && step !== SUMMARY_STEP && !night.steps.some((x) => x.id === step)) step = defaultStep(session, phase, night)

  const warnings: StateWarning[] = []
  // Правка прошлой записи не меняет статусы молча: расхождение итога ночи становится предупреждением.
  const nights = phase.kind === 'deal' ? 0 : phase.n
  for (let n = 1; n <= nights; n++) {
    const past = night?.n === n ? night : nightState(session, registry, n)
    if (past.confirmed && past.confirmed.hinted !== past.outcome.dies) {
      warnings.push({ code: 'night_outcome_changed', night: n, expected: past.outcome.dies })
    }
  }
  for (const b of day?.ballots ?? []) if (b.overflow && !b.resolved) warnings.push({ code: 'votes_overflow', ballot: b.n })

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
    // Ночей в журнале не больше, чем номер текущей фазы.
    permanentMarks: permanentMarks(session, registry, nights),
  }
}
