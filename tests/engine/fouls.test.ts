import { entryText } from '../../src/app/i18n'
import { DEFAULT_REGISTRY, journal } from '../../src/engine'
import type { Command, Session } from '../../src/engine'
import { attempt, game, play, st, TABLE_11, toDay } from '../helpers'

// Заказчик: фолы за перебивание и речь не в свою очередь. Считаются за игру; три фола — игрок один день не говорит,
// может только выставить. Наказание ведущий применяет или отменяет в окне подтверждения, фолы считаются всегда.

const D = (n: number) => ({ kind: 'day', n }) as const
const N = (n: number) => ({ kind: 'night', n }) as const
const foul = (seat: number): Command => ({ type: 'giveFoul', seat })
const fouls = (s: Session, seat: number, times: number): Session => play(s, ...Array.from({ length: times }, () => foul(seat)))
const speech = (seat: number): Command[] => [{ type: 'startSpeech', kind: 'speech', seat }, { type: 'endSpeech' }]
/** День 2, круг открыт с №3, утро объявлено. */
const day2 = (): Session => play(toDay(game(TABLE_11), 2), { type: 'openCircle', first: 3 })
const count = (s: Session, seat: number) => st(s).fouls.counts[seat - 1]

test('фолы считаются за игру: день, ночь, следующий день — счёт не сбрасывается', () => {
  let s = fouls(toDay(game(TABLE_11), 1), 5, 1)
  expect(count(s, 5)).toBe(1)
  s = play(s, { type: 'startPhase', phase: N(1) }, foul(5))
  expect(count(s, 5)).toBe(2)
  s = play(s, { type: 'confirmNight', died: [] }, { type: 'announceMorning' }, foul(7))
  expect(st(s).fouls.counts).toEqual([0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 0])
  expect(st(s).fouls.pending).toEqual([])
})

test('фол даётся только игроку в игре и только после раздачи', () => {
  expect(attempt(game(TABLE_11), foul(5))).toEqual({ ok: false, reason: 'wrong_phase' })
  const s = play(day2(), { type: 'setStatus', seat: 5, status: 'out', cause: 'voted' })
  expect(attempt(s, foul(5))).toEqual({ ok: false, reason: 'not_alive' })
  expect(attempt(s, foul(12))).toEqual({ ok: false, reason: 'not_alive' })
})

test('третий фол: приложение ждёт решения ведущего; фол уже посчитан', () => {
  const s = fouls(day2(), 7, 3)
  expect(count(s, 7)).toBe(3)
  // №7 ещё ждёт слова в сегодняшнем круге — наказание придётся на сегодня.
  expect(st(s).fouls.pending).toEqual([{ seat: 7, level: 3, day: 2 }])
  expect(st(s).day).toMatchObject({ penalized: [], muted: [] })
})

test('наказание применено до своей очереди в круге — игрок не говорит сегодня', () => {
  const s = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: true })
  expect(st(s).fouls.pending).toEqual([])
  expect(st(s).fouls.penalties).toMatchObject([{ seat: 7, level: 3, applied: true, day: 2 }])
  expect(st(s).day).toMatchObject({ penalized: [7], muted: [7] })
  // Завтра он говорит как все.
  const d3 = toDay(s, 3)
  expect(st(d3).day).toMatchObject({ n: 3, penalized: [], muted: [] })
  expect(count(d3, 7)).toBe(3)
})

test('третий фол после своей речи, во время своей речи или ночью — игрок не говорит на следующий день', () => {
  const spoke = fouls(play(day2(), ...speech(3)), 3, 3)
  expect(st(spoke).fouls.pending).toEqual([{ seat: 3, level: 3, day: 3 }])
  const speaking = fouls(play(day2(), { type: 'startSpeech', kind: 'speech', seat: 3 }), 3, 3)
  expect(st(speaking).fouls.pending).toEqual([{ seat: 3, level: 3, day: 3 }])
  const night = fouls(play(day2(), { type: 'startPhase', phase: N(2) }), 9, 3)
  expect(st(night).fouls.pending).toEqual([{ seat: 9, level: 3, day: 3 }])

  const applied = play(spoke, { type: 'decideFoulPenalty', seat: 3, apply: true })
  expect(st(applied).day).toMatchObject({ penalized: [], muted: [] })
  const d3 = toDay(applied, 3)
  expect(st(d3).day).toMatchObject({ n: 3, penalized: [3], muted: [3] })
  expect(st(toDay(d3, 4)).day).toMatchObject({ penalized: [] })
})

