import { entryText, summaryBody } from '../../src/app/i18n'
import { DEFAULT_REGISTRY, journal, nightState } from '../../src/engine'
import type { Command, Session, SessionConfig } from '../../src/engine'
import { act, attempt, game, play, st, toDay } from '../helpers'

// Журналист (дополнение 5.7). Стол: №1 шериф, №2 журналист, №3 крёстный отец, №4 доктор, №5 бронежилет, №6 мясник,
// №7 маньяк, №8 мафия, №9 мирный, №10 проститутка, №11 мирный.
const TABLE = 'S journalist G D bulletproof butcher maniac M c P c'
const R = DEFAULT_REGISTRY
const N = (n: number) => ({ kind: 'night', n }) as const
const ALTERNATE = { roleOptions: { journalist_pace: 'alternate' } }
const night1 = (config?: Partial<SessionConfig>, table = TABLE): Session => play(toDay(game(table, config), 1), { type: 'startPhase', phase: N(1) })
const step = (s: Session) => st(s).night!.steps.find((x) => x.actionId === 'journalist_compare')!
const compare = (a: number | null, b: number | null = null, actor = 2): Command => ({ type: 'recordNightAction', actionId: 'journalist_compare', actor, target: a, target2: b })
/** Подтвердить ночь без выбывших, объявить утро, начать следующую ночь. */
const nextNight = (s: Session): Session => {
  const day = play(s, { type: 'confirmNight', died: [] }, { type: 'announceMorning' })
  return play(day, { type: 'startPhase', phase: N((st(day).phase as { n: number }).n) })
}
const answer = (a: number, b: number) => step(play(night1(), compare(a, b))).answer

