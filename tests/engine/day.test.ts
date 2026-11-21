import { entryText } from '../../src/app/i18n'
import { circleOrder, DEFAULT_DURATIONS, DEFAULT_REGISTRY, DEFAULT_RULES, journal, speechSeconds } from '../../src/engine'
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

test('слово вне очереди не сбивает круг', () => {
  const s = play(d2(), { type: 'openCircle', first: 5 }, speak(5), speak(6), speak(2))
  expect(st(s).day!.waiting).toEqual([7, 8, 9, 10, 11, 1, 3, 4])
  expect(st(play(d2(), { type: 'openCircle', first: 5 }, speak(9))).day!.waiting).toEqual([5, 6, 7, 8, 10, 11, 1, 2, 3, 4])
})

// ── Правила партии ──────────────────────────────────────────────────────────

const d2With = (rules: Partial<typeof DEFAULT_RULES>) => toDay(game(TABLE_11, { rules: { ...DEFAULT_RULES, ...rules } }), 2)
const expel7: Command[] = [{ type: 'nominate', by: 5, target: 7 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [7] }]

test('балаган выключен — день открывается кругом речей в любой день; включён — балаганом со второго дня', () => {
  expect(st(d2With({ balagan: false })).step).toBe('speeches')
  expect(st(toDay(d2With({ balagan: false }), 3)).step).toBe('speeches')
  expect(st(d2With({})).step).toBe('balagan')
  expect(st(toDay(game(TABLE_11), 1)).step).toBe('speeches')
})
test('прощание после голосования выключено — выгнанный выбывает так же, очереди прощания нет', () => {
  const off = play(d2With({ farewellAfterVote: false }), ...expel7)
  expect(st(off).players[6]).toMatchObject({ status: 'out', cause: 'voted' })
  expect(st(off).day!.farewell).toEqual({ done: [], waiting: [] })
  expect(st(play(d2(), ...expel7)).day!.farewell).toEqual({ done: [], waiting: [7] })
})

// ── Первый круг: случайный начинающий и доп. речь первых двоих ──────────────

const d1 = () => play(game(TABLE_11), { type: 'startPhase', phase: { kind: 'day', n: 1 } })
const closing = (seat: number): Command => ({ type: 'startSpeech', kind: 'closing', seat })
const FROM_5 = [5, 6, 7, 8, 9, 10, 11, 1, 2, 3, 4]
/** Круг с №5, все высказались, последний ещё говорит. */
const fullCircle = (s = d1()) => play(s, { type: 'openCircle', first: 5 }, ...FROM_5.map(speak))
const circles = (s: ReturnType<typeof d1>) => journal(s, DEFAULT_REGISTRY)[0]!.entries.filter((e) => e.kind === 'circle')

