import { allOf, eventsOf, lastOf, phaseOrder } from './log'
import { aliveSeats, isSeat, nightPlayers, rolesBySeat, seatsOf } from './players'
import { roleOption } from './setup'
import type {
  CheckAnswer, EventOf, GameEvent, NightActionDef, NightDeath, NightNote, NightOutcome, NightState, NightStep, OutCause, PhaseRef, PlayerView, QuietNight,
  Registry, RoleId, Seat, Session,
} from './types'

// Ночь: шаги строятся из справочника, итог считает общая функция по типу эффекта.
// Названий ролей здесь нет — только поля справочника.

type BareStep = Omit<NightStep, 'lastNight'>
type Draft = { def: NightActionDef; step: BareStep; record: EventOf<'night_action'> | null }
/** Нападение на игрока: причина — от действия, которым напали. guarded — нападение перешло с подзащитного на защитника. */
type Attack = { target: Seat; cause: OutCause; guarded?: Seat }

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
  return outcome.noAttack ?? (outcome.notes.some((note) => note.kind === 'vest') ? 'spared' : 'saved')
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

/** Записи и блоки одной ночи — общая основа для расчёта итога и для счётчика визитов. */
type NightBase = {
  drafts: Draft[]
  views: PlayerView[]
  alive: Seat[]
  roles: RoleId[]
  blocked: Seat[]
  /** Цель записи — как записана: выстрел, лечение, блок и проверки считаются по ней, как считались всегда. */
  targetOf(d: Draft): Seat | null
  /** Цель записи, если она в игре этой ночью: защищать, навещать и сравнивать выбывшего вручную посреди ночи уже некого. */
  liveTargetOf(d: Draft): Seat | null
  /** Действие отменено блоком. */
  isBlocked(d: Draft): boolean
}

function nightBase(session: Session, registry: Registry, n: number): NightBase {
  const phase: PhaseRef = { kind: 'night', n }
  const roles = rolesBySeat(session, registry)
  const dealt = new Set(roles)
  // Носители действия — те, кто в игре этой ночью (см. nightPlayers). Жилет — каким он был этой ночью до подтверждения её итога.
  const views = nightPlayers(session, registry, n)
  const alive = aliveSeats(views)
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
        allowed: grey ? [] : alive.filter((seat) => !(def.noSelf && seat === actor)),
        recorded: record !== null, target: record?.target ?? null, target2: isSeat(session, record?.target2) ? record.target2 : null,
        used: [], resting: false, restNext: false, eventId: record?.id ?? null, edited: record?.edited === true,
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
  const liveTargetOf = (d: Draft): Seat | null => {
    const target = targetOf(d)
    return target !== null && alive.includes(target) ? target : null
  }
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
  return { drafts, views, alive, roles, blocked, targetOf, liveTargetOf, isBlocked }
}

/** Пара записи действия с двумя целями: оба названы, разные и в игре этой ночью; иначе пары нет. */
function pairOf(base: NightBase, d: Draft): [Seat, Seat] | null {
  const { target, target2 } = d.step
  return target !== null && target2 !== null && target !== target2 && base.alive.includes(target) && base.alive.includes(target2) ? [target, target2] : null
}

/**
 * Сравнения прошлых ночей (1…n − 1) по шагам: кого исполнитель уже проверил и состоялась ли его проверка прошлой ночью.
 * Проверка состоялась — записана пара, исполнитель не заблокирован и не отдыхал. Заблокированная проверка и запись
 * в ночь отдыха никого не «расходуют» и отдыха не требуют.
 */
function compareHistory(session: Session, registry: Registry, n: number): { used: Map<string, Seat[]>; doneLast: Set<string> } {
  const used = new Map<string, Seat[]>()
  let doneLast = new Set<string>()
  for (let k = 1; k < n; k++) {
    const base = nightBase(session, registry, k)
    const done = new Set<string>()
    for (const d of base.drafts) {
      if (d.def.effect !== 'compare_sides') continue
      const pair = pairOf(base, d)
      if (pair === null || base.isBlocked(d) || (restsAfter(session, registry, d.def) && doneLast.has(d.step.id))) continue
      done.add(d.step.id)
      used.set(d.step.id, [...(used.get(d.step.id) ?? []), ...pair])
    }
    doneLast = done
  }
  return { used, doneLast }
}

/** После состоявшейся проверки исполнитель следующую ночь отдыхает — если так задано опцией роли. */
const restsAfter = (session: Session, registry: Registry, def: NightActionDef): boolean =>
  def.restAfter !== undefined && roleOption(session, registry, def.restAfter.option) === def.restAfter.value

