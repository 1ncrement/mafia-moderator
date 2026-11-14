import { circleOrder } from '../../src/engine'
import type { Command } from '../../src/engine'
import { attempt, game, play, st, TABLE_11, toDay } from '../helpers'

const d2 = () => toDay(game(TABLE_11), 2)
const speak = (seat: number): Command => ({ type: 'startSpeech', kind: 'speech', seat })
test('пример из ТЗ: 11 игроков, начинает №5', () => {
  expect(circleOrder(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 11)).toEqual([5, 6, 7, 8, 9, 10, 11, 1, 2, 3, 4])
  expect(circleOrder(5, [1, 2, 5, 7, 11], 11)).toEqual([5, 7, 11, 1, 2])
})
test('очередь речей', () => {
  const s = play(d2(), { type: 'openCircle', first: 5 }, speak(5), speak(6))
  expect(st(s).day).toMatchObject({ opener: 5, spoken: [5], waiting: [7, 8, 9, 10, 11, 1, 2, 3, 4] })
  expect(st(s).day!.speaking).toMatchObject({ kind: 'speech', seat: 6 })
})
test('говорящий выбыл; возвращённый встаёт в конец; пропуск', () => {
  let s = play(d2(), { type: 'openCircle', first: 5 }, speak(5), { type: 'setStatus', seat: 6, status: 'out', cause: 'voted' }, speak(7))
  s = play(s, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' })
  expect(st(s).day!.speaking).toBeNull()
  s = play(s, speak(8), { type: 'setStatus', seat: 6, status: 'alive' }, { type: 'skipSpeaker', seat: 9 })
  expect(st(s).day!.waiting).toEqual([10, 11, 1, 2, 3, 4, 6])
})
test('выставление', () => {
  const d1 = play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } })
  expect(attempt(d1, { type: 'nominate', by: 5, target: 7 })).toEqual({ ok: false, reason: 'nominations_closed' })
  let s = play(d2(), { type: 'nominate', by: 5, target: 7 }, { type: 'nominate', by: 6, target: 3 }, { type: 'nominate', by: 2, target: 2 })
  expect(attempt(s, { type: 'nominate', by: 8, target: 3 })).toEqual({ ok: false, reason: 'already_nominated' })
  s = play(s, { type: 'nominate', by: 6, target: 10 }, { type: 'nominate', by: null, target: 4 })
  expect(st(s).day!.nominations.map((n) => [n.target, n.by])).toEqual([[7, 5], [2, 2], [10, 6], [4, null]])
  s = play(s, { type: 'moveNomination', target: 4, toIndex: 0 }, { type: 'setStatus', seat: 10, status: 'out', cause: 'shot' })
  expect(st(s).day!.nominations.map((n) => [n.target, n.active])).toEqual([[4, true], [7, true], [2, true], [10, false]])
  expect(st(s).day!.defense.waiting).toEqual([4, 7, 2])
  expect(attempt(s, { type: 'nominate', by: 1, target: 10 })).toEqual({ ok: false, reason: 'not_alive' })
})
test('вчерашний начинающий', () => {
  const s = toDay(play(play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } }), { type: 'openCircle', first: 3 }), 2)
  expect(st(s).day!.previousOpener).toBe(3)
})