test('доп. речи в День 1 появляются, когда высказались все: начинавший и следующий за ним', () => {
  const almost = play(d1(), { type: 'openCircle', first: 5 }, ...FROM_5.slice(0, -1).map(speak))
  expect(st(almost).day).toMatchObject({ waiting: [4], closing: { done: [], waiting: [] } })
  let s = fullCircle()
  expect(st(s).day).toMatchObject({ waiting: [], closing: { done: [], waiting: [5, 6] } })
  s = play(s, closing(5))
  expect(st(s).day).toMatchObject({ speaking: { kind: 'closing', seat: 5 }, closing: { done: [], waiting: [6] } })
  // Доп. речь — не речь круга: «говорили» и очередь круга она не меняет.
  expect(st(s).day!.spoken).toEqual(FROM_5)
  s = play(s, closing(6))
  expect(st(s).day).toMatchObject({ speaking: { kind: 'closing', seat: 6 }, closing: { done: [5], waiting: [] } })
  expect(st(play(s, { type: 'endSpeech' })).day).toMatchObject({ speaking: null, closing: { done: [5, 6], waiting: [] } })
})
test('выбывший из первых двоих пропускается: доп. речь получает следующий по кругу игрок в игре', () => {
  const out = (seat: number): Command => ({ type: 'setStatus', seat, status: 'out', cause: 'shot' })
  expect(st(play(fullCircle(), out(6))).day!.closing.waiting).toEqual([5, 7])
  expect(st(play(fullCircle(), out(5))).day!.closing.waiting).toEqual([6, 7])
  // Выбыл посреди своей доп. речи — слово снимается, очередь идёт дальше.
  const mid = play(fullCircle(), closing(5), out(5))
  expect(st(mid).day).toMatchObject({ speaking: null, closing: { done: [], waiting: [6, 7] } })
  // За столом один — доп. речь одна.
  const alone = play(game('G c c c'), { type: 'startPhase', phase: { kind: 'day', n: 1 } }, out(2), out(3), out(4), { type: 'openCircle', first: 1 }, speak(1))
  expect(st(alone).day!.closing.waiting).toEqual([1])
})
test('доп. речей нет со второго дня и пока круг не начат', () => {
  const second = play(d2(), { type: 'enterStep', step: 'speeches' }, { type: 'openCircle', first: 5 }, ...FROM_5.map(speak))
  expect(st(second).day).toMatchObject({ waiting: [], closing: { done: [], waiting: [] } })
  expect(st(d1()).day!.closing).toEqual({ done: [], waiting: [] })
})
test('возвращённый в игру сначала говорит в круге, потом продолжаются доп. речи; круг заново — доп. речи заново', () => {
  let s = play(d1(), { type: 'setStatus', seat: 9, status: 'out', cause: 'shot' }, { type: 'openCircle', first: 5 }, ...FROM_5.filter((x) => x !== 9).map(speak), closing(5))
  s = play(s, { type: 'setStatus', seat: 9, status: 'alive' })
  expect(st(s).day).toMatchObject({ waiting: [9], closing: { done: [], waiting: [] } })
  s = play(s, speak(9))
  expect(st(s).day).toMatchObject({ waiting: [], closing: { done: [5], waiting: [6] } })
  s = play(s, { type: 'openCircle', first: 7 })
  expect(st(s).day!.closing).toEqual({ done: [], waiting: [] })
  s = play(s, ...[7, 8, 9, 10, 11, 1, 2, 3, 4, 5, 6].map(speak))
  expect(st(s).day!.closing).toEqual({ done: [], waiting: [7, 8] })
})
test('доп. речь длится как обычная речь', () => {
  expect(speechSeconds({ ...DEFAULT_DURATIONS, speech: 75 }, 'closing')).toBe(75)
  expect(speechSeconds(DEFAULT_DURATIONS, 'defense')).toBe(30)
})
test('случайный начинающий: пометка в состоянии дня и запись журнала «Круг начал №5 (случайно)»', () => {
  const s = play(d1(), { type: 'openCircle', first: 5, random: true })
  expect(st(s).day).toMatchObject({ opener: 5, openerRandom: true })
  expect(circles(s)).toMatchObject([{ first: 5, random: true }])
  expect(entryText('ru', circles(s)[0]!, DEFAULT_REGISTRY)).toBe('Круг начал №5 (случайно)')
  expect(entryText('uk', circles(s)[0]!, DEFAULT_REGISTRY)).toBe('Коло почав №5 (випадково)')
  const chosen = play(d1(), { type: 'openCircle', first: 5 })
  expect(st(chosen).day!.openerRandom).toBe(false)
  expect(entryText('ru', circles(chosen)[0]!, DEFAULT_REGISTRY)).toBe('Круг начал №5')
})
test('ведущий выбрал другого до первой речи — запись «случайно» снимается; после речи это уже новый круг', () => {
  const replaced = play(d1(), { type: 'openCircle', first: 5, random: true }, { type: 'openCircle', first: 3 })
  expect(st(replaced).day).toMatchObject({ opener: 3, openerRandom: false })
  expect(circles(replaced)).toHaveLength(1); expect(circles(replaced)[0]).not.toHaveProperty('random')
  expect(replaced.log.filter((e) => e.type === 'circle_opened')).toHaveLength(1)
  const restarted = play(d1(), { type: 'openCircle', first: 5, random: true }, speak(5), { type: 'openCircle', first: 3 })
  expect(circles(restarted).map((e) => e.kind === 'circle' && [e.first, e.random === true])).toEqual([[5, true], [3, false]])
})
