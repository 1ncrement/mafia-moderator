import { DEFAULT_REGISTRY, nightState } from '../../src/engine'
import type { GameEvent, Session, SessionConfig } from '../../src/engine'
import { act, game, n1, play, st, toDay } from '../helpers'

// Находки независимого ревью трёх этапов (2026-11-21), движок.

const N1 = { kind: 'night', n: 1 } as const

test('«жертва не голосует»: подтверждённый тур не пересчитывается, когда жертва выбывает', () => {
  // №1 шериф, №2 маньяк, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка. Маньяк приходил к №7.
  const config: Partial<SessionConfig> = { roleOptions: { maniac_no_vote: true } }
  let s = play(toDay(game('S maniac G D c c c M c P c', config), 1), { type: 'startPhase', phase: N1 }, act('maniac_visit', 2, 7),
    { type: 'confirmNight', died: [] }, { type: 'announceMorning' })
  s = play(s, { type: 'nominate', by: 1, target: 7 }, { type: 'nominate', by: 3, target: 9 }, { type: 'setVotes', ballot: 1, candidate: 7, count: 6 })
  const before = st(s).day!.ballots[0]!
  expect(before).toMatchObject({ voters: 10, hint: { outcome: 'eliminated', seats: [7] } }); expect(before.entries.map((e) => e.count)).toEqual([6, 4])
  // Жертву выгнали: голосовали по-прежнему десять, у второго кандидата по-прежнему четыре голоса.
  s = play(s, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [7] })
  const after = st(s).day!.ballots[0]!
  expect(after).toMatchObject({ voters: 10, resolved: { outcome: 'eliminated', seats: [7] }, hint: { outcome: 'eliminated', seats: [7] } })
  expect(after.entries.map((e) => e.count)).toEqual([6, 4])
  // И на следующий день запись прошлого голосования та же.
  const later = play(s, { type: 'startPhase', phase: { kind: 'night', n: 2 } }, { type: 'confirmNight', died: [] })
  expect(st(later).warnings).toEqual([])
})
test('старое сохранение: выстрел в игрока, которого ведущий той же ночью отметил выбывшим вручную, — итог читается как раньше', () => {
  // Так подтверждалась ночь до этапа 3: подсказка называла уже выбывшего, отметка итога хранит его же.
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'setStatus', seat: 7, status: 'out', cause: 'shot' }, { type: 'confirmNight', died: [7] })
  s = { ...s, log: s.log.map((e) => (e.type === 'night_confirmed' ? { ...e, hinted: [7], chosen: [7] } as GameEvent : e)) }
  expect(nightState(s, DEFAULT_REGISTRY, 1).outcome.deaths).toEqual([{ seat: 7, cause: 'shot' }])
  expect(st(s).warnings).toEqual([])
})
test('цель проверки выбыла вручную посреди ночи — ответ шерифу и главе мафии остаётся', () => {
  const s = play(n1(), act('sheriff_check', 1, 8), act('godfather_search', 3, 1), { type: 'setStatus', seat: 8, status: 'out', cause: 'shot' },
    { type: 'setStatus', seat: 1, status: 'out', cause: 'shot' }, { type: 'setStatus', seat: 1, status: 'alive' })
  const step = (id: string) => st(s).night!.steps.find((x) => x.id === id)!
  expect(step('sheriff_check:1').answer).toEqual({ kind: 'side', side: 'black' }); expect(step('godfather_search:3').answer).toEqual({ kind: 'found', found: true })
})
test('игра, сохранённая до обновления и открытая посреди дня: утро считается объявленным, окно само не открывается', () => {
  const day2 = (s: Session) => play(s, act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] })
  // Сразу после подтверждения ночи события «объявил» нет и день ещё не начат — утро не объявлено.
  expect(st(day2(n1())).morning).toMatchObject({ deaths: [7], announced: false })
  // В старом журнале события «объявил» нет вовсе, а день уже идёт: выставление, речь, голоса.
  const old = play(day2(n1()), { type: 'nominate', by: 5, target: 9 })
  expect(old.log.some((e) => e.type === 'morning_announced')).toBe(false)
  expect(st(old).morning).toMatchObject({ deaths: [7], announced: true })
  expect(st(play(day2(n1()), { type: 'enterStep', step: 'speeches' })).morning!.announced).toBe(true)
})
