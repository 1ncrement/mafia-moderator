import { dayState, nominationsOf } from './day'
import { currentPhase, EMPTY_PATCH, eventsOf, lastOf, nextPhase, samePhase } from './log'
import { actorMapper, deathSeats, nightState, stepIdOf } from './night'
import { aliveSeats, isSeat, nightPlayers, playersAt, playersNow, seatsOf } from './players'
import type {
  Command, CommandResult, EventOf, LogPatch, NewEvent, NightOutcome, PhaseRef, Registry, RejectCode, Seat, Session,
} from './types'
import { enteredVotes, maxVotesFor } from './vote'

// Команда ведущего → пачка событий. Ничего не происходит само:
// статус, фаза и шаг меняются только командой.

const ok = (patch: Partial<LogPatch>): CommandResult => ({ ok: true, patch: { ...EMPTY_PATCH, ...patch } })
const no = (reason: RejectCode): CommandResult => ({ ok: false, reason })
const add = (...events: NewEvent[]): CommandResult => ok({ add: events })

export function execute(session: Session, cmd: Command, registry: Registry): CommandResult {
  const log = session.log
  const phase: PhaseRef = currentPhase(log)
  const isNow = (p: PhaseRef) => samePhase(p, phase)
  /** Кто в игре для записи в фазу p: в текущую — по статусам сейчас, в прошлую — на её начало. */
  const aliveFor = (p: PhaseRef): Set<Seat> =>
    new Set(aliveSeats(isNow(p) ? playersNow(session, registry) : playersAt(session, registry, p)))
  /** Событие конца идущей речи, если она есть. */
  const endOpenSpeech = (): NewEvent[] => {
    const events = eventsOf(log, phase)
    const ended = new Set(events.flatMap((e) => (e.type === 'speech_ended' ? [e.startId] : [])))
    const last = lastOf(events, 'speech_started')
    return last && !ended.has(last.id) ? [{ type: 'speech_ended', phase, startId: last.id }] : []
  }
  const idsIn = <T extends 'nominated' | 'votes_set' | 'voters_set' | 'vote_resolved'>(
    p: PhaseRef, type: T, where: (e: EventOf<T>) => boolean,
  ): EventOf<T>[] => eventsOf(log, p).filter((e): e is EventOf<T> => e.type === type && where(e as EventOf<T>))

  /**
   * События прежнего исхода тура: сам исход и статусы «выгнан», поставленные той же пачкой.
   * withLater — вместе с исходом и числами следующего тура: пересмотр тура 1 отменяет переголосование.
   */
  const resolutionIds = (p: PhaseRef, ballot: 1 | 2, withLater: boolean): string[] => {
    const inPhase = eventsOf(log, p)
    const resolved = inPhase.filter((e) => e.type === 'vote_resolved' && (e.ballot === ballot || (withLater && e.ballot > ballot)))
    const txs = new Set(resolved.map((e) => e.tx))
    // Вместе с исходом уходит и то, что он поставил: статусы «выгнан» и снятые жилеты.
    const statuses = inPhase.filter((e) => (e.type === 'status_set' || e.type === 'vest_set') && e.source === 'vote' && txs.has(e.tx))
    const later = withLater
      ? inPhase.filter((e) => (e.type === 'votes_set' || e.type === 'voters_set') && e.ballot > ballot)
      : []
    return [...resolved, ...statuses, ...later].map((e) => e.id)
  }

  /** Статусы выбывших ночью: причина — из подсказки; у добавленного ведущим её нет, он записан застреленным. */
  const nightStatuses = (p: PhaseRef, outcome: NightOutcome, seats: Seat[]): NewEvent[] => seats.map((seat) => ({
    type: 'status_set', phase: p, seat, status: 'out', cause: outcome.deaths.find((d) => d.seat === seat)?.cause ?? 'shot', source: 'night',
  }))
  /** Статусы, которые поставил итог этой ночи: их заменяет правка итога. */
  const nightStatusIds = (p: PhaseRef): string[] =>
    eventsOf(log, p).filter((e) => e.type === 'status_set' && e.source === 'night').map((e) => e.id)
  /** Жилеты, снятые по подсказке: каждый, кто пережил нападение благодаря жилету. Пишутся той же пачкой, что и итог ночи. */
  const nightVests = (p: PhaseRef, outcome: NightOutcome): NewEvent[] => outcome.notes.flatMap((note) => (note.kind === 'vest'
    ? [{ type: 'vest_set' as const, phase: p, seat: note.seat, used: true, source: 'night' as const }]
    : []))
  /** Жилеты, которые снял итог этой ночи: «Исправить» ставит их заново по пересчитанной подсказке. */
  const nightVestIds = (p: PhaseRef): string[] =>
    eventsOf(log, p).filter((e) => e.type === 'vest_set' && e.source === 'night').map((e) => e.id)

  switch (cmd.type) {
    case 'deal': {
      if (phase.kind !== 'deal') return no('redeal_closed')
      // Новая раздача заменяет прежнюю вместе с обменами, сделанными по ней.
      const stale = log.filter((e) => e.type === 'roles_dealt' || e.type === 'roles_swapped').map((e) => e.id)
      return ok({ remove: stale, add: [{ type: 'roles_dealt', phase: { kind: 'deal' }, assignment: [...cmd.assignment] }] })
    }

    case 'swapRoles': {
      if (!isSeat(session, cmd.a) || !isSeat(session, cmd.b)) return no('not_alive')
      if (cmd.a === cmd.b) return ok({})
      return add({ type: 'roles_swapped', phase, manual: true, a: cmd.a, b: cmd.b })
    }

    case 'startPhase': {
      if (!samePhase(cmd.phase, nextPhase(phase))) return no('wrong_phase')
      return add({ type: 'phase_started', phase: cmd.phase })
    }

    case 'enterStep': {
      if (phase.kind === 'deal') return no('wrong_phase')
      return add({ type: 'step_entered', phase, step: cmd.step })
    }

    case 'setStatus': {
      if (!isSeat(session, cmd.seat)) return no('not_alive')
      const event: NewEvent = cmd.status === 'out'
        ? { type: 'status_set', phase: cmd.phase ?? phase, manual: true, seat: cmd.seat, status: 'out', cause: cmd.cause, source: 'manual' }
        : { type: 'status_set', phase: cmd.phase ?? phase, manual: true, seat: cmd.seat, status: 'alive', source: 'manual' }
      return add(event)
    }

    case 'finishGame': {
      const finished = lastOf(log, 'game_finished')
      if (finished) return ok({ replace: [{ ...finished, winner: cmd.winner }] })
      return add({ type: 'game_finished', phase, winner: cmd.winner })
    }

    case 'resumeGame':
      return ok({ remove: log.filter((e) => e.type === 'game_finished').map((e) => e.id) })

    case 'removeEvent': {
      const event = log.find((e) => e.id === cmd.id)
      if (!event) return no('unknown_event')
      // Запись исхода голосования удаляется вместе со статусами, которые она поставила.
      if (event.type === 'vote_resolved') return ok({ remove: resolutionIds(event.phase, event.ballot, false) })
      return ok({ remove: [cmd.id] })
    }

    case 'editStatus': {
      const event = log.find((e) => e.id === cmd.id)
      if (!event || event.type !== 'status_set') return no('unknown_event')
      const { cause: _previous, ...rest } = event
      return ok({ replace: [cmd.status === 'out' ? { ...rest, status: 'out', cause: cmd.cause } : { ...rest, status: 'alive' }] })
    }

    // ── День: круг речей ──────────────────────────────────────────────────

    case 'openCircle': {
      if (phase.kind !== 'day') return no('wrong_phase')
      if (!aliveFor(phase).has(cmd.first)) return no('not_alive')
      // Случайный выбор, по которому ещё никто не говорил, ведущий заменяет своим: запись «случайно» снимается.
      // После первой речи это уже новый круг — прежняя запись остаётся в журнале.
      const events = eventsOf(log, phase)
      const current = lastOf(events, 'circle_opened')
      const replaced = current?.random === true && !events.some((e) => e.type === 'speech_started' && e.seq > current.seq) ? [current.id] : []
      return ok({
        remove: replaced,
        add: [...endOpenSpeech(), { type: 'circle_opened', phase, first: cmd.first, ...(cmd.random ? { random: true as const } : {}) }],
      })
    }

    case 'startSpeech': {
      if (phase.kind !== 'day') return no('wrong_phase')
      if (cmd.seat !== null) {
        if (!isSeat(session, cmd.seat)) return no('not_alive')
        // Прощание говорит уже выгнанный, остальные речи — только игроки в игре.
        if (cmd.kind !== 'farewell' && !aliveFor(phase).has(cmd.seat)) return no('not_alive')
      }
      return add(...endOpenSpeech(), { type: 'speech_started', phase, kind: cmd.kind, seat: cmd.seat })
    }

    case 'endSpeech':
      return ok({ add: phase.kind === 'day' ? endOpenSpeech() : [] })

    case 'skipSpeaker': {
      if (phase.kind !== 'day') return no('wrong_phase')
      if (!isSeat(session, cmd.seat)) return no('not_alive')
      return add({ type: 'speaker_skipped', phase, seat: cmd.seat })
    }

    // ── День: выставление ─────────────────────────────────────────────────

    case 'nominate': {
      const p = cmd.phase ?? phase
      if (p.kind !== 'day') return no('wrong_phase')
      if (p.n < session.config.rules.nominationsFromDay) return no('nominations_closed')
      const alive = aliveFor(p)
      if (!alive.has(cmd.target)) return no('not_alive')
      const listed = nominationsOf(session, p, alive)
      if (listed.some((x) => x.target === cmd.target)) return no('already_nominated')
      // Не больше одного выставления за речь: новое выставление автора заменяет прежнее.
      const previous = cmd.by === null ? [] : idsIn(p, 'nominated', (e) => e.by === cmd.by).map((e) => e.id)
      const kept = listed.filter((x) => !previous.includes(x.eventId))
      const order = kept.reduce((max, x) => Math.max(max, x.order), 0) + 1
      return ok({ remove: previous, add: [{ type: 'nominated', phase: p, by: cmd.by, target: cmd.target, order }] })
    }

    case 'removeNomination': {
      const p = cmd.phase ?? phase
      return ok({ remove: idsIn(p, 'nominated', (e) => e.target === cmd.target).map((e) => e.id) })
    }

    case 'editNomination': {
      const event = log.find((e) => e.id === cmd.id)
      if (!event || event.type !== 'nominated') return no('unknown_event')
      if (event.target === cmd.target) return ok({})
      const alive = aliveFor(event.phase)
      if (!alive.has(cmd.target)) return no('not_alive')
      if (nominationsOf(session, event.phase, alive).some((x) => x.target === cmd.target)) return no('already_nominated')
      // Числа голосов записаны за этого кандидата — остаются за ним под исправленным номером.
      const votes = idsIn(event.phase, 'votes_set', (e) => e.candidate === event.target)
      return ok({ replace: [{ ...event, target: cmd.target }, ...votes.map((e) => ({ ...e, candidate: cmd.target }))] })
    }

    case 'moveNomination': {
      if (phase.kind !== 'day') return no('wrong_phase')
      const listed = nominationsOf(session, phase, aliveFor(phase))
      const from = listed.findIndex((x) => x.target === cmd.target)
      const moved = listed[from]
      if (!moved) return ok({})
      const rest = listed.filter((x) => x !== moved)
      const to = Math.max(0, Math.min(rest.length, Math.floor(cmd.toIndex)))
      if (to === from) return ok({})
      // Меняем порядок только у переносимой записи: встаёт между соседями.
      const before = rest[to - 1], after = rest[to]
      const order = before && after ? (before.order + after.order) / 2
        : before ? before.order + 1
        : after ? after.order - 1
        : moved.order
      const event = log.find((e) => e.id === moved.eventId)
      return event?.type === 'nominated' ? ok({ replace: [{ ...event, order }] }) : ok({})
    }

    // ── День: голосование ─────────────────────────────────────────────────

    case 'setVotes': {
      const p = cmd.phase ?? phase
      if (p.kind !== 'day') return no('wrong_phase')
      const ballot = dayState(session, registry, p.n).ballots.find((b) => b.n === cmd.ballot)
      if (!ballot) return no('wrong_phase')
      if (!ballot.candidates.includes(cmd.candidate)) return no('not_alive')
      // Единственный жёсткий запрет в игре: голосов не больше, чем голосующих.
      if (!Number.isInteger(cmd.count) || cmd.count < 0 || cmd.count > maxVotesFor(ballot, cmd.candidate)) return no('votes_exceed')
      const previous = idsIn(p, 'votes_set', (e) => e.ballot === cmd.ballot && e.candidate === cmd.candidate)
      const last = previous.at(-1)
      if (!isNow(p) && last) {
        // Правка прошлого дня: запись остаётся на месте и получает метку «испр.».
        return ok({ replace: [{ ...last, count: cmd.count }], remove: previous.slice(0, -1).map((e) => e.id) })
      }
      return ok({
        remove: previous.map((e) => e.id),
        add: [{ type: 'votes_set', phase: p, ballot: cmd.ballot, candidate: cmd.candidate, count: cmd.count }],
      })
    }

    case 'setVoters': {
      if (phase.kind !== 'day') return no('wrong_phase')
      const count = Number.isFinite(cmd.count) ? Math.max(0, Math.floor(cmd.count)) : 0
      // Тот же жёсткий запрет с другой стороны: голосующих не меньше, чем уже введено голосов.
      const ballot = dayState(session, registry, phase.n).ballots.find((b) => b.n === cmd.ballot)
      if (ballot && count < enteredVotes(ballot)) return no('votes_exceed')
      return ok({
        remove: idsIn(phase, 'voters_set', (e) => e.ballot === cmd.ballot).map((e) => e.id),
        add: [{ type: 'voters_set', phase, ballot: cmd.ballot, count }],
      })
    }

    case 'resetVotes':
      return ok({ remove: idsIn(phase, 'votes_set', (e) => e.ballot === cmd.ballot).map((e) => e.id) })

    case 'resolveVote': {
      const p = cmd.phase ?? phase
      if (p.kind !== 'day') return no('wrong_phase')
      const seats = cmd.outcome === 'nobody' ? [] : [...new Set(cmd.seats)].filter((s) => isSeat(session, s))
      // Прежний исход этого тура был другим — новая запись получает метку «испр.».
      const before = lastOf(eventsOf(log, p), 'vote_resolved', (e) => e.ballot === cmd.ballot)
      const changed = before !== null && (before.outcome !== cmd.outcome || before.seats.join() !== seats.join())
      // Исход пишется раньше статусов: число голосующих тура считается на момент перед исходом.
      const events: NewEvent[] = [{
        type: 'vote_resolved', phase: p, ballot: cmd.ballot, outcome: cmd.outcome, seats, ...(changed ? { edited: true as const } : {}),
      }]
      // Повторное подтверждение заменяет прежний исход вместе с его статусами и снятыми жилетами.
      const replaced = resolutionIds(p, cmd.ballot, true)
      if (cmd.outcome === 'eliminated') {
        // Жилет — каким он был бы без прежнего исхода этого тура: повторное подтверждение второй раз его не «тратит».
        const without: Session = { ...session, log: log.filter((e) => !replaced.includes(e.id)) }
        const views = isNow(p) ? playersNow(without, registry) : playersAt(without, registry, nextPhase(p))
        for (const seat of seats) {
          // Изгнание игрока в целом жилете не срабатывает: он остаётся в игре, жилет снят.
          events.push(views[seat - 1]?.vest === 'intact'
            ? { type: 'vest_set', phase: p, seat, used: true, source: 'vote' }
            : { type: 'status_set', phase: p, seat, status: 'out', cause: 'voted', source: 'vote' })
        }
      }
      return ok({ remove: replaced, add: events })
    }

    // ── Ночь ──────────────────────────────────────────────────────────────

    case 'recordNightAction': {
      const p = cmd.phase ?? phase
      if (p.kind !== 'night') return no('wrong_phase')
      const step = nightState(session, registry, p.n).steps.find((x) => x.id === stepIdOf(cmd.actionId, cmd.actor))
      // Носителей в игре нет (или шага нет вовсе) — записывать некуда.
      if (!step || step.grey) return no('step_grey')
      if (cmd.target !== null && !aliveSeats(nightPlayers(session, registry, p.n)).includes(cmd.target)) return no('not_alive')
      // Жёсткое ограничение действия: кого выбрать нельзя вовсе (себя — защитнику).
      if (cmd.target !== null && !step.allowed.includes(cmd.target)) return no('target_not_allowed')
      // Мягкое ограничение: та же цель, что прошлой ночью, — предупреждение, force записывает всё равно.
      const def = registry.nightActions.find((a) => a.id === cmd.actionId)
      const repeats = cmd.target !== null && step.lastNight.recorded && step.lastNight.target === cmd.target
      if (def?.noRepeatTarget && repeats && !cmd.force) return no('repeat_target')
      // Прежняя запись ищется по роли: после обмена ролями она идёт за ролью на новое место.
      const actorOf = actorMapper(log)
      const previous = eventsOf(log, p).filter((e): e is EventOf<'night_action'> =>
        e.type === 'night_action' && e.actionId === cmd.actionId && actorOf(e) === cmd.actor)
      const last = previous.at(-1)
      if (!isNow(p) && last) {
        // Правка прошлой ночи: запись остаётся на месте и получает метку «испр.».
        return ok({ replace: [{ ...last, target: cmd.target }], remove: previous.slice(0, -1).map((e) => e.id) })
      }
      return ok({
        remove: previous.map((e) => e.id),
        add: [{ type: 'night_action', phase: p, actionId: cmd.actionId, actor: cmd.actor, target: cmd.target }],
      })
    }

    case 'confirmNight': {
      if (phase.kind !== 'night') return no('wrong_phase')
      if (!cmd.died.every((seat) => isSeat(session, seat))) return no('not_alive')
      // Одна пачка: отметка итога, статусы всех выбывших и начало следующего дня. Отменяется целиком.
      const { outcome } = nightState(session, registry, phase.n)
      const died = seatsOf(session, cmd.died)
      // Отметка итога пишется раньше статусов: «кто был в игре этой ночью» считается на момент перед ней.
      return ok({
        remove: eventsOf(log, phase).filter((e) => e.type === 'night_confirmed').map((e) => e.id),
        add: [
          { type: 'night_confirmed', phase, hinted: deathSeats(outcome), chosen: died },
          ...nightStatuses(phase, outcome, died),
          ...nightVests(phase, outcome),
          { type: 'phase_started', phase: nextPhase(phase) },
        ],
      })
    }

    case 'acknowledgeNight': {
      const p: PhaseRef = { kind: 'night', n: cmd.night }
      const confirmed = lastOf(eventsOf(log, p), 'night_confirmed')
      if (!confirmed) return ok({})
      const { outcome } = nightState(session, registry, cmd.night)
      const expected = deathSeats(outcome)
      // «Оставить»: статусы не трогаем, запоминаем новую подсказку — предупреждение уходит.
      if (!cmd.apply) return ok({ replace: [{ ...confirmed, hinted: expected, chosen: seatsOf(session, confirmed.chosen) }] })
      // «Исправить»: все прежние выбывшие этой ночи возвращаются в игру, набор подсказки получает статус той же ночью;
      // жилеты, снятые итогом этой ночи, ставятся заново по пересчитанной подсказке. До этого правка записи жилет не трогает.
      return ok({
        remove: [...nightStatusIds(p), ...nightVestIds(p)], replace: [{ ...confirmed, hinted: expected, chosen: expected }],
        add: [...nightStatuses(p, outcome, expected), ...nightVests(p, outcome)],
      })
    }

    case 'announceMorning': {
      // Утро есть со второго дня: до него объявлять нечего.
      if (phase.kind !== 'day' || phase.n < 2) return no('wrong_phase')
      // Окно, открытое снова, в журнал не пишет.
      if (eventsOf(log, phase).some((e) => e.type === 'morning_announced')) return ok({})
      return add({ type: 'morning_announced', phase })
    }

    case 'setVest': {
      if (!isSeat(session, cmd.seat)) return no('not_alive')
      const vest = playersNow(session, registry)[cmd.seat - 1]?.vest
      // Жилет есть только у роли со второй жизнью.
      if (vest === undefined) return no('target_not_allowed')
      if ((vest === 'used') === cmd.used) return ok({})
      return add({ type: 'vest_set', phase, manual: true, seat: cmd.seat, used: cmd.used, source: 'manual' })
    }

    case 'setNightResult': {
      const p: PhaseRef = { kind: 'night', n: cmd.night }
      const confirmed = lastOf(eventsOf(log, p), 'night_confirmed')
      if (!confirmed) return no('wrong_phase')
      if (!cmd.died.every((seat) => isSeat(session, seat))) return no('not_alive')
      // Ведущий правит сам итог: прежние статусы этой ночи снимаются, новый набор получает статус той же ночью.
      const { outcome } = nightState(session, registry, cmd.night)
      const died = seatsOf(session, cmd.died)
      return ok({
        remove: nightStatusIds(p), replace: [{ ...confirmed, hinted: deathSeats(outcome), chosen: died }], add: nightStatuses(p, outcome, died),
      })
    }
  }
}