test('ведущий наказание не применил — фолы остались, игрок говорит как все, второй раз приложение не спрашивает', () => {
  const s = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: false })
  expect(count(s, 7)).toBe(3)
  expect(st(s).fouls.pending).toEqual([])
  expect(st(s).fouls.penalties).toMatchObject([{ seat: 7, level: 3, applied: false }])
  expect(st(s).day).toMatchObject({ penalized: [], muted: [] })
  // Четвёртый и пятый фол нового вопроса не вызывают; шестой — следующий порог.
  const more = fouls(s, 7, 2)
  expect(st(more).fouls.pending).toEqual([])
  expect(st(fouls(more, 7, 1)).fouls.pending).toEqual([{ seat: 7, level: 6, day: 2 }])
})

test('решение можно изменить: отменить применённое наказание и применить отменённое', () => {
  const applied = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: true })
  const cancelled = play(applied, { type: 'decideFoulPenalty', seat: 7, apply: false })
  expect(st(cancelled).day!.muted).toEqual([])
  expect(st(cancelled).fouls.penalties).toHaveLength(1)
  const again = play(cancelled, { type: 'decideFoulPenalty', seat: 7, apply: true })
  expect(st(again).day!.muted).toEqual([7])
  // Решать нечего, пока порог не достигнут.
  expect(attempt(fouls(day2(), 7, 2), { type: 'decideFoulPenalty', seat: 7, apply: true })).toEqual({ ok: false, reason: 'target_not_allowed' })
})

test('снятый фол уменьшает счёт; счёт ушёл ниже порога — решение по нему снимается, и на третьем фоле приложение спросит снова', () => {
  const applied = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: true })
  const removed = play(applied, { type: 'removeFoul', seat: 7 })
  expect(count(removed, 7)).toBe(2)
  expect(st(removed).fouls.penalties).toEqual([])
  expect(st(removed).day!.muted).toEqual([])
  expect(st(fouls(removed, 7, 1)).fouls.pending).toEqual([{ seat: 7, level: 3, day: 2 }])
  // Снимать нечего — команда ничего не делает.
  expect(attempt(day2(), { type: 'removeFoul', seat: 7 })).toEqual({ ok: true, patch: { add: [], replace: [], remove: [] } })
})

test('отмена последнего действия снимает фол вместе с вопросом о наказании', () => {
  const s = fouls(day2(), 7, 3)
  const undone = { ...s, log: s.log.filter((e) => !s.undo.at(-1)!.added.includes(e.id)) }
  expect(count(undone, 7)).toBe(2)
  expect(st(undone).fouls.pending).toEqual([])
})

test('наказанный в свой ход может выставить: опции маньяка «жертва не выставляет» на него не действуют', () => {
  const s = play(fouls(day2(), 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true }, ...speech(3), { type: 'startSpeech', kind: 'silent', seat: 4 })
  expect(st(s).day).toMatchObject({ muted: [4], silenced: [], speaking: { kind: 'silent', seat: 4 } })
  expect(attempt(s, { type: 'nominate', by: 4, target: 9 }).ok).toBe(true)
  // Ход без речи двигает очередь круга дальше.
  expect(st(play(s, { type: 'endSpeech' })).day!.waiting[0]).toBe(5)
})

test('наказанный голосует: число голосующих по умолчанию не уменьшается', () => {
  const base = play(day2(), { type: 'nominate', by: null, target: 9 }, { type: 'nominate', by: null, target: 10 })
  const s = play(fouls(base, 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true })
  expect(st(s).day!.ballots[0]!.voters).toBe(st(base).day!.ballots[0]!.voters)
})

