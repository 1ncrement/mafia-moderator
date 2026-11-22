import { crossedWarning, crossedZero, newTimer, timerReduce, timerView } from '../../src/engine'

const t0 = 1_000_000
const run = () => timerReduce(newTimer('speech', 6, 60_000), { type: 'start' }, t0)
test('остаток считается от момента окончания', () => {
  expect(timerView(run(), t0 + 18_000)).toEqual({ remainingMs: 42_000, overrunMs: 0, expired: false, lastTen: false })
  expect(timerView(run(), t0 + 52_000).lastTen).toBe(true)
  expect(timerView(run(), t0 + 67_000)).toEqual({ remainingMs: 0, overrunMs: 7_000, expired: true, lastTen: false })
})
test('пауза и продолжение', () => {
  const paused = timerReduce(run(), { type: 'pause' }, t0 + 20_000)
  expect(timerView(paused, t0 + 500_000).remainingMs).toBe(40_000)
  expect(timerView(timerReduce(paused, { type: 'resume' }, t0 + 500_000), t0 + 510_000).remainingMs).toBe(30_000)
})
test('+10 секунд и сброс', () => {
  expect(timerView(timerReduce(run(), { type: 'add', ms: 10_000 }, t0 + 20_000), t0 + 20_000).remainingMs).toBe(50_000)
  expect(timerView(timerReduce(run(), { type: 'add', ms: 10_000 }, t0 + 90_000), t0 + 91_000)).toMatchObject({ remainingMs: 9_000, expired: false })
  expect(timerReduce(run(), { type: 'reset' }, t0 + 30_000)).toMatchObject({ status: 'ready', remainingMs: 60_000, endsAt: null })
})
test('ноутбук уснул на пять минут', () => {
  expect(timerView(run(), t0 + 300_000)).toMatchObject({ expired: true, overrunMs: 240_000 })
})
test('перезагрузка страницы: таймер продолжает идти по часам', () => {
  expect(timerView(JSON.parse(JSON.stringify(run())), t0 + 30_000).remainingMs).toBe(30_000)
})
test('сигнал только в момент пересечения нуля', () => {
  expect(crossedZero(run(), t0 + 59_800, t0 + 60_050)).toBe(true)
  expect(crossedZero(run(), t0 + 60_050, t0 + 60_300)).toBe(false)
  expect(crossedZero(run(), t0 + 300_000, t0 + 300_000)).toBe(false)
})

// Заказчик: звук, когда говорящему остаётся 10 секунд, — для всех таймеров.
test('предупреждение звучит в момент, когда остаётся 10 секунд, и только один раз', () => {
  expect(crossedWarning(run(), t0 + 49_800, t0 + 50_050)).toBe(true)
  expect(crossedWarning(run(), t0 + 50_050, t0 + 50_300)).toBe(false)
  expect(crossedWarning(run(), t0 + 10_000, t0 + 10_250)).toBe(false)
})
test('после сна, когда проскочили и отметку, и ноль, предупреждения нет — звучит только сигнал конца', () => {
  expect(crossedWarning(run(), t0 + 40_000, t0 + 70_000)).toBe(false)
  expect(crossedZero(run(), t0 + 40_000, t0 + 70_000)).toBe(true)
})
test('таймер на паузе и готовый таймер не предупреждают; после продолжения с остатком меньше 10 секунд — тоже', () => {
  expect(crossedWarning(newTimer('speech', 6, 60_000), t0, t0 + 55_000)).toBe(false)
  const paused = timerReduce(run(), { type: 'pause' }, t0 + 55_000)
  expect(crossedWarning(paused, t0 + 54_900, t0 + 56_000)).toBe(false)
  const resumed = timerReduce(paused, { type: 'resume' }, t0 + 90_000)
  expect(crossedWarning(resumed, t0 + 89_900, t0 + 90_100)).toBe(false)
})
test('добавили время, когда оставалось меньше 10 секунд, — отметка снова впереди, предупреждение повторится', () => {
  const more = timerReduce(run(), { type: 'add', ms: 10_000 }, t0 + 55_000)      // осталось 15 с
  expect(crossedWarning(more, t0 + 55_000, t0 + 55_250)).toBe(false)
  expect(crossedWarning(more, t0 + 59_900, t0 + 60_100)).toBe(true)
})
test('таймер не длиннее 10 секунд не предупреждает: он весь — последние секунды', () => {
  const short = timerReduce(newTimer('free', null, 10_000), { type: 'start' }, t0)
  expect(crossedWarning(short, t0 - 250, t0)).toBe(false)
  expect(crossedWarning(short, t0, t0 + 250)).toBe(false)
})
