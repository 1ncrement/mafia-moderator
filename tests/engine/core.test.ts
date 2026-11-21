import { DEFAULT_REGISTRY, playersAt } from '../../src/engine'
import { attempt, game, play, st, TABLE_11, toDay } from '../helpers'

test('после раздачи: фаза deal, роли и стороны по местам', () => {
  const g = st(game(TABLE_11))
  expect(g.phase).toEqual({ kind: 'deal' }); expect(g.step).toBeNull()
  expect(g.players[2]).toMatchObject({ seat: 3, roleId: 'godfather', side: 'black', status: 'alive' })
  expect(g.counts).toMatchObject({ total: 11, alive: 11, bySide: { black: 3, red: 8 } })
})
test('перераздать можно только до Дня 1', () => {
  const s = game(TABLE_11); const again = [...st(s).players.map((p) => p.roleId)].reverse()
  expect(st(play(s, { type: 'deal', assignment: again })).players[0]!.roleId).toBe('civilian')
  const d1 = play(s, { type: 'startPhase', phase: { kind: 'day', n: 1 } })
  expect(attempt(d1, { type: 'deal', assignment: again })).toEqual({ ok: false, reason: 'redeal_closed' })
})
test('фазы идут только вперёд по одной, шаг по умолчанию зависит от дня', () => {
  const s = game(TABLE_11)
  expect(attempt(s, { type: 'startPhase', phase: { kind: 'night', n: 1 } })).toEqual({ ok: false, reason: 'wrong_phase' })
  const d1 = play(s, { type: 'startPhase', phase: { kind: 'day', n: 1 } })
  expect(st(d1).step).toBe('speeches')
  expect(st(toDay(s, 2)).step).toBe('balagan')
})
test('ручной статус и возврат в игру', () => {
  const d1 = play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } })
  const out = play(d1, { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' })
  expect(st(out).players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'day', n: 1 } })
  expect(st(out).counts).toMatchObject({ alive: 10, bySide: { black: 3, red: 7 } })
  expect(st(play(out, { type: 'setStatus', seat: 9, status: 'alive' })).counts.alive).toBe(11)
})
test('обмен ролями действует задним числом', () => {
  const g = st(play(toDay(game(TABLE_11), 2), { type: 'swapRoles', a: 1, b: 2 }))
  expect(g.players[0]!.roleId).toBe('civilian'); expect(g.players[1]!.roleId).toBe('sheriff')
})
test('подсказка о конце игры', () => {
  let s = play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } })
  for (const seat of [3, 8, 10]) s = play(s, { type: 'setStatus', seat, status: 'out', cause: 'voted' })
  expect(st(s).endHint).toBe('no_black')
  expect(st(game('G M c c')).endHint).toBe('black_not_less')
  expect(st(game(TABLE_11)).endHint).toBeNull()
})
test('остановка и возобновление', () => {
  const f = play(game(TABLE_11), { type: 'finishGame', winner: 'black' })
  expect(st(f).finished).toEqual({ winner: 'black' })
  expect(st(play(f, { type: 'resumeGame' })).finished).toBeNull()
})
test('playersAt возвращает статусы на начало фазы', () => {
  const s = play(toDay(game(TABLE_11), 2), { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' })
  expect(playersAt(s, DEFAULT_REGISTRY, { kind: 'day', n: 2 })[8]!.status).toBe('alive')
})