test('наказанный выбыл — в списке молчащих его нет; вернулся — снова есть', () => {
  const s = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: true }, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' })
  expect(st(s).day!.muted).toEqual([])
  expect(st(play(s, { type: 'setStatus', seat: 7, status: 'alive' })).day!.muted).toEqual([7])
})

test('День 1: наказанный за фолы до своей очереди не получает и доп. минуту', () => {
  let s = play(game(TABLE_11), { type: 'startPhase', phase: D(1) }, { type: 'openCircle', first: 3 })
  s = play(fouls(s, 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true })
  for (const seat of [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]) {
    s = play(s, { type: 'startSpeech', kind: seat === 4 ? 'silent' : 'speech', seat }, { type: 'endSpeech' })
  }
  expect(st(s).day!.closing.waiting).toEqual([3])
})

test('утро называет наказанных за фолы отдельно от жертв маньяка', () => {
  const s = play(fouls(play(day2(), { type: 'startPhase', phase: N(2) }), 9, 3), { type: 'decideFoulPenalty', seat: 9, apply: true },
    { type: 'confirmNight', died: [] })
  expect(st(s).morning).toMatchObject({ penalized: [9], silenced: [] })
})

test('журнал: фол с порядковым номером и решение о наказании', () => {
  const s = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: true })
  const entries = journal(s, DEFAULT_REGISTRY).find((g) => g.current)!.entries.filter((e) => e.kind === 'foul' || e.kind === 'foul_penalty')
  expect(entries.map((e) => entryText('ru', e, DEFAULT_REGISTRY))).toEqual([
    'Фол №7 · 1-й за игру', 'Фол №7 · 2-й за игру', 'Фол №7 · 3-й за игру', '№7: 3 фола — День 2 без речи',
  ])
  expect(entryText('uk', entries.at(-1)!, DEFAULT_REGISTRY)).toBe('№7: 3 фоли — День 2 без промови')
  const off = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: false })
  const last = journal(off, DEFAULT_REGISTRY).find((g) => g.current)!.entries.at(-1)!
  expect(entryText('ru', last, DEFAULT_REGISTRY)).toBe('№7: 3 фола — наказание не применено')
})

// Заказчик, 2026-11-22: «шесть фолов до отбытого наказания — один день без речи; наказания до исполнения не накапливаются,
// накапливаются фолы».

/** День 2: №3 уже говорил, набрал 3 фола, наказание применено — День 3 без речи, оно ещё не отбыто. */
const awaiting = (): Session => play(fouls(play(day2(), ...speech(3)), 3, 3), { type: 'decideFoulPenalty', seat: 3, apply: true })

test('шесть фолов до отбытого наказания: вопроса нет, наказание остаётся одно — один день без речи; фолы считаются', () => {
  const six = fouls(awaiting(), 3, 3)
  expect(count(six, 3)).toBe(6)
  expect(st(six).fouls.pending).toEqual([])
  expect(st(six).fouls.penalties).toMatchObject([{ seat: 3, level: 3, applied: true, day: 3 }])
  expect(st(six).fouls.penalties).toHaveLength(1)
  expect(st(six).fouls.upcoming).toMatchObject([{ seat: 3, level: 3, day: 3 }])
  expect(st(toDay(six, 3)).day!.muted).toEqual([3])
  expect(st(toDay(six, 4)).day!.muted).toEqual([])
  // Ночью перед днём наказания — то же самое.
  const night = fouls(play(awaiting(), { type: 'startPhase', phase: N(2) }), 3, 3)
  expect(st(night).fouls.pending).toEqual([])
})

test('наказание на сегодня, игрок ещё ждёт слова: шестой фол до своей очереди нового наказания не даёт', () => {
  const today = play(fouls(day2(), 7, 3), { type: 'decideFoulPenalty', seat: 7, apply: true })
  const six = fouls(today, 7, 3)
  expect(st(six).fouls.pending).toEqual([])
  expect(st(six).day!.muted).toEqual([7])
  expect(st(toDay(six, 3)).day!.muted).toEqual([])
})

