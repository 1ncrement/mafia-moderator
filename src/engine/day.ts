import { currentPhase, eventsOf, lastOf, nextPhase, samePhase } from './log'
import { aliveSeats, isSeat, playersAt, playersNow } from './players'
import type { DayState, EventOf, Nomination, PhaseRef, Registry, Seat, Session, SpeechKind, SpeechQueue } from './types'
import { buildBallots } from './vote'

/** Круг: по возрастанию номеров от начинающего, после последнего — первый; выбывшие пропускаются. */
export function circleOrder(first: Seat, alive: Seat[], playerCount: number): Seat[] {
  if (playerCount <= 0) return []
  const inGame = new Set(alive)
  const start = (((first - 1) % playerCount) + playerCount) % playerCount
  const out: Seat[] = []
  for (let i = 0; i < playerCount; i++) {
    const seat = ((start + i) % playerCount) + 1
    if (inGame.has(seat)) out.push(seat)
  }
  return out
}

const unique = (seats: Seat[]): Seat[] => [...new Set(seats)]

/** Выставленные дня в порядке выставления; повтор цели не учитывается. */
export function nominationsOf(session: Session, phase: PhaseRef, alive: ReadonlySet<Seat>): Nomination[] {
  const events = eventsOf(session.log, phase).filter((e): e is EventOf<'nominated'> => e.type === 'nominated')
  const seen = new Set<Seat>()
  const out: Nomination[] = []
  for (const e of events.sort((a, b) => a.order - b.order || a.seq - b.seq)) {
    if (!isSeat(session, e.target) || seen.has(e.target)) continue
    seen.add(e.target)
    out.push({ target: e.target, by: isSeat(session, e.by) ? e.by : null, order: e.order, eventId: e.id, active: alive.has(e.target) })
  }
  return out
}

/** Состояние дня n: круг речей, выставленные, туры голосования, очереди оправданий и прощаний. */
export function dayState(session: Session, registry: Registry, n: number): DayState {
  const phase: PhaseRef = { kind: 'day', n }
  const isCurrent = samePhase(currentPhase(session.log), phase)
  // Прошедший день смотрим по статусам на начало следующей фазы.
  const now = isCurrent ? playersNow(session, registry) : playersAt(session, registry, nextPhase(phase))
  const alive = new Set(aliveSeats(now))
  const events = eventsOf(session.log, phase)

  // Круг речей.
  const circle = lastOf(events, 'circle_opened', (e) => isSeat(session, e.first))
  const opener = circle?.first ?? null
  const yesterday = n > 1 ? lastOf(session.log, 'circle_opened', (e) => samePhase(e.phase, { kind: 'day', n: n - 1 })) : null
  const previousOpener = yesterday && isSeat(session, yesterday.first) ? yesterday.first : null

  const ended = new Set(events.flatMap((e) => (e.type === 'speech_ended' ? [e.startId] : [])))
  const starts = events.filter((e): e is EventOf<'speech_started'> => e.type === 'speech_started')
  const lastStart = starts.at(-1)
  let speaking: DayState['speaking'] = lastStart && !ended.has(lastStart.id)
    ? { kind: lastStart.kind, seat: lastStart.seat, eventId: lastStart.id }
    : null
  // Выбыл говорящий — слово снимается. Прощание выгнанного этим не прерывается.
  if (speaking && speaking.seat !== null && speaking.kind !== 'farewell' && !alive.has(speaking.seat)) speaking = null

  const circleSeq = circle?.seq ?? -Infinity
  const speeches = starts.filter((e) => e.kind === 'speech' && isSeat(session, e.seat) && e.seq > circleSeq)
  const speakingSeat = speaking?.kind === 'speech' ? speaking.seat : null
  const spoken = unique(speeches.map((e) => e.seat as Seat)).filter((s) => s !== speakingSeat)
  const skipped = unique(events.flatMap((e) => (e.type === 'speaker_skipped' && e.seq > circleSeq && isSeat(session, e.seat) ? [e.seat] : [])))
    .filter((s) => !spoken.includes(s) && s !== speakingSeat)
  // Ждут слова: сначала места дальше по кругу от последнего говорившего, затем те, чьё место уже прошли.
  const lastSpeaker = speeches.at(-1)?.seat ?? null
  const from = lastSpeaker !== null ? lastSpeaker + 1 : (opener ?? 1)
  const waiting = circleOrder(from, [...alive], session.config.playerCount)
    .filter((s) => !spoken.includes(s) && !skipped.includes(s) && s !== speakingSeat)

  // Выставление и голосование.
  const nominations = nominationsOf(session, phase, alive)
  const ballots = buildBallots(session, registry, events, nominations, now)

  // Очереди речей по 30 секунд.
  const order = nominations.map((x) => x.target)
  const byNomination = (seats: Seat[]) => [...seats].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a - b
  })
  const queue = (seats: Seat[], kind: SpeechKind): SpeechQueue => {
    const started = new Set(starts.filter((e) => e.kind === kind).map((e) => e.seat))
    const current = speaking?.kind === kind ? speaking.seat : null
    return { done: seats.filter((s) => started.has(s) && s !== current), waiting: seats.filter((s) => !started.has(s)) }
  }
  const tie = ballots[0]?.resolved?.outcome === 'tie' ? ballots[0].resolved.seats : []
  const expelled = unique(ballots.flatMap((b) => (b.resolved?.outcome === 'eliminated' ? b.resolved.seats : [])))

  return {
    n,
    nominationsOpen: n >= session.config.rules.nominationsFromDay,
    opener, previousOpener, spoken, skipped, waiting, speaking,
    nominations, ballots,
    defense: queue(nominations.filter((x) => x.active).map((x) => x.target), 'defense'),
    tiebreak: queue(byNomination(tie.filter((s) => alive.has(s))), 'tiebreak'),
    farewell: queue(byNomination(expelled.filter((s) => isSeat(session, s) && !alive.has(s))), 'farewell'),
  }
}
