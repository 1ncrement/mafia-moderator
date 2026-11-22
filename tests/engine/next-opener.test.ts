import { entryText } from '../../src/app/i18n'
import { DEFAULT_REGISTRY, journal, nextOpener } from '../../src/engine'
import type { Session } from '../../src/engine'
import { attempt, game, play, st, TABLE_11 } from '../helpers'

// Заказчик: начинающий круг со второго дня выбирается сам — следующий по кругу после того, кто закрывал прошлый день.
// В День 1 круг закрывают первые двое, поэтому День 2 начинает следующий за вторым из них; дальше — следующий за вчерашним начинавшим.

const D = (n: number) => ({ kind: 'day', n }) as const
const N = (n: number) => ({ kind: 'night', n }) as const
const day1 = (first: number): Session => play(game(TABLE_11), { type: 'startPhase', phase: D(1) }, { type: 'openCircle', first, random: true })
/** Ночь без записей и начало Дня n так, как его начинает кнопка итога ночи. */
const nextDay = (s: Session, n: number, ...died: number[]): Session =>
  play(s, { type: 'startPhase', phase: N(n - 1) }, { type: 'confirmNight', died }, { type: 'openNextCircle' })
const opener = (s: Session) => st(s).day!.opener

test('День 1 начал №3, закрывали №3 и №4 — День 2 начинает №5, День 3 — №6, День 4 — №7', () => {
  const d2 = nextDay(day1(3), 2)
  expect(opener(d2)).toBe(5)
  expect(st(d2).day).toMatchObject({ openerQueued: true, openerRandom: false })
  const d3 = nextDay(d2, 3)
  expect(opener(d3)).toBe(6)
  expect(opener(nextDay(d3, 4))).toBe(7)
})

test('выбывший пропускается; после последнего номера очередь переходит к первому', () => {
  expect(opener(nextDay(day1(3), 2, 5))).toBe(6)            // №5 выбыл ночью
  expect(opener(nextDay(day1(3), 2, 5, 6))).toBe(7)
  expect(opener(nextDay(day1(10), 2))).toBe(1)              // закрывали №10 и №11
  expect(opener(nextDay(day1(11), 2))).toBe(2)              // закрывали №11 и №1
  const d3 = nextDay(nextDay(day1(3), 2), 3, 6)             // на третий день очередь №6, но он выбыл
  expect(opener(d3)).toBe(7)
})

test('в День 1 второй из первых двоих выбыл — круг закрывал следующий за ним, очередь идёт от него', () => {
  const s = play(day1(3), { type: 'setStatus', seat: 4, status: 'out', cause: 'voted' })
  expect(opener(nextDay(s, 2))).toBe(6)                     // закрывали №3 и №5
})

test('ведущий выбрал другого — запись «по очереди» заменена, а завтра очередь идёт от его выбора', () => {
  const d2 = play(nextDay(day1(3), 2), { type: 'openCircle', first: 9 })
  expect(st(d2).day).toMatchObject({ opener: 9, openerQueued: false })
  const circles = journal(d2, DEFAULT_REGISTRY)[0]!.entries.filter((e) => e.kind === 'circle')
  expect(circles).toHaveLength(1)
  expect(opener(nextDay(d2, 3))).toBe(10)
})

test('openNextCircle ничего не делает в День 1, при уже открытом круге и когда вчера круг не открывали', () => {
  const empty = { add: [], replace: [], remove: [] }
  expect(attempt(day1(3), { type: 'openNextCircle' })).toEqual({ ok: true, patch: empty })
  expect(attempt(nextDay(day1(3), 2), { type: 'openNextCircle' })).toEqual({ ok: true, patch: empty })
  const silentDay1 = play(game(TABLE_11), { type: 'startPhase', phase: D(1) })
  expect(opener(nextDay(silentDay1, 2))).toBeNull()
  expect(nextOpener(nextDay(day1(3), 2), DEFAULT_REGISTRY, 2)).toBe(5)
  expect(nextOpener(day1(3), DEFAULT_REGISTRY, 1)).toBeNull()
})