test('пропущенный порог не возвращается: наказание отбыто — вопроса о шестом фоле нет, следующий порог — девятый', () => {
  let s = toDay(fouls(awaiting(), 3, 3), 3)
  s = play(s, { type: 'openCircle', first: 3 }, { type: 'startSpeech', kind: 'silent', seat: 3 }, { type: 'endSpeech' })
  expect(st(s).fouls.pending).toEqual([])
  expect(st(s).fouls.upcoming).toEqual([])
  expect(st(fouls(s, 3, 2)).fouls.pending).toEqual([])
  expect(st(fouls(s, 3, 3)).fouls.pending).toEqual([{ seat: 3, level: 9, day: 4 }])
  expect(st(toDay(s, 4)).fouls.pending).toEqual([])
})

test('наказание отбыто — следующий порог спрашивает снова: ход без речи прошёл, шестой фол даёт наказание на завтра', () => {
  let s = play(fouls(day2(), 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true }, ...speech(3))
  // Четвёртый и пятый фол — до своей очереди, шестой — уже после хода без речи.
  s = play(fouls(s, 4, 2), { type: 'startSpeech', kind: 'silent', seat: 4 }, { type: 'endSpeech' })
  expect(st(s).fouls.upcoming).toEqual([])
  const six = fouls(s, 4, 1)
  expect(st(six).fouls.pending).toEqual([{ seat: 4, level: 6, day: 3 }])
  const applied = play(six, { type: 'decideFoulPenalty', seat: 4, apply: true })
  expect(st(applied).fouls.penalties).toMatchObject([{ level: 3, day: 2 }, { level: 6, day: 3 }])
  expect(st(toDay(applied, 3)).day!.muted).toEqual([4])
  expect(st(toDay(applied, 4)).day!.muted).toEqual([])
})

test('первое наказание ведущий не применил — отбывать нечего, шестой фол спрашивает', () => {
  const declined = fouls(play(fouls(play(day2(), ...speech(3)), 3, 3), { type: 'decideFoulPenalty', seat: 3, apply: false }), 3, 3)
  expect(st(declined).fouls.pending).toEqual([{ seat: 3, level: 6, day: 3 }])
})

test('шесть фолов при неотбытом наказании: решение в панели игрока меняет само наказание, а вопрос о шестом фоле не всплывает', () => {
  const six = fouls(awaiting(), 3, 3)
  const cancelled = play(six, { type: 'decideFoulPenalty', seat: 3, apply: false })
  expect(st(cancelled).fouls.penalties).toMatchObject([{ seat: 3, level: 3, applied: false }])
  expect(st(cancelled).fouls.penalties).toHaveLength(1)
  expect(st(cancelled).fouls.pending).toEqual([])
  expect(st(toDay(cancelled, 3)).day!.muted).toEqual([])
  const again = play(cancelled, { type: 'decideFoulPenalty', seat: 3, apply: true })
  expect(st(again).fouls.penalties).toMatchObject([{ seat: 3, level: 3, applied: true, day: 3 }])
  expect(st(again).fouls.penalties).toHaveLength(1)
  expect(st(toDay(again, 3)).day!.muted).toEqual([3])
})

test('шестой фол при неотбытом наказании сняли и дали снова — вопроса по-прежнему нет; сняли до двух — решение снимается', () => {
  const six = fouls(awaiting(), 3, 3)
  const back = play(six, { type: 'removeFoul', seat: 3 }, foul(3))
  expect(count(back, 3)).toBe(6)
  expect(st(back).fouls.pending).toEqual([])
  const two = play(six, ...Array.from({ length: 4 }, (): Command => ({ type: 'removeFoul', seat: 3 })))
  expect(count(two, 3)).toBe(2)
  expect(st(two).fouls.penalties).toEqual([])
  expect(st(two).fouls.upcoming).toEqual([])
})

test('чужое неотбытое наказание порог не поглощает: третий фол другого игрока спрашивает как обычно', () => {
  const s = fouls(awaiting(), 7, 3)
  expect(st(s).fouls.pending).toEqual([{ seat: 7, level: 3, day: 2 }])
  expect(s.log.some((e) => e.type === 'foul_given' && e.seat === 7 && e.absorbed === true)).toBe(false)
})

