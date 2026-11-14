import { maxVotesFor } from '../../src/engine'
import type { Session } from '../../src/engine'
import { attempt, game, play, st, TABLE_11, toDay } from '../helpers'

const d2 = () => toDay(game(TABLE_11), 2)
const nominated = (s: Session, ...targets: number[]) => targets.reduce((acc, t, i) => play(acc, { type: 'nominate', by: i + 1, target: t }), s)
const votes = (s: Session, ballot: 1 | 2, pairs: [number, number][]) => pairs.reduce((acc, [c, n]) => play(acc, { type: 'setVotes', ballot, candidate: c, count: n }), s)
const b = (s: Session, i = 0) => st(s).day!.ballots[i]!
test('пример из ТЗ: остаток уходит последнему', () => {
  const s = votes(nominated(d2(), 7, 3, 10, 11, 4), 1, [[7, 0], [3, 2], [10, 3], [11, 2]])
  expect(b(s).entries.at(-1)).toEqual({ candidate: 4, count: 4, auto: true })
  expect(b(s)).toMatchObject({ voters: 11, remaining: 0, complete: true, hint: { outcome: 'eliminated', seats: [4] } })
})
test('превысить число голосующих нельзя', () => {
  const s = votes(nominated(d2(), 7, 3, 10, 11, 4), 1, [[7, 0], [3, 2], [10, 3]])
  expect(maxVotesFor(b(s), 11)).toBe(6)
  expect(attempt(s, { type: 'setVotes', ballot: 1, candidate: 11, count: 7 })).toEqual({ ok: false, reason: 'votes_exceed' })
  expect(maxVotesFor(b(s), 3)).toBe(8)
})
test('голоса кончились раньше — остальным ноль', () => {
  const s = votes(nominated(d2(), 7, 3, 10), 1, [[7, 11]])
  expect(b(s).entries.map((e) => e.count)).toEqual([11, 0, 0]); expect(b(s).hint).toEqual({ outcome: 'eliminated', seats: [7] })
})
test('ничья, переголосование без голосов ничейных, вторая ничья', () => {
  let s = play(nominated(d2(), 7, 3, 10, 11, 4), { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' })
  s = votes(s, 1, [[7, 0], [3, 2], [10, 3], [11, 2]])
  expect(b(s)).toMatchObject({ voters: 10, hint: { outcome: 'tie', seats: [10, 4] } })
  s = play(s, { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [10, 4] })
  expect(st(s).day!.tiebreak.waiting).toEqual([10, 4])
  expect(b(s, 1)).toMatchObject({ n: 2, candidates: [10, 4], voters: 8 })
  s = votes(s, 2, [[10, 4]])
  expect(b(s, 1)).toMatchObject({ complete: true, hint: { outcome: 'tie', seats: [10, 4] } })
  s = play(s, { type: 'resolveVote', ballot: 2, outcome: 'eliminated', seats: [10, 4] })
  expect(st(s).players[9]).toMatchObject({ status: 'out', cause: 'voted', outPhase: { kind: 'day', n: 2 } })
  expect(st(s).day!.farewell.waiting).toEqual([10, 4])
})
test('ничья троих идёт по той же схеме; голосовать некому', () => {
  const three = votes(nominated(toDay(game('G c c c c c'), 2), 2, 3, 4), 1, [[2, 2], [3, 2]])
  expect(b(three).hint).toEqual({ outcome: 'tie', seats: [2, 3, 4] })
  const none = play(votes(nominated(toDay(game('G c c c'), 2), 2, 3), 1, [[2, 2]]), { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [2, 3] })
  expect(b(play(none, { type: 'setVoters', ballot: 2, count: 0 }), 1)).toMatchObject({ voters: 0, complete: true, hint: { outcome: 'tie', seats: [2, 3] } })
})
test('один кандидат и ноль кандидатов', () => {
  expect(b(nominated(d2(), 9))).toMatchObject({ complete: true, hint: { outcome: 'eliminated', seats: [9] } })
  expect(st(d2()).day!.ballots).toEqual([])
})
test('остаток можно уменьшить, число голосующих — поправить, голоса — сбросить', () => {
  let s = votes(nominated(d2(), 7, 3), 1, [[7, 4], [3, 5]])
  expect(b(s)).toMatchObject({ remaining: 2, complete: true }); expect(b(s).entries[1]).toMatchObject({ count: 5, auto: false })
  s = play(s, { type: 'setVoters', ballot: 1, count: 9 })
  expect(b(s)).toMatchObject({ voters: 9, votersOverridden: true, remaining: 0 })
  expect(b(play(s, { type: 'resetVotes', ballot: 1 })).entries.map((e) => e.count)).toEqual([null, null])
})
test('статус меняется посреди голосования: пересчёт без падения', () => {
  let s = votes(nominated(d2(), 7, 3, 10), 1, [[7, 6], [3, 5]])
  s = play(s, { type: 'setStatus', seat: 1, status: 'out', cause: 'shot' })
  expect(b(s)).toMatchObject({ voters: 10, overflow: true })
  expect(st(s).warnings).toContainEqual({ code: 'votes_overflow', ballot: 1 })
  s = play(s, { type: 'setStatus', seat: 3, status: 'out', cause: 'shot' })
  expect(b(s).candidates).toEqual([7, 10])
})