/** Состоявшиеся визиты ночи n: к кому приходили (исполнитель не заблокирован, цель в игре). */
export function visitsAt(session: Session, registry: Registry, n: number): Seat[] {
  const { drafts, liveTargetOf, isBlocked } = nightBase(session, registry, n)
  return unique(drafts.flatMap((d) => {
    const target = liveTargetOf(d)
    return d.def.effect === 'haunt' && target !== null && !isBlocked(d) ? [target] : []
  }))
}

/**
 * Счётчик визитов к игроку на начало ночи n: состоявшиеся визиты прошлых ночей. Второй и следующий визит — нападение.
 * Когда жилет игрока снят, счётчик обнуляется: считаются визиты с фазы снятия. Визит той же ночи, в которую жилет принял удар,
 * засчитывается — жилет срабатывает раньше, чем визит растит счётчик (порядок раздела 5.5: пункт 5, затем пункт 7).
 */
export function hauntCount(session: Session, registry: Registry, n: number, seat: Seat): number {
  const off = nightPlayers(session, registry, n)[seat - 1]?.vestOff
  const from = off ? phaseOrder(off) : -Infinity
  let count = 0
  for (let k = 1; k < n; k++) {
    if (phaseOrder({ kind: 'night', n: k }) >= from && visitsAt(session, registry, k).includes(seat)) count++
  }
  return count
}

