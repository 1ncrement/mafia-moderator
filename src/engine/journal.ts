import { dayState } from './day'
import { currentPhase, eventsOf, phaseAt, phaseOrder, samePhase } from './log'
import { nightState, quietNight } from './night'
import { isSeat } from './players'
import type { GameEvent, JournalEntry, JournalGroup, PhaseRef, Registry, RoleId, Session } from './types'

// Журнал для показа: группы по фазам и записи. Текст записи строит интерфейс,
// поэтому журнал переключается вместе с языком. Служебные события сюда не попадают.

const flags = (e: GameEvent) => ({ eventId: e.id, edited: e.edited === true, manual: e.manual === true })

/** Записи, общие для любой фазы: ручной статус, жилет, обмен ролями, конец игры. */
function commonEntry(session: Session, e: GameEvent): JournalEntry | null {
  switch (e.type) {
    case 'status_set':
      // Статусы от ночи и голосования показаны итогом ночи и исходом голосования.
      if (e.source !== 'manual' || !isSeat(session, e.seat)) return null
      return e.status === 'out'
        ? { ...flags(e), kind: 'status', seat: e.seat, status: 'out', cause: e.cause }
        : { ...flags(e), kind: 'status', seat: e.seat, status: 'alive' }
    case 'vest_set':
      return isSeat(session, e.seat) ? { ...flags(e), kind: 'vest', seat: e.seat, used: e.used === true, source: e.source } : null
    case 'roles_swapped':
      return isSeat(session, e.a) && isSeat(session, e.b) ? { ...flags(e), kind: 'swap', a: e.a, b: e.b } : null
    case 'game_finished':
      return { ...flags(e), kind: 'finish', winner: e.winner }
    default:
      return null
  }
}

function dealEntries(session: Session, events: GameEvent[]): JournalEntry[] {
  const out: JournalEntry[] = []
  for (const e of events) {
    if (e.type === 'roles_dealt') {
      const counts: Record<RoleId, number> = {}
      for (const role of e.assignment) counts[role] = (counts[role] ?? 0) + 1
      out.push({ ...flags(e), kind: 'deal', counts })
    } else {
      const entry = commonEntry(session, e)
      if (entry) out.push(entry)
    }
  }
  return out
}

function dayEntries(session: Session, registry: Registry, n: number, events: GameEvent[]): JournalEntry[] {
  const day = dayState(session, registry, n)
  const out: JournalEntry[] = []
  const votesShown = new Set<number>()
  for (const e of events) {
    switch (e.type) {
      case 'circle_opened':
        if (isSeat(session, e.first)) out.push({ ...flags(e), kind: 'circle', first: e.first, ...(e.random === true ? { random: true as const } : {}) })
        break
      case 'nominated': {
        const index = day.nominations.findIndex((x) => x.eventId === e.id)
        const found = day.nominations[index]
        if (found) out.push({ ...flags(e), kind: 'nomination', index: index + 1, by: found.by, target: found.target })
        break
      }
      case 'votes_set':
      case 'voters_set': {
        // Таблица голосов тура — одна запись на месте первого введённого числа.
        const ballot = day.ballots.find((b) => b.n === e.ballot)
        if (!ballot || votesShown.has(e.ballot)) break
        votesShown.add(e.ballot)
        const entries = ballot.entries.flatMap((x) => (x.count === null ? [] : [{ candidate: x.candidate, count: x.count }]))
        const edited = events.some((x) => x.type === 'votes_set' && x.ballot === e.ballot && x.edited === true)
        out.push({ eventId: null, edited, manual: false, kind: 'votes', ballot: ballot.n, voters: ballot.voters, entries })
        break
      }
      case 'vote_resolved':
        out.push({ ...flags(e), kind: 'vote_result', ballot: e.ballot, outcome: e.outcome, seats: e.seats.filter((s) => isSeat(session, s)) })
        break
      default: {
        const entry = commonEntry(session, e)
        if (entry) out.push(entry)
      }
    }
  }
  return out
}

function nightEntries(session: Session, registry: Registry, n: number, events: GameEvent[], current: boolean): JournalEntry[] {
  const night = nightState(session, registry, n)
  const out: JournalEntry[] = []
  // Записи идут в порядке шагов; у несерого шага прошлой ночи без записи — «не записано».
  for (const step of night.steps) {
    const numbered = night.steps.filter((x) => x.actionId === step.actionId).length > 1
    const base = { actionId: step.actionId, actor: step.actor, ...(numbered ? { numbered: true as const } : {}) }
    if (step.recorded) {
      out.push({
        eventId: step.eventId, edited: step.edited, manual: false, kind: 'night_action', ...base,
        performerRole: step.performerRole, target: step.target, ...(step.target2 !== null ? { target2: step.target2 } : {}),
        ...(step.answer ? { answer: step.answer } : {}),
      })
    } else if (!step.grey && !step.resting && !current) {
      out.push({ eventId: null, edited: false, manual: false, kind: 'night_missing', ...base })
    }
  }
  for (const e of events) {
    const entry = commonEntry(session, e)
    if (entry) out.push(entry)
  }
  const confirmed = events.findLast((e) => e.type === 'night_confirmed')
  if (confirmed && night.confirmed) {
    // Причина — из статуса, который поставил итог этой ночи.
    const causeOf = (seat: number) => events.findLast((e) => e.type === 'status_set' && e.source === 'night' && e.seat === seat && e.status === 'out')
    const died = night.confirmed.chosen
    const causes = died.map((seat) => {
      const status = causeOf(seat)
      return status?.type === 'status_set' ? status.cause : undefined
    })
    out.push({ ...flags(confirmed), kind: 'night_result', died, causes, reason: quietNight(night.outcome) })
  }
  return out
}

/** Журнал группами по фазам: от текущей фазы к распределению. */
export function journal(session: Session, registry: Registry): JournalGroup[] {
  const now = currentPhase(session.log)
  const groups: JournalGroup[] = []
  for (let order = phaseOrder(now); order >= 0; order--) {
    const phase: PhaseRef = phaseAt(order)
    const events = eventsOf(session.log, phase)
    const current = samePhase(phase, now)
    const entries = phase.kind === 'deal' ? dealEntries(session, events)
      : phase.kind === 'day' ? dayEntries(session, registry, phase.n, events)
      : nightEntries(session, registry, phase.n, events, current)
    groups.push({ phase, current, entries })
  }
  return groups
}