/** День 2: №4 набрал 3 фола до своей очереди, наказание применено; №3 говорил, ход без речи №4 прошёл — наказание отбыто. */
const served = (): Session => play(fouls(day2(), 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true },
  ...speech(3), { type: 'startSpeech', kind: 'silent', seat: 4 }, { type: 'endSpeech' })

test('наказание отбыто, как только ход без речи начался: шестой фол во время этого хода уже спрашивает', () => {
  const during = play(fouls(play(fouls(day2(), 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true }, ...speech(3)), 4, 2),
    { type: 'startSpeech', kind: 'silent', seat: 4 }, foul(4))
  expect(st(during).fouls.pending).toEqual([{ seat: 4, level: 6, day: 3 }])
})

test('отбытое наказание окончательно: его нельзя ни отменить, ни применить заново — второго дня без речи одно решение не даёт', () => {
  const s = served()
  expect(st(s).fouls.upcoming).toEqual([])
  expect(attempt(s, { type: 'decideFoulPenalty', seat: 4, apply: false })).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(attempt(s, { type: 'decideFoulPenalty', seat: 4, apply: true })).toEqual({ ok: false, reason: 'target_not_allowed' })
  const d3 = toDay(s, 3)
  expect(attempt(d3, { type: 'decideFoulPenalty', seat: 4, apply: true })).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(st(d3).day!.muted).toEqual([])
  // То же при шести фолах, из которых шестой пришёлся на неотбытое наказание.
  let six = toDay(fouls(awaiting(), 3, 3), 3)
  six = play(six, { type: 'openCircle', first: 3 }, { type: 'startSpeech', kind: 'silent', seat: 3 }, { type: 'endSpeech' })
  expect(attempt(six, { type: 'decideFoulPenalty', seat: 3, apply: false })).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(st(toDay(six, 4)).day!.muted).toEqual([])
})

test('два решения у игрока: первое отбыто, второе впереди — решение ведущего относится ко второму', () => {
  const second = play(fouls(served(), 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: true })
  expect(st(second).fouls.penalties).toMatchObject([{ level: 3, applied: true, day: 2 }, { level: 6, applied: true, day: 3 }])
  expect(st(second).fouls.upcoming).toMatchObject([{ seat: 4, level: 6, day: 3 }])
  const cancelled = play(second, { type: 'decideFoulPenalty', seat: 4, apply: false })
  expect(st(cancelled).fouls.penalties).toMatchObject([{ level: 3, applied: true, day: 2 }, { level: 6, applied: false }])
  expect(st(cancelled).day!.muted).toEqual([4])
  expect(st(toDay(cancelled, 3)).day!.muted).toEqual([])
})

test('круг начат заново после хода без речи: наказание снова впереди — «отменить» снимает его, а не решение по шестому фолу', () => {
  // №4 отбыл наказание за три фола, получил ещё три, по шестому ведущий наказание не применил; затем круг начат заново.
  const again = play(fouls(served(), 4, 3), { type: 'decideFoulPenalty', seat: 4, apply: false }, { type: 'openCircle', first: 3 })
  expect(st(again).day!.muted).toEqual([4])
  expect(st(again).fouls.upcoming).toMatchObject([{ seat: 4, level: 3, day: 2 }])
  const cancelled = play(again, { type: 'decideFoulPenalty', seat: 4, apply: false })
  expect(st(cancelled).fouls.penalties).toMatchObject([{ level: 3, applied: false }, { level: 6, applied: false }])
  expect(st(cancelled).day!.muted).toEqual([])
})

test('журнал: шестой фол при неотбытом наказании записан с пометкой, что новое наказание не добавляется', () => {
  const entries = journal(fouls(awaiting(), 3, 3), DEFAULT_REGISTRY).find((g) => g.current)!.entries.filter((e) => e.kind === 'foul')
  expect(entries.slice(-2).map((e) => entryText('ru', e, DEFAULT_REGISTRY))).toEqual([
    'Фол №3 · 5-й за игру', 'Фол №3 · 6-й за игру · наказание уже назначено, новое не добавляется',
  ])
  expect(entryText('uk', entries.at(-1)!, DEFAULT_REGISTRY)).toBe('Фол №3 · 6-й за гру · покарання вже призначено, нове не додається')
})
