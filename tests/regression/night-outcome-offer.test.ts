import { DEFAULT_REGISTRY, nightState } from '../../src/engine'
import { act, n1, play, st } from '../helpers'

// Спецификация 6.6: «Правка прошлой записи не меняет статусы игроков молча. Если после правки итог
// расходится с отметкой, приложение предлагает…». Если после правки итог СОВПАДАЕТ с отметкой
// (со статусами, которые ведущий поставил при подтверждении), предлагать нечего.

const N1 = { kind: 'night', n: 1 } as const

test('ведущий подтвердил «Выбыл другой…» и утром исправил запись выстрела под факт — предложения нет', () => {
  // Ночью записали выстрел не в того (№7), на итоге ведущий выбрал настоящего выбывшего — №9.
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: 9 })
  expect(st(s).warnings).toEqual([])
  // Утром ведущий исправляет запись выстрела в журнале: мафия стреляла в №9.
  s = play(s, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 9, phase: N1 })
  expect(nightState(s, DEFAULT_REGISTRY, 1).outcome.dies).toBe(9)
  expect(st(s).players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: N1 })
  expect(st(s).players[6]!.status).toBe('alive')
  // Итог (№9) совпадает с отметкой (№9 застрелен, Ночь 1): расхождения нет.
  expect(st(s).warnings).toEqual([])
})

test('ведущий подтвердил «Никто не выбыл» и утром дописал забытое лечение — предложения нет', () => {
  // Записан только выстрел в №7; за столом доктор вылечил №7, ведущий нажал «Никто не выбыл».
  let s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', chosen: null })
  expect(st(s).warnings).toEqual([])
  // Утром дописывает строку «Доктор — не записано»: лечил №7.
  s = play(s, { type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 7, phase: N1 })
  expect(nightState(s, DEFAULT_REGISTRY, 1).outcome).toMatchObject({ dies: null, reason: 'healed' })
  expect(st(s).counts.alive).toBe(11)
  // Итог (никто не выбыл) совпадает с отметкой (никто не выбыл): расхождения нет.
  expect(st(s).warnings).toEqual([])
})
