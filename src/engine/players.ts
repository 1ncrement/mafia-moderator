import { currentPhase, eventsOf, lastOf, nextPhase, orderedLog, phaseOrder, samePhase } from './log'
import type { GameEvent, PhaseRef, PlayerView, Registry, RoleId, Seat, Session } from './types'

// Игроки: роли по местам и статусы на любой момент журнала.
// Место вне диапазона и неизвестная роль пропускаются, исключений нет.

export function isSeat(session: Session, seat: unknown): seat is Seat {
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 1 && seat <= session.config.playerCount
}

/**
 * Набор мест из записи журнала: по возрастанию, без повторов. Принимает и один номер, и null —
 * так записано подтверждение ночи в сохранениях до обновления. Не-номера и места вне стола отбрасываются.
 */
export function seatsOf(session: Session, value: unknown): Seat[] {
  const list: unknown[] = Array.isArray(value) ? value : [value]
  return [...new Set(list.filter((x): x is Seat => isSeat(session, x)))].sort((a, b) => a - b)
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

/** Граница среза: события раньше этой фазы, а в самой фазе — с seq меньше указанного. */
type Cutoff = { order: number; seq: number } | null

function players(session: Session, registry: Registry, cutoff: Cutoff): PlayerView[] {
  const sideOf = new Map(registry.roles.map((r) => [r.id, r.side]))
  const extraLife = new Set(registry.roles.filter((r) => r.extraLife).map((r) => r.id))
  // Жилет есть только у роли со второй жизнью; сначала он цел.
  const views: PlayerView[] = rolesBySeat(session, registry).map((roleId, i) => ({
    seat: i + 1, roleId, side: sideOf.get(roleId) ?? '', status: 'alive', ...(extraLife.has(roleId) ? { vest: 'intact' as const } : {}),
  }))
  for (const e of orderedLog(session.log)) {
    if ((e.type !== 'status_set' && e.type !== 'vest_set') || !isSeat(session, e.seat)) continue
    if (cutoff) {
      const order = phaseOrder(e.phase)
      if (order > cutoff.order || (order === cutoff.order && e.seq >= cutoff.seq)) continue
    }
    const view = views[e.seat - 1] as PlayerView
    if (e.type === 'vest_set') {
      if (view.vest === undefined) continue
      const { vestOff: _was, ...rest } = view
      views[e.seat - 1] = e.used === true ? { ...rest, vest: 'used', vestOff: e.phase } : { ...rest, vest: 'intact' }
      continue
    }
    const { cause: _cause, outPhase: _phase, ...rest } = view
    views[e.seat - 1] = e.status === 'out' ? { ...rest, status: 'out', cause: e.cause, outPhase: e.phase } : { ...rest, status: 'alive' }
  }
  return views
}

/** Статусы по всему журналу. */
export function playersNow(session: Session, registry: Registry): PlayerView[] {
  return players(session, registry, null)
}

/** Статусы на начало фазы — для редактора прошлых записей и для ночных шагов. */
export function playersAt(session: Session, registry: Registry, phase: PhaseRef): PlayerView[] {
  return players(session, registry, { order: phaseOrder(phase), seq: -Infinity })
}

/** Статусы на момент перед событием — кто голосовал, когда исход был подтверждён. */
export function playersBefore(session: Session, registry: Registry, event: GameEvent): PlayerView[] {
  return players(session, registry, { order: phaseOrder(event.phase), seq: event.seq })
}

/**
 * Кто покинул стол за ночь n и до сих пор вне игры: статус «выбыл», поставленный в этой ночи, — итогом ночи,
 * вручную посреди неё или записью задним числом. Возвращённый в игру сюда не попадает.
 */
export function leftAtNight(views: readonly PlayerView[], n: number): Seat[] {
  return views.filter((p) => p.status === 'out' && p.outPhase !== undefined && samePhase(p.outPhase, { kind: 'night', n })).map((p) => p.seat)
}

export function aliveSeats(views: readonly PlayerView[]): Seat[] {
  return views.filter((p) => p.status === 'alive').map((p) => p.seat)
}

/**
 * Кто в игре этой ночью. Идущая ночь — по текущим статусам: ручная правка посреди шага
 * сразу пересчитывает шаги и цели. Подтверждённая — на момент перед подтверждением:
 * застреленный этой ночью успевает выполнить своё действие.
 */
export function nightPlayers(session: Session, registry: Registry, n: number): PlayerView[] {
  const phase: PhaseRef = { kind: 'night', n }
  const confirmed = lastOf(eventsOf(session.log, phase), 'night_confirmed')
  if (confirmed) return playersBefore(session, registry, confirmed)
  return samePhase(currentPhase(session.log), phase) ? playersNow(session, registry) : playersAt(session, registry, nextPhase(phase))
}
