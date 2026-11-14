import { applyUndo, DEFAULT_REGISTRY, nightState } from '../../src/engine'
import type { Command, Registry, Session } from '../../src/engine'
import { act, attempt, game, gameWith, n1, play, playWith, st, TABLE_11, toDay } from '../helpers'

const out = (s: Session) => st(s).night!.outcome
test('шаги ночи из справочника', () => {
  expect(st(n1()).night!.steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4'])
  expect(st(n1()).night!.steps[0]).toMatchObject({ actors: [3, 8], grey: false, recorded: false })
  expect(st(n1('S c G D c c c M c c c')).night!.steps.map((x) => x.actionId)).not.toContain('prostitute_block')
  expect(st(n1('S D G M c c c c D')).night!.steps.map((x) => x.id)).toContain('doctor_heal:9')
})
test('выстрел, лечение, пропуск', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7)))).toMatchObject({ dies: 7, reason: 'shot' })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7)))).toMatchObject({ dies: null, reason: 'healed', healed: [7] })
  expect(out(play(n1(), act('mafia_shot', null, null)))).toMatchObject({ dies: null, reason: 'no_shot' })
  expect(out(play(n1(), act('mafia_shot', null, 8)))).toMatchObject({ dies: 8 })
  expect(out(play(n1(), act('mafia_shot', null, 4), act('doctor_heal', 4, 4)))).toMatchObject({ dies: null, reason: 'healed' })
})
test('блок', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 3)))).toMatchObject({ dies: null, reason: 'shooter_blocked' })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 8)))).toMatchObject({ dies: 7 })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7), act('prostitute_block', 10, 4)))).toMatchObject({ dies: 7, blocked: [4] })
})
test('крёстный отец выбыл: стреляют оставшиеся, шерифа никто не ищет', () => {
  const t = 'S c G D c c M M c P c'
  let s = play(toDay(game(t), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' }, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(st(s).night!.steps.find((x) => x.actionId === 'godfather_search')).toMatchObject({ id: 'godfather_search', grey: true })
  expect(attempt(s, act('godfather_search', null, 1))).toEqual({ ok: false, reason: 'step_grey' })
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 7)))).toMatchObject({ dies: 5 })
  s = play(toDay(game(t), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' }, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' },
    { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 8)))).toMatchObject({ reason: 'shooter_blocked' })
})
test('все мафии выбыли: стреляет проститутка', () => {
  let s = toDay(game(TABLE_11), 1)
  for (const seat of [3, 8]) s = play(s, { type: 'setStatus', seat, status: 'out', cause: 'voted' })
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(st(s).night!.steps[0]).toMatchObject({ id: 'mafia_shot', actors: [10], performerRole: 'prostitute', inherited: true, grey: false })
  expect(out(play(s, act('mafia_shot', null, 5)))).toMatchObject({ dies: 5 })
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 10)))).toMatchObject({ reason: 'shooter_blocked' })
})
test('ответы шерифу и крёстному отцу', () => {
  const answer = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!.answer
  for (const [target, side] of [[8, 'black'], [3, 'black'], [10, 'black'], [2, 'red']] as const)
    expect(answer(play(n1(), act('sheriff_check', 1, target)), 'sheriff_check:1')).toEqual({ kind: 'side', side })
  expect(answer(play(n1(), act('prostitute_block', 10, 1), act('sheriff_check', 1, 8)), 'sheriff_check:1')).toEqual({ kind: 'blocked' })
  expect(answer(play(n1(), act('godfather_search', 3, 1)), 'godfather_search:3')).toEqual({ kind: 'found', found: true })
  expect(answer(play(n1(), act('godfather_search', 3, 5), act('prostitute_block', 10, 3)), 'godfather_search:3')).toEqual({ kind: 'found', found: false })
})

test('доктор: повтор цели — предупреждение, через ночь можно', () => {
  let s = play(n1(), act('doctor_heal', 4, 5), { type: 'confirmNight', chosen: null })
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 2 } })
  expect(st(s).night!.steps.at(-1)!.lastNight).toMatchObject({ recorded: true, target: 5 })
  expect(attempt(s, act('doctor_heal', 4, 5))).toEqual({ ok: false, reason: 'repeat_target' })
  const forced = play(s, act('mafia_shot', null, 5), { type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5, force: true })
  expect(out(forced)).toMatchObject({ dies: null, reason: 'healed' })
  s = play(s, act('doctor_heal', 4, 6), { type: 'confirmNight', chosen: null }, { type: 'startPhase', phase: { kind: 'night', n: 3 } })
  expect(attempt(s, act('doctor_heal', 4, 5)).ok).toBe(true)
})
test('цель должна быть в игре; постоянные метки', () => {
  const s = play(toDay(game(TABLE_11), 1), { type: 'setStatus', seat: 9, status: 'out', cause: 'voted' }, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(attempt(s, act('mafia_shot', null, 9))).toEqual({ ok: false, reason: 'not_alive' })
  const marked = st(play(s, act('sheriff_check', 1, 8), act('godfather_search', 3, 5)))
  expect(marked.permanentMarks).toEqual(expect.arrayContaining([{ seat: 8, actionId: 'sheriff_check' }, { seat: 5, actionId: 'godfather_search' }]))
})
test('подтверждение итога — одна пачка: статус, отметка и новый день', () => {
  const before = play(n1(), act('mafia_shot', null, 7))
  expect(st(before).night!.complete).toBe(false)
  const s = play(before, { type: 'confirmNight', chosen: 7 })
  expect(st(s).phase).toEqual({ kind: 'day', n: 2 })
  expect(st(s).players[6]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
  expect(nightState(s, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: 7, chosen: 7 })
  expect(st({ ...s, log: applyUndo(s.log, s.undo.at(-1)!) }).phase).toEqual({ kind: 'night', n: 1 })
  expect(st(play(before, { type: 'confirmNight', chosen: 2 })).players[1]!.status).toBe('out')
})
test('вымышленная роль с существующим эффектом работает без правок движка', () => {
  const reg: Registry = { ...DEFAULT_REGISTRY,
    roles: [...DEFAULT_REGISTRY.roles, { id: 'bodyguard', nameKey: 'role.bodyguard', side: 'red', defaultCount: 0, seenBySheriffAs: 'red' }],
    nightActions: [...DEFAULT_REGISTRY.nightActions, { id: 'bodyguard_guard', order: 45, effect: 'heal', performers: ['bodyguard'], scope: 'each', stepKey: 'k', questionKey: 'q' }] }
  const s = gameWith(reg, ['godfather', 'bodyguard', 'civilian', 'civilian'])
  const cmds: Command[] = [{ type: 'startPhase', phase: { kind: 'day', n: 1 } }, { type: 'startPhase', phase: { kind: 'night', n: 1 } },
    act('mafia_shot', null, 3), act('bodyguard_guard', 2, 3)]
  const night = playWith(reg, s, ...cmds)
  expect(nightState(night, reg, 1).steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:1', 'bodyguard_guard:2'])
  expect(nightState(night, reg, 1).outcome).toMatchObject({ dies: null, reason: 'healed' })
})

test('шаг знает, что его исполнитель заблокирован этой ночью', () => {
  const blocked = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!.blocked
  const s = play(n1(), act('prostitute_block', 10, 1))
  expect(blocked(s, 'sheriff_check:1')).toBe(true); expect(blocked(s, 'doctor_heal:4')).toBe(false)
  expect(blocked(play(n1(), act('prostitute_block', 10, 8)), 'mafia_shot')).toBe(false)
  expect(blocked(play(n1(), act('prostitute_block', 10, 3)), 'mafia_shot')).toBe(true)
})
