import { DEFAULT_REGISTRY, journal } from '../../src/engine'
import type { Session } from '../../src/engine'
import { act, attempt, game, n1, play, st, TABLE_11, toDay } from '../helpers'

test('группы журнала: текущая фаза первой, служебные события скрыты', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'openCircle', first: 5 }, { type: 'startSpeech', kind: 'speech', seat: 5 }, { type: 'nominate', by: 5, target: 7 })
  const groups = journal(s, DEFAULT_REGISTRY)
  expect(groups.map((g) => g.phase.kind)).toEqual(['day', 'night', 'day', 'deal'])
  expect(groups[0]).toMatchObject({ current: true })
  expect(groups[0]!.entries.map((e) => e.kind)).toEqual(['circle', 'nomination'])
  expect(groups.at(-1)!.entries[0]).toMatchObject({ kind: 'deal', counts: { godfather: 1, mafia: 1, civilian: 6 } })
})
test('незаписанный шаг прошлой ночи виден и дописывается задним числом', () => {
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: 7 })
  const night = () => journal(s, DEFAULT_REGISTRY).find((g) => g.phase.kind === 'night')!.entries
  expect(night().map((e) => e.kind)).toEqual(['night_action', 'night_missing', 'night_missing', 'night_missing', 'night_missing', 'night_result'])
  s = play(s, { type: 'recordNightAction', actionId: 'sheriff_check', actor: 1, target: 8, phase: { kind: 'night', n: 1 } })
  expect(night()[3]).toMatchObject({ kind: 'night_action', actionId: 'sheriff_check', target: 8, answer: { kind: 'side', side: 'black' } })
})
test('правка прошлой ночи не меняет статусы молча', () => {
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: 7 })
  s = play(s, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 9, phase: { kind: 'night', n: 1 } })
  expect(st(s).players[6]!.status).toBe('out')
  expect(st(s).warnings).toContainEqual({ code: 'night_outcome_changed', night: 1, expected: 9 })
  const applied = st(play(s, { type: 'acknowledgeNight', night: 1, apply: true }))
  expect(applied.players[6]!.status).toBe('alive')
  expect(applied.players[8]).toMatchObject({ status: 'out', outPhase: { kind: 'night', n: 1 } }); expect(applied.warnings).toEqual([])
  const kept = st(play(s, { type: 'acknowledgeNight', night: 1, apply: false }))
  expect(kept.players[6]!.status).toBe('out'); expect(kept.warnings).toEqual([])
})
test('ведущий сознательно выбрал другого: предупреждения нет', () => {
  expect(st(play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: null })).warnings).toEqual([])
})
test('удаление записи', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'nominate', by: 5, target: 7 })
  const id = st(s).day!.nominations[0]!.eventId
  expect(st(play(s, { type: 'removeEvent', id })).day!.nominations).toEqual([])
  expect(attempt(s, { type: 'removeEvent', id: 'нет такого' })).toEqual({ ok: false, reason: 'unknown_event' })
})
test('журнал с висячими ссылками не роняет вывод', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'nominate', by: 5, target: 7 }, { type: 'setVotes', ballot: 1, candidate: 7, count: 3 })
  const broken: Session = { ...s, log: [...s.log.filter((e) => e.type !== 'nominated'),
    { id: 'x1', seq: 9001, tx: 'x', phase: { kind: 'day', n: 2 }, type: 'speech_ended', startId: 'нет' },
    { id: 'x2', seq: 9002, tx: 'x', phase: { kind: 'night', n: 1 }, type: 'night_action', actionId: 'нет', actor: 99, target: 42 },
    { id: 'x3', seq: 9003, tx: 'x', phase: { kind: 'day', n: 2 }, type: 'status_set', seat: 99, status: 'out', source: 'manual' }] }
  expect(() => st(broken)).not.toThrow(); expect(() => journal(broken, DEFAULT_REGISTRY)).not.toThrow()
  expect(st(broken).counts.alive).toBe(11)
})

test('исход голосования и итог ночи правятся задним числом вместе со статусами', () => {
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: 7 })
  s = play(s, { type: 'nominate', by: 5, target: 3 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [3] },
    { type: 'startPhase', phase: { kind: 'night', n: 2 } }, { type: 'confirmNight', chosen: null })
  expect(st(s).phase).toEqual({ kind: 'day', n: 3 })
  // итог ночи
  let fixed = play(s, { type: 'setNightResult', night: 1, chosen: null })
  expect(st(fixed).players[6]!.status).toBe('alive')
  expect(journal(fixed, DEFAULT_REGISTRY).at(-3)!.entries.at(-1)).toMatchObject({ kind: 'night_result', dies: null, edited: true })
  fixed = play(fixed, { type: 'setNightResult', night: 1, chosen: 9 })
  expect(st(fixed).players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } }); expect(st(fixed).warnings).toEqual([])
  expect(attempt(s, { type: 'setNightResult', night: 5, chosen: null })).toEqual({ ok: false, reason: 'wrong_phase' })
  // исход голосования прошлого дня
  const day2 = { kind: 'day', n: 2 } as const
  const nobody = play(s, { type: 'resolveVote', ballot: 1, outcome: 'nobody', seats: [], phase: day2 })
  expect(st(nobody).players[2]!.status).toBe('alive')
  const other = play(s, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [5], phase: day2 })
  expect(st(other).players[2]!.status).toBe('alive'); expect(st(other).players[4]).toMatchObject({ status: 'out', cause: 'voted', outPhase: day2 })
  // удаление записи исхода снимает и её статусы
  const id = s.log.find((e) => e.type === 'vote_resolved')!.id
  expect(st(play(s, { type: 'removeEvent', id })).players[2]!.status).toBe('alive')
})
