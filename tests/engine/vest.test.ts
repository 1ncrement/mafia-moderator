import { entryText, summaryBody } from '../../src/app/i18n'
import { applyUndo, DEFAULT_REGISTRY, DEFAULT_RULES, journal, quietNight } from '../../src/engine'
import type { Command, Session, SessionConfig } from '../../src/engine'
import { act, attempt, game, play, st, toDay } from '../helpers'

// Бронежилет (дополнение 5.5 п. 5; 5.7). Стол: №1 шериф, №2 бронежилет, №3 крёстный отец, №4 доктор, №5 мясник,
// №6 охранник, №8 мафия, №10 проститутка.
const TABLE = 'S bulletproof G D butcher bodyguard c M c P c'
const N1 = { kind: 'night', n: 1 } as const
const N2 = { kind: 'night', n: 2 } as const
const night1 = (config?: Partial<SessionConfig>): Session => play(toDay(game(TABLE, config), 1), { type: 'startPhase', phase: N1 })
const out = (s: Session) => st(s).night!.outcome
const vest = (s: Session, seat = 2) => st(s).players[seat - 1]!.vest
const confirm = (...died: number[]): Command => ({ type: 'confirmNight', died })
const undo = (s: Session): Session => ({ ...s, log: applyUndo(s.log, s.undo.at(-1)!), undo: s.undo.slice(0, -1) })
const texts = (s: Session, kind: 'day' | 'night', lang: 'ru' | 'uk' = 'ru') =>
  journal(s, DEFAULT_REGISTRY).find((g) => g.phase.kind === kind)!.entries.map((e) => entryText(lang, e, DEFAULT_REGISTRY))