test('в журнале начинающий по очереди помечен', () => {
  const entry = journal(nextDay(day1(3), 2), DEFAULT_REGISTRY)[0]!.entries.find((e) => e.kind === 'circle')!
  expect(entry).toMatchObject({ kind: 'circle', first: 5, queued: true })
  expect(entryText('ru', entry, DEFAULT_REGISTRY)).toBe('Круг начал №5 (по очереди)')
  expect(entryText('uk', entry, DEFAULT_REGISTRY)).toBe('Коло почав №5 (за чергою)')
})

test('выбранный по очереди выбыл до начала круга (ведущий поправил статус) — круг начинает следующий, а завтра очередь идёт от него', () => {
  // День 2 по очереди начинает №5; ведущий уже днём отмечает, что №5 выбыл. Круг открывает №6.
  const d2 = play(nextDay(day1(3), 2), { type: 'setStatus', seat: 5, status: 'out', cause: 'shot' })
  expect(st(d2).day).toMatchObject({ opener: 6, openerQueued: true })
  expect(st(d2).day!.waiting[0]).toBe(6)
  const spoke = play(d2, { type: 'startSpeech', kind: 'speech', seat: 6 }, { type: 'endSpeech' })
  // День 3 начинает №7, а не снова №6.
  expect(opener(nextDay(spoke, 3))).toBe(7)
  expect(st(nextDay(spoke, 3)).day!.previousOpener).toBe(6)
})

test('начинавший круг выбыл позже, уже сказав своё, — он остаётся начинавшим: завтра очередь идёт от него', () => {
  const d2 = play(nextDay(day1(3), 2), { type: 'startSpeech', kind: 'speech', seat: 5 }, { type: 'endSpeech' },
    { type: 'setStatus', seat: 5, status: 'out', cause: 'voted' })
  expect(st(d2).day!.opener).toBe(5)
  expect(opener(nextDay(d2, 3))).toBe(6)
})

test('следующий по очереди был отмечен выбывшим по ошибке и возвращён до начала круга — очередь снова его', () => {
  // Итог ночи подтвердили с №5; День 2 по очереди достался №6. Ведущий поправил: №5 в игре. Круг начинает №5.
  const d2 = play(nextDay(day1(3), 2, 5), { type: 'setStatus', seat: 5, status: 'alive' })
  expect(st(d2).day).toMatchObject({ opener: 5, openerQueued: true })
  expect(st(d2).day!.waiting[0]).toBe(5)
  const spoke = play(d2, { type: 'startSpeech', kind: 'speech', seat: 5 }, { type: 'endSpeech' })
  expect(opener(nextDay(spoke, 3))).toBe(6)
})

test('в День 1 закрывавший круг выбыл уже после своей доп. речи — он остаётся закрывавшим: День 2 начинает следующий за ним', () => {
  let s = day1(3)
  for (const seat of [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]) s = play(s, { type: 'startSpeech', kind: 'speech', seat }, { type: 'endSpeech' })
  expect(st(s).day!.closing.waiting).toEqual([3, 4])
  s = play(s, { type: 'startSpeech', kind: 'closing', seat: 3 }, { type: 'endSpeech' }, { type: 'startSpeech', kind: 'closing', seat: 4 }, { type: 'endSpeech' },
    { type: 'setStatus', seat: 4, status: 'out', cause: 'voted' })
  expect(opener(nextDay(s, 2))).toBe(5)
})

test('журнал называет того, кто на деле начал круг по очереди, даже если статусы поправили после начала дня', () => {
  const d2 = play(nextDay(day1(3), 2), { type: 'setStatus', seat: 5, status: 'out', cause: 'shot' })
  const entries = journal(d2, DEFAULT_REGISTRY).find((g) => g.phase.kind === 'day' && g.phase.n === 2)!.entries
  expect(entries.filter((e) => e.kind === 'circle')).toMatchObject([{ kind: 'circle', first: 6, queued: true }])
})