function computeNight(session: Session, registry: Registry, n: number): { steps: BareStep[]; outcome: NightOutcome } {
  const base = nightBase(session, registry, n)
  const { drafts, views, alive, roles, blocked, targetOf, liveTargetOf, isBlocked } = base
  const healed = unique(drafts.flatMap((d) =>
    d.def.effect === 'heal' && targetOf(d) !== null && !isBlocked(d) ? [targetOf(d) as Seat] : []))

  // Итог считается по порядку раздела 5.5 дополнения: блоки → нападения → доктор → охранник → жилет → смерти → визит.
  // Визиты: второй и следующий визит к игроку — нападение.
  const visits = drafts.flatMap((d) => {
    const target = liveTargetOf(d)
    return d.def.effect === 'haunt' && target !== null ? [{ d, target, lethal: hauntCount(session, registry, n, target) >= 1 }] : []
  })
  const causeOf = (def: NightActionDef): OutCause => def.cause ?? (def.effect === 'haunt' ? 'haunted' : 'shot')
  // Нападения в порядке ночи: записанные убийства и повторные визиты. Заблокированное не состоялось.
  const attempts = drafts.filter((d) => (d.def.effect === 'kill' && targetOf(d) !== null) || visits.some((v) => v.d === d && v.lethal))
  const landed: Attack[] = attempts.filter((d) => !isBlocked(d)).map((d) => ({ target: targetOf(d) as Seat, cause: causeOf(d.def) }))
  /** Первое по порядку ночи нападение на игрока: его причина и называется. */
  const firstOn = (attacks: Attack[], seat: Seat): Attack | undefined => attacks.find((a) => a.target === seat)
  // Доктор срабатывает первым: нападения на вылеченного отменяются — и защитник, закрывавший его, остаётся жив.
  const afterHeal = landed.filter((a) => !healed.includes(a.target))
  // Защитник (не заблокирован): оставшиеся нападения на подзащитного переходят на него. Защитников одного игрока
  // несколько — на первого по номеру; перешедшее нападение дальше не переходит.
  const guards = drafts
    .flatMap((d) => {
      const ward = liveTargetOf(d)
      return d.def.effect === 'guard' && ward !== null && d.step.actor !== null && !isBlocked(d) ? [{ seat: d.step.actor, ward, cause: d.def.cause }] : []
    })
    .sort(bySeat)
  const moved: Attack[] = afterHeal.map((a) => {
    const guard = guards.find((g) => g.ward === a.target && g.seat !== a.target)
    return guard ? { target: guard.seat, cause: guard.cause ?? a.cause, guarded: a.target } : a
  })
  // Доктор лечил самого защитника — закрыв собой, он тоже выживает.
  const final = moved.filter((a) => a.guarded === undefined || !healed.includes(a.target))
  /** Нападение, которым объясняется исход для игрока: закрывший собой погиб «вместо подзащитного», иначе — первое по порядку ночи. */
  const mainOn = (seat: Seat): Attack => {
    const own = final.filter((a) => a.target === seat)
    return own.find((a) => a.guarded !== undefined) ?? (own[0] as Attack)
  }
  const victims = unique(final.map((a) => a.target))
  // Жилет: игрок с целым жилетом переживает нападение (сколько бы их ни было этой ночью) — жилет снимет подтверждение итога.
  const spared = victims.filter((seat) => alive.includes(seat) && views[seat - 1]?.vest === 'intact')
  // Остальные, на кого напали, выбывают. Несколько нападений на одного — одна смерть.
  const deaths: NightDeath[] = victims.filter((seat) => !spared.includes(seat))
    .map((seat): NightDeath => {
      const attack = mainOn(seat)
      return attack.guarded === undefined ? { seat, cause: attack.cause } : { seat, cause: attack.cause, guarded: attack.guarded }
    })
    .sort(bySeat)
  // Визит (не заблокирован): цель, оставшаяся в игре, завтра молчит. Причина в заметке — визит был нападением, но жертву спасли.
  const silenced = visits.filter((v) => !isBlocked(v.d) && !deaths.some((death) => death.seat === v.target))
    .map((v): NightNote => (v.lethal ? { seat: v.target, kind: 'silenced', cause: causeOf(v.d.def) } : { seat: v.target, kind: 'silenced' }))
  const notes: NightNote[] = [
    ...healed.map((seat): NightNote => {
      // От чего спасён: от нападения на него самого или от того, что он принял на себя как защитник.
      const attack = firstOn(landed, seat) ?? firstOn(moved, seat)
      return attack ? { seat, kind: 'healed', cause: attack.cause } : { seat, kind: 'healed' }
    }),
    ...spared.map((seat): NightNote => ({ seat, kind: 'vest', cause: mainOn(seat).cause })),
    ...silenced,
  ].sort((a, b) => a.seat - b.seat || a.kind.localeCompare(b.kind))
  const outcome: NightOutcome = { deaths, notes, blocked, healed, noAttack: attempts.length === 0 ? 'none' : landed.length === 0 ? 'blocked' : null }

  // Сравнение сторон: что исполнитель уже проверял и отдыхает ли он этой ночью. Сторона-одиночка не совпадает ни с чем.
  const history = drafts.some((d) => d.def.effect === 'compare_sides') ? compareHistory(session, registry, n) : null
  const sideOf = new Map(registry.roles.map((r) => [r.id, r.side]))
  const soloSides = new Set(registry.sides.filter((side) => side.solo).map((side) => side.id))
  const compareOf = (d: Draft): Pick<NightStep, 'allowed' | 'used' | 'resting' | 'restNext'> & { answer?: CheckAnswer } => {
    const used = unique(history?.used.get(d.step.id) ?? []).sort((a, b) => a - b)
    const resting = restsAfter(session, registry, d.def) && history?.doneLast.has(d.step.id) === true
    // Выбрать нельзя: уже проверенного и игрока, чья роль открыта столу (жилет снят). Себя — по noSelf, как у любого действия.
    const allowed = resting ? [] : d.step.allowed.filter((seat) => !used.includes(seat) && views[seat - 1]?.vest !== 'used')
    const pair = pairOf(base, d)
    if (pair === null) return { allowed, used, resting, restNext: false }
    if (resting) return { allowed, used, resting, restNext: false, answer: { kind: 'rest' } }
    if (isBlocked(d)) return { allowed, used, resting, restNext: false, answer: { kind: 'blocked' } }
    const [a, b] = pair.map((seat) => sideOf.get(roles[seat - 1] ?? '') ?? '') as [string, string]
    return { allowed, used, resting, restNext: restsAfter(session, registry, d.def), answer: { kind: 'same', same: a === b && !soloSides.has(a) } }
  }

  const seenAs = new Map(registry.roles.map((r) => [r.id, r.seenBySheriffAs]))
  const answerOf = (d: Draft): CheckAnswer | undefined => {
    const target = targetOf(d)
    if (target === null) return undefined
    const role = roles[target - 1] ?? ''
    if (d.def.effect === 'check_side') return isBlocked(d) ? { kind: 'blocked' } : { kind: 'side', side: seenAs.get(role) ?? '' }
    // Поиск роли блок отменяет, только если так задано опцией: по умолчанию поиск идёт раньше блока и от него не зависит.
    if (d.def.effect === 'find_role') return isBlocked(d) ? { kind: 'blocked' } : { kind: 'found', found: role === d.def.findRole }
    // Состоявшийся визит: первый он или повторный (нападение).
    if (d.def.effect === 'haunt' && !isBlocked(d)) return { kind: 'visit', lethal: visits.some((v) => v.d === d && v.lethal) }
    return undefined
  }

  const steps = drafts.map((d) => {
    const step = { ...d.step, blocked: !d.step.grey && isBlocked(d), blockedActors: d.step.actors.filter((seat) => blocked.includes(seat)) }
    if (d.def.effect === 'compare_sides' && !d.step.grey) return { ...step, ...compareOf(d) }
    const answer = answerOf(d)
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
      ? { recorded: prev.recorded, target: prev.target, ...(prev.target2 !== null ? { target2: prev.target2 } : {}), ...(prev.answer ? { answer: prev.answer } : {}) }
      : { recorded: false, target: null }
    return { ...step, lastNight }
  })
  const confirmed = lastOf(eventsOf(session.log, phase), 'night_confirmed')
  return {
    n, steps, outcome,
    complete: steps.every((s) => s.grey || s.resting || s.recorded),
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
