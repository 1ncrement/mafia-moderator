import { allOf, eventsOf, lastOf } from './log'
import { aliveSeats, isSeat, nightPlayers, rolesBySeat, seatsOf } from './players'
import { roleOption } from './setup'
import type {
  CheckAnswer, EventOf, GameEvent, NightActionDef, NightDeath, NightNote, NightOutcome, NightState, NightStep, PhaseRef, QuietNight, Registry, RoleId,
  Seat, Session,
} from './types'

// Ночь: шаги строятся из справочника, итог считает общая функция по типу эффекта.
// Названий ролей здесь нет — только поля справочника.

type BareStep = Omit<NightStep, 'lastNight'>
type Draft = { def: NightActionDef; step: BareStep; record: EventOf<'night_action'> | null }

export function stepIdOf(actionId: string, actor: Seat | null): string {
  return actor === null ? actionId : `${actionId}:${actor}`
}

/** Действие шага по его идентификатору: носитель меняется, действие — нет. */
export function actionOfStepId(stepId: string): string {
  return stepId.split(':')[0] ?? stepId
}

const unique = (seats: Seat[]): Seat[] => [...new Set(seats)]
const bySeat = (a: { seat: Seat }, b: { seat: Seat }) => a.seat - b.seat

/** Кто выбывает по подсказке — по возрастанию номеров. */
export const deathSeats = (outcome: NightOutcome): Seat[] => outcome.deaths.map((d) => d.seat)

/** Почему по подсказке никто не выбывает; null — кто-то выбывает. */
export function quietNight(outcome: NightOutcome): QuietNight | null {
  if (outcome.deaths.length > 0) return null
  return outcome.noAttack ?? 'saved'
}

/**
 * Обмен ролями действует задним числом, а ночная запись принадлежит роли, не месту:
 * если после записи роли двух номеров поменяли, запись идёт за ролью на новое место.
 */
export function actorMapper(log: readonly GameEvent[]): (event: EventOf<'night_action'>) => Seat | null {
  const swaps = allOf(log, 'roles_swapped').sort((a, b) => a.seq - b.seq)
  return (event) => {
    let actor = event.actor
    if (actor === null) return null
    for (const swap of swaps) {
      if (swap.seq <= event.seq) continue
      if (actor === swap.a) actor = swap.b
      else if (actor === swap.b) actor = swap.a
    }
    return actor
  }
}

function computeNight(session: Session, registry: Registry, n: number): { steps: BareStep[]; outcome: NightOutcome } {
  const phase: PhaseRef = { kind: 'night', n }
  const roles = rolesBySeat(session, registry)
  const dealt = new Set(roles)
  // Носители действия — те, кто в игре этой ночью (см. nightPlayers).
  const alive = aliveSeats(nightPlayers(session, registry, n))
  const actorOf = actorMapper(session.log)
  const aliveWith = (ids: RoleId[]) => alive.filter((seat) => ids.includes(roles[seat - 1] ?? ''))
  const records = eventsOf(session.log, phase).filter((e): e is EventOf<'night_action'> => e.type === 'night_action')
  const recordOf = (actionId: string, actor: Seat | null) => {
    let found: EventOf<'night_action'> | null = null
    for (const e of records) {
      if (e.actionId === actionId && actorOf(e) === actor && (e.target === null || isSeat(session, e.target))) found = e
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
        id: stepIdOf(def.id, actor), actionId: def.id, effect: def.effect, actor, actors, performerRole, inherited, grey, blocked: false, blockedActors: [],
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
  /** Отменяет ли блок это действие по опции роли: что именно отменяет блок лидера, задано в настройках игры. */
  const cancelledByOption = (def: NightActionDef): boolean =>
    !def.blockCancels || def.blockCancels.values.includes(String(roleOption(session, registry, def.blockCancels.option)))
  const isBlocked = (d: Draft): boolean => {
    // Жив лидер — командное действие отменяет только его блок, и только если так задано опцией.
    const leaders = d.def.leader ? d.step.actors.filter((seat) => roles[seat - 1] === d.def.leader) : []
    if (leaders.length > 0) return leaders.some((seat) => blocked.includes(seat)) && cancelledByOption(d.def)
    if (d.step.actors.length !== 1 || !blocked.includes(d.step.actors[0] as Seat)) return false
    // Лидера нет — блок единственного исполнителя отменяет командное действие всегда; одиночное — по опции, если она есть.
    return d.def.leader !== undefined || cancelledByOption(d.def)
  }
  const healed = unique(drafts.flatMap((d) =>
    d.def.effect === 'heal' && targetOf(d) !== null && !isBlocked(d) ? [targetOf(d) as Seat] : []))

  // Нападения: записанные действия «убийство». Заблокированное не состоялось.
  const attacks = drafts.filter((d) => d.def.effect === 'kill' && targetOf(d) !== null)
  const landed = attacks.filter((d) => !isBlocked(d))
  const attacked = unique(landed.map((d) => targetOf(d) as Seat))
  // Лечение срабатывает первым: нападение на вылеченного отменяется. Несколько нападений на одного — одна смерть.
  const deaths: NightDeath[] = attacked.filter((seat) => !healed.includes(seat)).map((seat) => ({ seat, cause: 'shot' as const })).sort(bySeat)
  const notes: NightNote[] = healed
    .map((seat): NightNote => (attacked.includes(seat) ? { seat, kind: 'healed', cause: 'shot' } : { seat, kind: 'healed' }))
    .sort(bySeat)
  const outcome: NightOutcome = { deaths, notes, blocked, healed, noAttack: attacks.length === 0 ? 'none' : landed.length === 0 ? 'blocked' : null }

  const seenAs = new Map(registry.roles.map((r) => [r.id, r.seenBySheriffAs]))
  const answerOf = (d: Draft): CheckAnswer | undefined => {
    const target = targetOf(d)
    if (target === null) return undefined
    const role = roles[target - 1] ?? ''
    if (d.def.effect === 'check_side') return isBlocked(d) ? { kind: 'blocked' } : { kind: 'side', side: seenAs.get(role) ?? '' }
    // Поиск роли блок отменяет, только если так задано опцией: по умолчанию поиск идёт раньше блока и от него не зависит.
    if (d.def.effect === 'find_role') return isBlocked(d) ? { kind: 'blocked' } : { kind: 'found', found: role === d.def.findRole }
    return undefined
  }

  const steps = drafts.map((d) => {
    const answer = answerOf(d)
    const step = { ...d.step, blocked: !d.step.grey && isBlocked(d), blockedActors: d.step.actors.filter((seat) => blocked.includes(seat)) }
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
  return {
    n, steps, outcome,
    complete: steps.every((s) => s.grey || s.recorded),
    confirmed: confirmed ? { hinted: seatsOf(session, confirmed.hinted), chosen: seatsOf(session, confirmed.chosen) } : null,
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
