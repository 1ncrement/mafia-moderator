import { dayState } from './day'
import { currentPhase, lastOf, samePhase } from './log'
import { playersNow } from './players'
import { endHintFor } from './roles/rules'
import type { GameState, PhaseRef, Registry, Session, SideId, StateWarning, StepId } from './types'

// Вывод состояния стола из журнала. Проход по журналу никогда не бросает исключений:
// событие с неизвестной ссылкой или местом вне диапазона просто пропускается.

function defaultStep(session: Session, phase: PhaseRef): StepId | null {
  if (phase.kind === 'day') return phase.n < session.config.rules.balaganFromDay ? 'speeches' : 'balagan'
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

  const warnings: StateWarning[] = []
  for (const b of day?.ballots ?? []) if (b.overflow && !b.resolved) warnings.push({ code: 'votes_overflow', ballot: b.n })

  return {
    phase: dealt ? phase : null,
    step: entered?.step ?? defaultStep(session, phase),
    players: views,
    counts: { total: views.length, alive, bySide },
    endHint: endHintFor(bySide),
    finished: finished ? { winner: finished.winner } : null,
    warnings,
    day,
  }
}