test('жилет есть только у роли со второй жизнью и сначала цел', () => {
  const players = st(night1()).players
  expect(players[1]).toMatchObject({ roleId: 'bulletproof', vest: 'intact' })
  expect(players.filter((p) => p.vest !== undefined).map((p) => p.seat)).toEqual([2])
  // В игре без бронежилета поля нет ни у кого.
  expect(st(game('S c G D c c c M c P c')).players.every((p) => p.vest === undefined)).toBe(true)
})
test('ночное нападение на игрока в целом жилете: он остаётся в игре — заметка «жилет» с причиной нападения, смертей нет', () => {
  const shot = play(night1(), act('mafia_shot', null, 2))
  expect(out(shot)).toEqual({ deaths: [], notes: [{ seat: 2, kind: 'vest', cause: 'shot' }], blocked: [], healed: [], noAttack: null })
  expect(quietNight(out(shot))).toBe('spared')
  expect(out(play(night1(), act('butcher_kill', 5, 2))).notes).toEqual([{ seat: 2, kind: 'vest', cause: 'slain' }])
  // Два нападения в одну ночь жилет принимает как одно.
  expect(out(play(night1(), act('mafia_shot', null, 2), act('butcher_kill', 5, 2)))).toMatchObject({ deaths: [], notes: [{ seat: 2, kind: 'vest', cause: 'shot' }] })
  // До подтверждения итога жилет цел: подсказка ничего не меняет сама.
  expect(vest(shot)).toBe('intact')
})
test('подтверждение итога снимает жилет: игрок в игре, роль открыта; «Отменить» возвращает жилет', () => {
  const s = play(night1(), act('mafia_shot', null, 2), confirm())
  expect(st(s).players[1]).toMatchObject({ status: 'alive', vest: 'used' }); expect(st(s).warnings).toEqual([])
  expect(st(s).morning).toMatchObject({ deaths: [], spared: [2] })
  const lines = texts(s, 'night')
  expect(lines[0]).toBe('Мафия → №2'); expect(lines.slice(-2)).toEqual(['№2 был в бронежилете — остаётся', 'Итог ночи: никто не выбыл (спас бронежилет)'])
  expect(vest(undo(s))).toBe('intact'); expect(st(undo(s)).phase).toEqual(N1)
})
test('второе нападение — настоящая смерть', () => {
  let s = play(night1(), act('mafia_shot', null, 2), confirm(), { type: 'announceMorning' }, { type: 'startPhase', phase: N2 })
  s = play(s, act('butcher_kill', 5, 2))
  expect(out(s)).toMatchObject({ deaths: [{ seat: 2, cause: 'slain' }], notes: [] })
  s = play(s, confirm(2))
  expect(st(s).players[1]).toMatchObject({ status: 'out', cause: 'slain', vest: 'used' }); expect(st(s).morning).toMatchObject({ deaths: [2], spared: [] })
})
test('доктор вылечил или охранник закрыл собой — жилет цел', () => {
  const healed = play(night1(), act('mafia_shot', null, 2), act('doctor_heal', 4, 2))
  expect(out(healed)).toMatchObject({ deaths: [], notes: [{ seat: 2, kind: 'healed', cause: 'shot' }] })
  expect(vest(play(healed, confirm()))).toBe('intact')
  const guarded = play(night1(), act('mafia_shot', null, 2), act('bodyguard_guard', 6, 2))
  expect(out(guarded)).toMatchObject({ deaths: [{ seat: 6, cause: 'guard', guarded: 2 }], notes: [] })
  expect(vest(play(guarded, confirm(6)))).toBe('intact')
  // Охранник заблокирован — удар принимает жилет.
  expect(out(play(guarded, act('prostitute_block', 10, 6))).notes).toEqual([{ seat: 2, kind: 'vest', cause: 'shot' }])
})
test('изгнание голосованием с целым жилетом: остаётся в игре, жилет снят, прощания нет, запись в журнале', () => {
  const d2 = toDay(game(TABLE), 2)
  const s = play(d2, { type: 'nominate', by: 5, target: 2 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })
  expect(st(s).players[1]).toMatchObject({ status: 'alive', vest: 'used' })
  expect(st(s).day).toMatchObject({ spared: [2], farewell: { done: [], waiting: [] } })
  expect(texts(s, 'day')).toContain('№2 был в бронежилете — остаётся'); expect(texts(s, 'day', 'uk')).toContain('№2 був у бронежилеті — залишається')
  expect(summaryBody('ru', journal(s, DEFAULT_REGISTRY)[0]!, DEFAULT_REGISTRY)).toBe('выставлены 2 → жилет спас №2')
  // Повторное подтверждение исхода жилет второй раз не «тратит» и не убивает: прежний исход заменяется целиком.
  const again = play(s, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })
  expect(st(again).players[1]).toMatchObject({ status: 'alive', vest: 'used' }); expect(again.log.filter((e) => e.type === 'vest_set')).toHaveLength(1)
  // Исход изменён на «никто не выгнан» или запись исхода удалена — жилет возвращается.
  expect(vest(play(s, { type: 'resolveVote', ballot: 1, outcome: 'nobody', seats: [] }))).toBe('intact')
  expect(vest(play(s, { type: 'removeEvent', id: s.log.find((e) => e.type === 'vote_resolved')!.id }))).toBe('intact')
  expect(vest(undo(s))).toBe('intact')
})
test('второе изгнание — настоящее; из двоих выгнанных жилет спасает только своего', () => {
  let s = play(toDay(game(TABLE), 2), { type: 'nominate', by: 5, target: 2 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })
  s = toDay(play(s, { type: 'startPhase', phase: N2 }), 3)
  s = play(s, { type: 'nominate', by: 5, target: 2 }, { type: 'nominate', by: 7, target: 9 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })
  expect(st(s).players[1]).toMatchObject({ status: 'out', cause: 'voted' }); expect(st(s).day).toMatchObject({ spared: [], farewell: { waiting: [2] } })
  const two = play(toDay(game(TABLE), 2), { type: 'nominate', by: 5, target: 2 }, { type: 'nominate', by: 7, target: 9 },
    { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2, 9] })
  expect(st(two).players[1]!.status).toBe('alive'); expect(st(two).players[8]).toMatchObject({ status: 'out', cause: 'voted' })
  expect(st(two).day).toMatchObject({ spared: [2], farewell: { waiting: [9] } })
})
test('жилет, снятый голосованием, ночью уже не спасает; снятый ночью — не спасает от изгнания', () => {
  let s = play(toDay(game(TABLE), 2), { type: 'nominate', by: 5, target: 2 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] },
    { type: 'startPhase', phase: N2 }, act('mafia_shot', null, 2))
  expect(out(s)).toMatchObject({ deaths: [{ seat: 2, cause: 'shot' }], notes: [] })
  s = play(night1(), act('mafia_shot', null, 2), confirm(), { type: 'announceMorning' }, { type: 'nominate', by: 5, target: 2 },
    { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })
  expect(st(s).players[1]).toMatchObject({ status: 'out', cause: 'voted' }); expect(st(s).day!.spared).toEqual([])
})
test('ручное снятие и возврат жилета: событие журнала, отменяется; у роли без жилета команда отклоняется', () => {
  const d2 = toDay(game(TABLE), 2)
  const off = play(d2, { type: 'setVest', seat: 2, used: true })
  expect(vest(off)).toBe('used'); expect(texts(off, 'day')).toEqual(['С №2 снят жилет'])
  expect(journal(off, DEFAULT_REGISTRY)[0]!.entries[0]).toMatchObject({ kind: 'vest', seat: 2, used: true, manual: true })
  expect(attempt(off, { type: 'setVest', seat: 2, used: true })).toEqual({ ok: true, patch: { add: [], replace: [], remove: [] } })
  // Жилет снят вручную — изгнание настоящее.
  expect(st(play(off, { type: 'nominate', by: 5, target: 2 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })).players[1]!.status).toBe('out')
  const on = play(off, { type: 'setVest', seat: 2, used: false })
  expect(vest(on)).toBe('intact'); expect(texts(on, 'day')).toEqual(['С №2 снят жилет', '№2 возвращён жилет'])
  expect(vest(undo(on))).toBe('used'); expect(vest(undo(undo(on)))).toBe('intact')
  // Возвращённый жилет снова спасает ночью.
  expect(out(play(on, { type: 'startPhase', phase: N2 }, act('mafia_shot', null, 2))).notes).toEqual([{ seat: 2, kind: 'vest', cause: 'shot' }])
  expect(attempt(d2, { type: 'setVest', seat: 7, used: true })).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(attempt(d2, { type: 'setVest', seat: 99, used: true })).toEqual({ ok: false, reason: 'not_alive' })
})
test('жилет, снятый вручную посреди ночи, этой же ночью уже не спасает', () => {
  const s = play(night1(), act('mafia_shot', null, 2), { type: 'setVest', seat: 2, used: true })
  expect(out(s)).toMatchObject({ deaths: [{ seat: 2, cause: 'shot' }], notes: [] })
})
test('правка прошлой ночи не снимает и не возвращает жилет молча: только «Исправить»', () => {
  // Ночью мафия стреляла в мирного №7 — он выбыл. Утром ведущий правит запись: стреляли в №2 (жилет).
  let s = play(night1(), act('mafia_shot', null, 7), confirm(7), { type: 'announceMorning' })
  s = play(s, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 2, phase: N1 })
  expect(vest(s)).toBe('intact'); expect(st(s).players[6]!.status).toBe('out')
  expect(st(s).warnings).toEqual([{ code: 'night_outcome_changed', night: 1, expected: [] }])
  const kept = play(s, { type: 'acknowledgeNight', night: 1, apply: false })
  expect(vest(kept)).toBe('intact'); expect(st(kept).players[6]!.status).toBe('out'); expect(st(kept).warnings).toEqual([])
  const fixed = play(s, { type: 'acknowledgeNight', night: 1, apply: true })
  expect(vest(fixed)).toBe('used'); expect(st(fixed).players[6]!.status).toBe('alive'); expect(st(fixed).warnings).toEqual([])
  expect(st(fixed).morning).toMatchObject({ deaths: [], spared: [2] })
  // И обратно: жилет принял выстрел, запись исправили на №7 — жилет остаётся снятым, пока ведущий не нажмёт «Исправить».
  let back = play(night1(), act('mafia_shot', null, 2), confirm(), { type: 'announceMorning' })
  back = play(back, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7, phase: N1 })
  expect(vest(back)).toBe('used'); expect(st(back).warnings).toEqual([{ code: 'night_outcome_changed', night: 1, expected: [7] }])
  expect(vest(play(back, { type: 'acknowledgeNight', night: 1, apply: false }))).toBe('used')
  const reverted = play(back, { type: 'acknowledgeNight', night: 1, apply: true })
  expect(vest(reverted)).toBe('intact'); expect(st(reverted).players[6]).toMatchObject({ status: 'out', cause: 'shot' })
})
test('подтверждённая ночь пересчитывается с жилетом, каким он был той ночью: предупреждения «итог изменился» нет', () => {
  // Ночь 1: жилет принял выстрел. Ночь 2: настоящая смерть. Обе подсказки после подтверждения прежние.
  let s = play(night1(), act('mafia_shot', null, 2), confirm(), { type: 'announceMorning' }, { type: 'startPhase', phase: N2 })
  s = play(s, act('mafia_shot', null, 2), confirm(2))
  expect(st(s).warnings).toEqual([])
  // Ведущий вернул жилет вручную на следующий день: прошлые ночи это не переписывает.
  const restored = play(s, { type: 'announceMorning' }, { type: 'setStatus', seat: 2, status: 'alive' }, { type: 'setVest', seat: 2, used: false })
  expect(st(restored).warnings).toEqual([]); expect(vest(restored)).toBe('intact')
})
test('игра без бронежилета и записи без жилета читаются как раньше', () => {
  const s = play(toDay(game('S c G D c c c M c P c', { rules: DEFAULT_RULES }), 2), { type: 'nominate', by: 5, target: 7 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [7] })
  expect(st(s).players[6]).toMatchObject({ status: 'out', cause: 'voted' }); expect(st(s).day).toMatchObject({ spared: [], farewell: { waiting: [7] } })
})
