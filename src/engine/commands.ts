import { dayState, nominationsOf } from './day'
import { currentPhase, EMPTY_PATCH, eventsOf, lastOf, nextPhase, samePhase } from './log'
import { nightState, stepIdOf } from './night'
import { aliveSeats, isSeat, playersAt, playersNow } from './players'
import type {
  Command, CommandResult, EventOf, LogPatch, NewEvent, PhaseRef, Registry, RejectCode, Seat, Session,
} from './types'
import { maxVotesFor } from './vote'

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
      if (!log.some((e) => e.id === cmd.id)) return no('unknown_event')
      return ok({ remove: [cmd.id] })
    }

    // ── День: круг речей ──────────────────────────────────────────────────

    case 'openCircle': {
      if (phase.kind !== 'day') return no('wrong_phase')
      if (!aliveFor(phase).has(cmd.first)) return no('not_alive')
      return add(...endOpenSpeech(), { type: 'circle_opened', phase, first: cmd.first })
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
      return ok({
        remove: idsIn(phase, 'voters_set', (e) => e.ballot === cmd.ballot).map((e) => e.id),
        add: [{ type: 'voters_set', phase, ballot: cmd.ballot, count }],
      })
    }

    case 'resetVotes':
      return ok({ remove: idsIn(phase, 'votes_set', (e) => e.ballot === cmd.ballot).map((e) => e.id) })

    case 'resolveVote': {
      if (phase.kind !== 'day') return no('wrong_phase')
      const seats = cmd.outcome === 'nobody' ? [] : [...new Set(cmd.seats)].filter((s) => isSeat(session, s))
      // Исход пишется раньше статусов: число голосующих тура считается на момент перед исходом.
      const events: NewEvent[] = [{ type: 'vote_resolved', phase, ballot: cmd.ballot, outcome: cmd.outcome, seats }]
      if (cmd.outcome === 'eliminated') {
        for (const seat of seats) events.push({ type: 'status_set', phase, seat, status: 'out', cause: 'voted', source: 'vote' })
      }
      return ok({ remove: idsIn(phase, 'vote_resolved', (e) => e.ballot === cmd.ballot).map((e) => e.id), add: events })
    }

    // ── Ночь ──────────────────────────────────────────────────────────────

    case 'recordNightAction': {
      const p = cmd.phase ?? phase
      if (p.kind !== 'night') return no('wrong_phase')
      const step = nightState(session, registry, p.n).steps.find((x) => x.id === stepIdOf(cmd.actionId, cmd.actor))
      // Носителей в игре нет (или шага нет вовсе) — записывать некуда.
      if (!step || step.grey) return no('step_grey')
      if (cmd.target !== null && !aliveSeats(playersAt(session, registry, p)).includes(cmd.target)) return no('not_alive')
      // Мягкое ограничение: та же цель, что прошлой ночью, — предупреждение, force записывает всё равно.
      const def = registry.nightActions.find((a) => a.id === cmd.actionId)
      const repeats = cmd.target !== null && step.lastNight.recorded && step.lastNight.target === cmd.target
      if (def?.noRepeatTarget && repeats && !cmd.force) return no('repeat_target')
      const previous = eventsOf(log, p).filter((e): e is EventOf<'night_action'> =>
        e.type === 'night_action' && e.actionId === cmd.actionId && e.actor === cmd.actor)
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
      if (cmd.chosen !== null && !isSeat(session, cmd.chosen)) return no('not_alive')
      // Одна пачка: статус выбывшего, отметка итога и начало следующего дня. Отменяется целиком.
      const hinted = nightState(session, registry, phase.n).outcome.dies
      const events: NewEvent[] = []
      if (cmd.chosen !== null) events.push({ type: 'status_set', phase, seat: cmd.chosen, status: 'out', cause: 'shot', source: 'night' })
      events.push({ type: 'night_confirmed', phase, hinted, chosen: cmd.chosen })
      events.push({ type: 'phase_started', phase: nextPhase(phase) })
      return ok({ remove: eventsOf(log, phase).filter((e) => e.type === 'night_confirmed').map((e) => e.id), add: events })
    }

    case 'acknowledgeNight': {
      const p: PhaseRef = { kind: 'night', n: cmd.night }
      const confirmed = lastOf(eventsOf(log, p), 'night_confirmed')
      if (!confirmed) return ok({})
      const expected = nightState(session, registry, cmd.night).outcome.dies
      // «Оставить»: статусы не трогаем, запоминаем новую подсказку — предупреждение уходит.
      if (!cmd.apply) return ok({ replace: [{ ...confirmed, hinted: expected }] })
      // «Исправить»: прежний выбывший этой ночи возвращается в игру, новый получает статус той же ночью.
      const previous = eventsOf(log, p).filter((e) => e.type === 'status_set' && e.source === 'night').map((e) => e.id)
      const events: NewEvent[] = expected === null ? []
        : [{ type: 'status_set', phase: p, seat: expected, status: 'out', cause: 'shot', source: 'night' }]
      return ok({ remove: previous, replace: [{ ...confirmed, hinted: expected, chosen: expected }], add: events })
    }
  }
}
