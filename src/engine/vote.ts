import { lastOf } from './log'
import { aliveSeats, playersBefore } from './players'
import type { Ballot, EventOf, GameEvent, Nomination, PlayerView, Registry, Seat, Session, VoteHint } from './types'

// Туры голосования дня: кандидаты, число голосующих, остаток и подсказка исхода.
// Ведущий записывает только число голосов за каждого кандидата.

function makeBallot(
  n: 1 | 2, candidates: Seat[], defaultVoters: number, events: GameEvent[], resolved: EventOf<'vote_resolved'> | null,
): Ballot {
  const override = lastOf(events, 'voters_set', (e) => e.ballot === n && Number.isFinite(e.count))
  const voters = Math.max(0, Math.floor(override ? override.count : defaultVoters))

  // Явно введённые числа: последнее по seq для кандидата; голоса за снятых пропускаются.
  const explicit = new Map<Seat, number>()
  for (const e of events) {
    if (e.type !== 'votes_set' || e.ballot !== n || !candidates.includes(e.candidate) || !Number.isFinite(e.count)) continue
    explicit.set(e.candidate, Math.max(0, Math.floor(e.count)))
  }
  const entered = [...explicit.values()].reduce((sum, x) => sum + x, 0)
  const left = voters - entered
  const blanks = candidates.filter((c) => !explicit.has(c)).length

  const entries: Ballot['entries'] = candidates.map((candidate, i) => {
    const count = explicit.get(candidate)
    if (count !== undefined) return { candidate, count, auto: false }
    // Голоса кончились — всем без числа ноль.
    if (left <= 0) return { candidate, count: 0, auto: true }
    // Последнему кандидату уходит весь остаток, когда у остальных числа уже есть.
    if (blanks === 1 && i === candidates.length - 1) return { candidate, count: left, auto: true }
    return { candidate, count: null, auto: false }
  })

  const complete = entries.every((e) => e.count !== null)
  const total = entries.reduce((sum, e) => sum + (e.count ?? 0), 0)
  let hint: VoteHint = null
  if (complete && entries.length > 0) {
    const top = Math.max(...entries.map((e) => e.count ?? 0))
    const leaders = entries.filter((e) => e.count === top).map((e) => e.candidate)
    hint = { outcome: leaders.length === 1 ? 'eliminated' : 'tie', seats: leaders }
  }

  return {
    n, candidates, voters, votersOverridden: override !== null, entries,
    remaining: Math.max(0, voters - total), complete, overflow: entered > voters, hint,
    resolved: resolved ? { outcome: resolved.outcome, seats: [...resolved.seats] } : null,
  }
}

/**
 * Тур 1 — активные выставленные в порядке выставления, голосуют все игроки в игре.
 * Тур 2 появляется после ничьей: только её участники, сами они не голосуют.
 * У подтверждённого тура кандидаты и голосующие считаются на момент перед исходом.
 * mute — кто сегодня не голосует (молчащие, если так задано опцией): по умолчанию голосующих меньше на тех из них, кто в игре.
 */
export function buildBallots(
  session: Session, registry: Registry, events: GameEvent[], nominations: Nomination[], now: PlayerView[], mute: readonly Seat[] = [],
): Ballot[] {
  const resolvedOf = (n: 1 | 2) => lastOf(events, 'vote_resolved', (e) => e.ballot === n)
  const aliveAt = (resolved: GameEvent | null) => new Set(aliveSeats(resolved ? playersBefore(session, registry, resolved) : now))

  const first = resolvedOf(1)
  const alive1 = aliveAt(first)
  const candidates1 = nominations.map((x) => x.target).filter((s) => alive1.has(s))
  if (candidates1.length === 0) return []
  const muted = (alive: ReadonlySet<Seat>, except: Seat[] = []) => mute.filter((s) => alive.has(s) && !except.includes(s)).length
  const ballots = [makeBallot(1, candidates1, alive1.size - muted(alive1), events, first)]

  if (first?.outcome === 'tie') {
    const second = resolvedOf(2)
    const alive2 = aliveAt(second)
    const candidates2 = candidates1.filter((s) => first.seats.includes(s) && alive2.has(s))
    // Ничейные не голосуют и так: молчащий среди них второй раз не вычитается.
    if (candidates2.length > 0) ballots.push(makeBallot(2, candidates2, alive2.size - candidates2.length - muted(alive2, candidates2), events, second))
  }
  return ballots
}

/** Сколько голосов ещё можно отдать кандидату: голосующие минус явно введённое за остальных. */
export function maxVotesFor(ballot: Ballot, candidate: Seat): number {
  const others = ballot.entries.reduce((sum, e) => (e.candidate !== candidate && !e.auto ? sum + (e.count ?? 0) : sum), 0)
  return Math.max(0, ballot.voters - others)
}

/** Сумма чисел, введённых ведущим: подставленные движком остаток и нули не считаются. */
export function enteredVotes(ballot: Ballot): number {
  return ballot.entries.reduce((sum, e) => (e.auto ? sum : sum + (e.count ?? 0)), 0)
}
