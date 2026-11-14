import { eventsOf, lastOf } from './log'
import { aliveSeats, isSeat, playersAt, rolesBySeat } from './players'
import type {
  CheckAnswer, EventOf, NightActionDef, NightOutcome, NightState, NightStep, PhaseRef, Registry, RoleId, Seat, Session,
} from './types'

// Ночь: шаги строятся из справочника, итог считает общая функция по типу эффекта.
// Названий ролей здесь нет — только поля справочника.

type BareStep = Omit<NightStep, 'lastNight'>
type Draft = { def: NightActionDef; step: BareStep; record: EventOf<'night_action'> | null }

export function stepIdOf(actionId: string, actor: Seat | null): string {
  return actor === null ? actionId : `${actionId}:${actor}`
}

const unique = (seats: Seat[]): Seat[] => [...new Set(seats)]

function computeNight(session: Session, registry: Registry, n: number): { steps: BareStep[]; outcome: NightOutcome } {
  const phase: PhaseRef = { kind: 'night', n }
  const roles = rolesBySeat(session, registry)
  const dealt = new Set(roles)
  // Носители действия — те, кто был в игре на начало ночи.
  const alive = aliveSeats(playersAt(session, registry, phase))
  const aliveWith = (ids: RoleId[]) => alive.filter((seat) => ids.includes(roles[seat - 1] ?? ''))
  const records = eventsOf(session.log, phase).filter((e): e is EventOf<'night_action'> => e.type === 'night_action')
  const recordOf = (actionId: string, actor: Seat | null) => {
    let found: EventOf<'night_action'> | null = null
    for (const e of records) {
      if (e.actionId === actionId && e.actor === actor && (e.target === null || isSeat(session, e.target))) found = e
    }
    return found
  }

  const drafts: Draft[] = []
  const push = (def: NightActionDef, actor: Seat | null, actors: Seat[], performerRole: RoleId, inherited: boolean) => {
    const grey = actors.length === 0
    const record = grey ? null : recordOf(def.id, actor)
    drafts.push({
      def, record,
      step: {
        id: stepIdOf(def.id, actor), actionId: def.id, effect: def.effect, actor, actors, performerRole, inherited, grey, blocked: false,
        recorded: record !== null, target: record?.target ?? null, eventId: record?.id ?? null, edited: record?.edited === true,
      },
    })
  }

  for (const def of [...registry.nightActions].sort((a, b) => a.order - b.order)) {
    const involved = def.inheritedBy ? [...def.performers, def.inheritedBy] : def.performers
    // Роли нет в раздаче — шага нет.
    if (!involved.some((role) => dealt.has(role))) continue
    const own = def.performers[0] ?? ''
    let actors = aliveWith(def.performers)
    let inherited = false
    if (actors.length === 0 && def.inheritedBy) {
      // Носителей не осталось: действие переходит к наследнику.
      actors = aliveWith([def.inheritedBy])
      inherited = actors.length > 0
    }
    const teamRole = inherited && def.inheritedBy ? def.inheritedBy : own
    if (actors.length === 0) push(def, null, [], own, false)
    else if (def.scope === 'team') push(def, null, actors, teamRole, inherited)
    else for (const seat of actors) push(def, seat, [seat], roles[seat - 1] ?? teamRole, inherited)
  }

  // Все действия ночи одновременны. Заблокированные — цели всех блоков.
  const targetOf = (d: Draft): Seat | null => d.record?.target ?? null
  const blocked = unique(drafts.flatMap((d) => (d.def.effect === 'block' && targetOf(d) !== null ? [targetOf(d) as Seat] : [])))
  const isBlocked = (d: Draft): boolean => {
    // Жив лидер — действие отменяет только его блок. Лидера нет — блок единственного исполнителя.
    const leaders = d.def.leader ? d.step.actors.filter((seat) => roles[seat - 1] === d.def.leader) : []
    if (leaders.length > 0) return leaders.some((seat) => blocked.includes(seat))
    return d.step.actors.length === 1 && blocked.includes(d.step.actors[0] as Seat)
  }
  const healed = unique(drafts.flatMap((d) =>
    d.def.effect === 'heal' && targetOf(d) !== null && !isBlocked(d) ? [targetOf(d) as Seat] : []))

  let outcome: NightOutcome = { shotAt: null, dies: null, reason: 'no_shot', blocked, healed }
  const shot = drafts.find((d) => d.def.effect === 'kill' && targetOf(d) !== null)
  if (shot) {
    const shotAt = targetOf(shot) as Seat
    if (isBlocked(shot)) outcome = { shotAt, dies: null, reason: 'shooter_blocked', blocked, healed }
    else if (healed.includes(shotAt)) outcome = { shotAt, dies: null, reason: 'healed', blocked, healed }
    else outcome = { shotAt, dies: shotAt, reason: 'shot', blocked, healed }
  }

  const seenAs = new Map(registry.roles.map((r) => [r.id, r.seenBySheriffAs]))
  const answerOf = (d: Draft): CheckAnswer | undefined => {
    const target = targetOf(d)
    if (target === null) return undefined
    const role = roles[target - 1] ?? ''
    if (d.def.effect === 'check_side') return isBlocked(d) ? { kind: 'blocked' } : { kind: 'side', side: seenAs.get(role) ?? '' }
    // Поиск роли идёт раньше блока, блок на него не влияет.
    if (d.def.effect === 'find_role') return { kind: 'found', found: role === d.def.findRole }
    return undefined
  }

  const steps = drafts.map((d) => {
    const answer = answerOf(d)
    const step = { ...d.step, blocked: !d.step.grey && isBlocked(d) }
    return answer ? { ...step, answer } : step
  })
  return { steps, outcome }
}

/** Состояние ночи n — и текущей, и любой прошлой. */
export function nightState(session: Session, registry: Registry, n: number): NightState {
  const phase: PhaseRef = { kind: 'night', n }
  const { steps: bare, outcome } = computeNight(session, registry, n)
  const before = n > 1 ? computeNight(session, registry, n - 1).steps : []
  const steps: NightStep[] = bare.map((step) => {
    const prev = before.find((x) => x.id === step.id)
    const lastNight: NightStep['lastNight'] = prev
      ? (prev.answer ? { recorded: prev.recorded, target: prev.target, answer: prev.answer } : { recorded: prev.recorded, target: prev.target })
      : { recorded: false, target: null }
    return { ...step, lastNight }
  })
  const confirmed = lastOf(eventsOf(session.log, phase), 'night_confirmed')
  const seatOrNull = (seat: Seat | null) => (isSeat(session, seat) ? seat : null)
  return {
    n, steps, outcome,
    complete: steps.every((s) => s.grey || s.recorded),
    confirmed: confirmed ? { hinted: seatOrNull(confirmed.hinted), chosen: seatOrNull(confirmed.chosen) } : null,
  }
}

/** Кого проверяли за всю игру: состоявшиеся проверки стороны и поиски роли в ночах 1…upTo. */
export function permanentMarks(session: Session, registry: Registry, upTo: number): { seat: Seat; actionId: string }[] {
  const marks: { seat: Seat; actionId: string }[] = []
  for (let n = 1; n <= upTo; n++) {
    for (const step of computeNight(session, registry, n).steps) {
      if (step.effect !== 'check_side' && step.effect !== 'find_role') continue
      if (step.target === null || step.answer?.kind === 'blocked') continue
      const { target, actionId } = step
      if (!marks.some((m) => m.seat === target && m.actionId === actionId)) marks.push({ seat: target, actionId })
    }
  }
  return marks
}
