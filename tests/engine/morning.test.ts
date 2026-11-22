import { applyUndo, DEFAULT_REGISTRY, journal } from '../../src/engine'
import type { Session } from '../../src/engine'
import { act, attempt, game, n1, play, st, TABLE_11 } from '../helpers'

// Утреннее объявление: что сказать столу в начале дня. Выводится из статусов после прошлой ночи;
// факт «объявил» — событие журнала, поэтому перезагрузка окно не возвращает, а отмена возвращает.

const N1 = { kind: 'night', n: 1 } as const
const morning = (s: Session) => st(s).morning
const QUIET = { deaths: [], farewell: [], spared: [], silenced: [], silence: { noNominate: false, noVote: false }, penalized: [], announced: false }

test('утра нет до Дня 2: распределение, День 1 и ночь', () => {
  const dealt = game(TABLE_11)
  expect(morning(dealt)).toBeNull()
  const day1 = play(dealt, { type: 'startPhase', phase: { kind: 'day', n: 1 } })
  expect(morning(day1)).toBeNull(); expect(attempt(day1, { type: 'announceMorning' })).toEqual({ ok: false, reason: 'wrong_phase' })
  expect(morning(n1())).toBeNull(); expect(attempt(n1(), { type: 'announceMorning' })).toEqual({ ok: false, reason: 'wrong_phase' })
})
test('утро называет всех, кто покинул стол прошлой ночью, по возрастанию номеров; после тихой ночи — никого', () => {
  expect(morning(play(n1(), { type: 'confirmNight', died: [] }))).toEqual(QUIET)
  expect(morning(play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] }))).toEqual({ ...QUIET, deaths: [7] })
  expect(morning(play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [9, 7, 3] }))).toEqual({ ...QUIET, deaths: [3, 7, 9] })
})
test('«объявил» — событие журнала: отмечает утро объявленным, второй раз не пишется, отменяется', () => {
  const day2 = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] })
  const told = play(day2, { type: 'announceMorning' })
  expect(morning(told)).toEqual({ ...QUIET, deaths: [7], announced: true })
  expect(told.log.at(-1)).toMatchObject({ type: 'morning_announced', phase: { kind: 'day', n: 2 } })
  // Повторная команда ничего не добавляет: окно, открытое снова, в журнал не пишет.
  expect(attempt(told, { type: 'announceMorning' })).toEqual({ ok: true, patch: { add: [], replace: [], remove: [] } })
  // Отмена возвращает необъявленное утро.
  expect(morning({ ...told, log: applyUndo(told.log, told.undo.at(-1)!) })).toMatchObject({ deaths: [7], announced: false })
  // В видимый журнал факт объявления не попадает.
  expect(journal(told, DEFAULT_REGISTRY)[0]!.entries).toEqual([])
})
test('каждое утро своё: объявление Дня 2 не закрывает утро Дня 3', () => {
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] }, { type: 'announceMorning' })
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 2 } }, act('mafia_shot', null, 5), { type: 'confirmNight', died: [5] })
  expect(st(s).phase).toEqual({ kind: 'day', n: 3 }); expect(morning(s)).toEqual({ ...QUIET, deaths: [5] })
})
test('утро следует за статусами: выбывший вручную ночью — в объявлении, возвращённый в игру — нет, выбывший днём — нет', () => {
  // Ночью ведущий вручную отметил №4 выбывшим, итог подтвердил с застреленным №7.
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'setStatus', seat: 4, status: 'out', cause: 'shot' }, { type: 'confirmNight', died: [7] })
  expect(morning(s)!.deaths).toEqual([4, 7])
  // Днём №7 вернули в игру, а №2 выгнали: утро называет только выбывших прошлой ночью, которые и сейчас вне игры.
  s = play(s, { type: 'setStatus', seat: 7, status: 'alive' }, { type: 'setStatus', seat: 2, status: 'out', cause: 'voted' })
  expect(morning(s)!.deaths).toEqual([4])
  // Правка итога прошлой ночи и запись статуса задним числом тоже меняют объявление.
  s = play(s, { type: 'setNightResult', night: 1, died: [9] }, { type: 'setStatus', seat: 11, status: 'out', cause: 'shot', phase: N1 })
  expect(morning(s)!.deaths).toEqual([4, 9, 11])
})