test('журналист просыпается после шерифа и перед доктором; шаг ждёт двоих', () => {
  expect(st(night1()).night!.steps.map((x) => x.actionId))
    .toEqual(['mafia_shot', 'godfather_search', 'prostitute_block', 'butcher_kill', 'maniac_visit', 'sheriff_check', 'journalist_compare', 'doctor_heal'])
  expect(step(night1())).toMatchObject({ id: 'journalist_compare:2', recorded: false, target: null, target2: null, used: [], resting: false })
})
test('сравнение по стороне роли: одна сторона или разные', () => {
  expect(answer(9, 11)).toEqual({ kind: 'same', same: true })       // мирный и мирный
  expect(answer(1, 4)).toEqual({ kind: 'same', same: true })        // шериф и доктор
  expect(answer(3, 8)).toEqual({ kind: 'same', same: true })        // крёстный отец и мафия
  expect(answer(10, 3)).toEqual({ kind: 'same', same: true })       // проститутка и крёстный отец — чёрные
  expect(answer(1, 3)).toEqual({ kind: 'same', same: false })       // шериф и крёстный отец
  expect(answer(9, 10)).toEqual({ kind: 'same', same: false })
  expect(step(play(night1(), compare(9, 11)))).toMatchObject({ recorded: true, target: 9, target2: 11 })
})
test('мясник и маньяк — каждый на своей стороне: с кем угодно, в том числе друг с другом, — разные', () => {
  for (const [a, b] of [[6, 9], [6, 3], [7, 9], [7, 8], [6, 7], [7, 6]] as const) expect(answer(a, b)).toEqual({ kind: 'same', same: false })
})
test('нельзя выбрать себя, одного игрока дважды и одного без второго; «Никого» записать можно', () => {
  expect(step(night1()).allowed).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  for (const cmd of [compare(2, 9), compare(9, 2), compare(9, 9), compare(9, null)]) expect(attempt(night1(), cmd)).toEqual({ ok: false, reason: 'target_not_allowed' })
  const nobody = play(night1(), compare(null))
  expect(step(nobody)).toMatchObject({ recorded: true, target: null, target2: null }); expect(step(nobody).answer).toBeUndefined()
  // Остальным ролям вторая цель не нужна и не записывается.
  const shot = play(night1(), { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 9, target2: 11 })
  expect(shot.log.at(-1)).not.toHaveProperty('target2')
})
test('каждого игрока — один раз за игру: уже проверенные недоступны', () => {
  const second = nextNight(play(night1(), compare(9, 11)))
  expect(step(second)).toMatchObject({ used: [9, 11], resting: false }); expect(step(second).allowed).toEqual([1, 3, 4, 5, 6, 7, 8, 10])
  expect(attempt(second, compare(9, 4))).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(attempt(second, compare(4, 11))).toEqual({ ok: false, reason: 'target_not_allowed' })
  const third = nextNight(play(second, compare(1, 3)))
  expect(step(third).used).toEqual([1, 3, 9, 11]); expect(step(third).allowed).toEqual([4, 5, 6, 7, 8, 10])
  // «Никого» проверкой не считается: никто не израсходован.
  expect(step(nextNight(play(night1(), compare(null)))).used).toEqual([])
})
test('игрока с открытой ролью (жилет снят) выбрать нельзя; пока жилет цел — можно', () => {
  expect(attempt(night1(), compare(5, 9)).ok).toBe(true)
  const open = play(night1(), { type: 'setVest', seat: 5, used: true })
  expect(step(open).allowed).toEqual([1, 3, 4, 6, 7, 8, 9, 10, 11])
  expect(attempt(open, compare(5, 9))).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(step(play(open, { type: 'setVest', seat: 5, used: false })).allowed).toContain(5)
})
test('«через ночь»: после состоявшейся проверки следующую ночь журналист отдыхает — записать нельзя, шаг не «не записан»', () => {
  const checked = play(night1(ALTERNATE), compare(9, 11))
  expect(step(checked)).toMatchObject({ resting: false, restNext: true })
  const rest = nextNight(checked)
  expect(step(rest)).toMatchObject({ resting: true, restNext: false, recorded: false, allowed: [], used: [9, 11] })
  expect(attempt(rest, compare(1, 3))).toEqual({ ok: false, reason: 'step_resting' }); expect(attempt(rest, compare(null))).toEqual({ ok: false, reason: 'step_resting' })
  // Ночь с отдыхающим журналистом считается заполненной, когда записаны остальные.
  const filled = play(rest, act('mafia_shot', null, null), act('godfather_search', 3, null), act('prostitute_block', 10, null), act('butcher_kill', 6, null),
    act('maniac_visit', 7, null), act('sheriff_check', 1, null), act('doctor_heal', 4, null))
  expect(st(filled).night!.complete).toBe(true)
  // Через ночь он снова проверяет, прежние проверенные израсходованы.
  const third = nextNight(rest)
  expect(step(third)).toMatchObject({ resting: false, used: [9, 11] }); expect(attempt(third, compare(1, 3)).ok).toBe(true)
  // «Каждую ночь» (по умолчанию) — отдыха нет.
  expect(step(nextNight(play(night1(), compare(9, 11))))).toMatchObject({ resting: false })
  expect(step(play(night1(), compare(9, 11))).restNext).toBe(false)
  // «Никого» — не проверка: отдыхать после неё не надо.
  expect(step(nextNight(play(night1(ALTERNATE), compare(null)))).resting).toBe(false)
})
test('проститутка заблокировала журналиста: ответа нет, игроки остаются доступными, ночь отдыха не нужна', () => {
  const blocked = play(night1(ALTERNATE), act('prostitute_block', 10, 2), compare(9, 11))
  expect(step(blocked)).toMatchObject({ blocked: true, blockedActors: [2], restNext: false }); expect(step(blocked).answer).toEqual({ kind: 'blocked' })
  const second = nextNight(blocked)
  expect(step(second)).toMatchObject({ resting: false, used: [] }); expect(step(second).allowed).toContain(9)
  expect(attempt(second, compare(9, 11)).ok).toBe(true)
})
test('блок в ночь отдыха ничего не сдвигает: следующей ночью журналист проверяет', () => {
  const rest = play(nextNight(play(night1(ALTERNATE), compare(9, 11))), act('prostitute_block', 10, 2))
  expect(step(rest)).toMatchObject({ resting: true })
  const third = nextNight(rest)
  expect(step(third)).toMatchObject({ resting: false, used: [9, 11] }); expect(attempt(third, compare(1, 3)).ok).toBe(true)
})
test('доступных игроков меньше двух — проверять некого: пару записать нельзя, «Никого» — можно', () => {
  // №1 журналист, №2 крёстный отец, №3 и №4 мирные: после проверки мирных остаётся один крёстный отец.
  const second = nextNight(play(night1(undefined, 'journalist G c c'), compare(3, 4, 1)))
  expect(step(second)).toMatchObject({ used: [3, 4], allowed: [2], resting: false })
  expect(attempt(second, compare(2, 3, 1))).toEqual({ ok: false, reason: 'target_not_allowed' }); expect(attempt(second, compare(null, null, 1)).ok).toBe(true)
})
test('журнал: «Журналист: №1 и №3 — разные стороны»; блок, отдых и «никого» подписаны', () => {
  const texts = (s: Session, n = 1, lang: 'ru' | 'uk' = 'ru') =>
    journal(s, R).find((g) => g.phase.kind === 'night' && g.phase.n === n)!.entries.map((e) => entryText(lang, e, R))
  const diff = play(night1(), compare(1, 3))
  expect(texts(diff)).toContain('Журналист: №1 и №3 — разные стороны'); expect(texts(diff, 1, 'uk')).toContain('Журналіст: №1 і №3 — різні сторони')
  expect(texts(play(night1(), compare(9, 11)))).toContain('Журналист: №9 и №11 — одна сторона')
  expect(texts(play(night1(), compare(null)))).toContain('Журналист → никого')
  expect(texts(play(night1(), act('prostitute_block', 10, 2), compare(9, 11)))).toContain('Журналист: №9 и №11 — заблокирован, проверка не состоялась')
  expect(summaryBody('ru', journal(diff, R)[0]!, R)).toBe('журналист сравнил №1 и №3 — разные стороны')
  // В прошлой ночи отдыха строки «не записано» у журналиста нет.
  const past = nextNight(nextNight(play(night1(ALTERNATE), compare(9, 11))))
  expect(texts(past, 2).some((line) => line.startsWith('Журналист'))).toBe(false)
  expect(texts(past, 1)).toContain('Журналист: №9 и №11 — одна сторона')
})
test('правка задним числом: запись, оказавшаяся в ночи отдыха, проверкой не считается', () => {
  // Ночь 1: журналиста заблокировали (проверка не состоялась), Ночь 2: он проверил №1 и №4.
  let s = play(nextNight(play(night1(ALTERNATE), act('prostitute_block', 10, 2), compare(9, 11))), compare(1, 4))
  expect(step(s).answer).toEqual({ kind: 'same', same: true })
  // Ведущий исправил Ночь 1: блока не было. Теперь проверка Ночи 1 состоялась, а Ночь 2 — ночь отдыха.
  s = play(s, { type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: null, phase: N(1) })
  expect(nightState(s, R, 1).steps.find((x) => x.actionId === 'journalist_compare')!.answer).toEqual({ kind: 'same', same: true })
  expect(step(s)).toMatchObject({ resting: true, recorded: true }); expect(step(s).answer).toEqual({ kind: 'rest' })
  expect(step(nextNight(s))).toMatchObject({ used: [9, 11], resting: false })
  // Правка пары прошлой ночи: запись остаётся на месте и получает метку «испр.».
  const edited = play(s, { type: 'recordNightAction', actionId: 'journalist_compare', actor: 2, target: 6, target2: 7, phase: N(1) })
  expect(nightState(edited, R, 1).steps.find((x) => x.actionId === 'journalist_compare')).toMatchObject({ target: 6, target2: 7, edited: true, answer: { kind: 'same', same: false } })
})
test('журналист выбыл вручную посреди ночи — шаг серый; запись ночи без второй цели читается', () => {
  const s = play(night1(), compare(9, 11), { type: 'setStatus', seat: 2, status: 'out', cause: 'shot' })
  expect(step(s)).toMatchObject({ id: 'journalist_compare', grey: true, recorded: false })
  // Сохранение до обновления: у записей ночи нет поля target2 — вторая цель читается как «нет».
  const old = play(night1(undefined, 'S c G D c c c M c P c'), act('mafia_shot', null, 7))
  expect(old.log.at(-1)).not.toHaveProperty('target2'); expect(st(old).night!.steps[0]).toMatchObject({ target: 7, target2: null })
})
