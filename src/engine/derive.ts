import { phaseOrder } from './log'
import { endHintFor } from './roles/rules'
import type { GameEvent, GameState, PhaseRef, PlayerView, Registry, RoleId, Session, SideId, StepId } from './types'

// Вывод состояния стола из журнала. Проход по журналу никогда не бросает исключений:
// событие с неизвестной ссылкой или местом вне диапазона просто пропускается.

/** События в порядке для вывода: по фазе, внутри фазы по seq. */
export function orderedLog(log: readonly GameEvent[]): GameEvent[] {
  return [...log].sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || a.seq - b.seq)
}

export function lastOf<T extends GameEvent['type']>(
  log: readonly GameEvent[],
  type: T,
  where?: (e: Extract<GameEvent, { type: T }>) => boolean,
): Extract<GameEvent, { type: T }> | null {
  let found: Extract<GameEvent, { type: T }> | null = null
  for (const e of log) {
    if (e.type !== type) continue
    const typed = e as Extract<GameEvent, { type: T }>
    if (where && !where(typed)) continue
    if (!found || typed.seq > found.seq) found = typed
  }
  return found
}

/** Текущая фаза — фаза последнего phase_started; до него — распределение. */
export function currentPhase(log: readonly GameEvent[]): PhaseRef {
  return lastOf(log, 'phase_started')?.phase ?? { kind: 'deal' }
}

export function isSeat(session: Session, seat: unknown): seat is number {
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 1 && seat <= session.config.playerCount
}

/** Роли по местам: последняя раздача и все обмены после неё. Обмен действует задним числом. */
export function rolesBySeat(session: Session, registry: Registry): RoleId[] {
  const dealt = lastOf(session.log, 'roles_dealt')
  const filler = registry.roles.find((r) => r.filler)?.id ?? ''
  const roles: RoleId[] = []
  for (let i = 0; i < session.config.playerCount; i++) roles.push(dealt?.assignment[i] ?? filler)
  const swaps = session.log.filter((e) => e.type === 'roles_swapped' && (!dealt || e.seq > dealt.seq))
  for (const e of swaps.sort((a, b) => a.seq - b.seq)) {
    if (e.type !== 'roles_swapped' || !isSeat(session, e.a) || !isSeat(session, e.b)) continue
    const tmp = roles[e.a - 1] as RoleId
    roles[e.a - 1] = roles[e.b - 1] as RoleId
    roles[e.b - 1] = tmp
  }
  return roles
}

function players(session: Session, registry: Registry, before: PhaseRef | null): PlayerView[] {
  const sideOf = new Map(registry.roles.map((r) => [r.id, r.side]))
  const views: PlayerView[] = rolesBySeat(session, registry).map((roleId, i) => ({
    seat: i + 1, roleId, side: sideOf.get(roleId) ?? '', status: 'alive',
  }))
  const limit = before ? phaseOrder(before) : Infinity
  for (const e of orderedLog(session.log)) {
    if (e.type !== 'status_set' || phaseOrder(e.phase) >= limit || !isSeat(session, e.seat)) continue
    const i = e.seat - 1
    const view = views[i] as PlayerView
    views[i] = e.status === 'out'
      ? { seat: view.seat, roleId: view.roleId, side: view.side, status: 'out', cause: e.cause, outPhase: e.phase }
      : { seat: view.seat, roleId: view.roleId, side: view.side, status: 'alive' }
  }
  return views
}

/** Статусы игроков на начало фазы — для редактора прошлых записей и для ночных шагов. */
export function playersAt(session: Session, registry: Registry, phase: PhaseRef): PlayerView[] {
  return players(session, registry, phase)
}

export function aliveSeats(views: readonly PlayerView[]): number[] {
  return views.filter((p) => p.status === 'alive').map((p) => p.seat)
}

function defaultStep(session: Session, phase: PhaseRef): StepId | null {
  if (phase.kind === 'day') return phase.n < session.config.rules.balaganFromDay ? 'speeches' : 'balagan'
  return null
}

export function deriveState(session: Session, registry: Registry): GameState {
  const dealt = lastOf(session.log, 'roles_dealt')
  const phase = currentPhase(session.log)
  const views = players(session, registry, null)

  const bySide: Record<SideId, number> = Object.fromEntries(registry.sides.map((s) => [s.id, 0]))
  let alive = 0
  for (const p of views) {
    if (p.status !== 'alive') continue
    alive++
    if (p.side in bySide) bySide[p.side] = (bySide[p.side] ?? 0) + 1
  }

  const entered = lastOf(session.log, 'step_entered', (e) => phaseOrder(e.phase) === phaseOrder(phase))
  const finished = lastOf(session.log, 'game_finished')

  return {
    phase: dealt ? phase : null,
    step: entered?.step ?? defaultStep(session, phase),
    players: views,
    counts: { total: views.length, alive, bySide },
    endHint: endHintFor(bySide),
    finished: finished ? { winner: finished.winner } : null,
    warnings: [],
  }
}
