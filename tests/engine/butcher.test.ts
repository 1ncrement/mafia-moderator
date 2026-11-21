import { entryText, summaryBody } from '../../src/app/i18n'
import { DEFAULT_REGISTRY, DEFAULT_RULES, journal, nightOrder, nightState, registryFor, checkComposition } from '../../src/engine'
import type { Session } from '../../src/engine'
import { act, game, play, st, toDay } from '../helpers'

// Мясник: второе нападение за ночь. Стол: №1 шериф, №2 мясник, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка.
const TABLE = 'S butcher G D c c c M c P c'
const N1 = { kind: 'night', n: 1 } as const
const night1 = (): Session => play(toDay(game(TABLE), 1), { type: 'startPhase', phase: N1 })
const out = (s: Session) => st(s).night!.outcome
const step = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!

test('мясник просыпается после крёстного отца и проститутки, перед шерифом', () => {
  expect(st(night1()).night!.steps.map((x) => x.id))
    .toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'butcher_kill:2', 'sheriff_check:1', 'doctor_heal:4'])
  const first = registryFor(DEFAULT_REGISTRY, undefined, { ...DEFAULT_RULES, prostituteFirst: true })
  expect(nightState(night1(), first, 1).steps.map((x) => x.actionId))
    .toEqual(['prostitute_block', 'mafia_shot', 'godfather_search', 'butcher_kill', 'sheriff_check', 'doctor_heal'])
  const deck = checkComposition(11, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, butcher: 1 }, first).deck
  expect(nightOrder(first, deck).map((a) => a.id)).toContain('butcher_kill')
})
test('мафия и мясник убивают разных — выбывают двое, у каждого своя причина', () => {
  expect(out(play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 2, 5))))
    .toEqual({ deaths: [{ seat: 5, cause: 'slain' }, { seat: 7, cause: 'shot' }], notes: [], blocked: [], healed: [], noAttack: null })
})
test('мафия и мясник убивают одного и того же — одна смерть', () => {
  expect(out(play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 2, 7))).deaths).toEqual([{ seat: 7, cause: 'shot' }])
})
test('доктор спасает от мясника — и от двух нападений сразу', () => {
  expect(out(play(night1(), act('butcher_kill', 2, 5), act('doctor_heal', 4, 5))))
    .toMatchObject({ deaths: [], notes: [{ seat: 5, kind: 'healed', cause: 'slain' }], noAttack: null })
  expect(out(play(night1(), act('mafia_shot', null, 5), act('butcher_kill', 2, 5), act('doctor_heal', 4, 5))).deaths).toEqual([])
  // Доктор лечил не того: убитый мясником выбывает.
  expect(out(play(night1(), act('butcher_kill', 2, 5), act('doctor_heal', 4, 6))).deaths).toEqual([{ seat: 5, cause: 'slain' }])
})
test('проститутка заблокировала мясника — удара нет; выстрел мафии при этом остаётся', () => {
  const alone = play(night1(), act('butcher_kill', 2, 5), act('prostitute_block', 10, 2))
  expect(out(alone)).toMatchObject({ deaths: [], noAttack: 'blocked', blocked: [2] })
  expect(step(alone, 'butcher_kill:2')).toMatchObject({ blocked: true, blockedActors: [2] })
  expect(out(play(alone, act('mafia_shot', null, 7)))).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], noAttack: null })
})
test('мясник убивает мафию и крёстного отца; убитый этой ночью успевает сходить сам', () => {
  expect(out(play(night1(), act('butcher_kill', 2, 8))).deaths).toEqual([{ seat: 8, cause: 'slain' }])
  const boss = play(night1(), act('butcher_kill', 2, 3), act('mafia_shot', null, 7))
  expect(out(boss).deaths).toEqual([{ seat: 3, cause: 'slain' }, { seat: 7, cause: 'shot' }])
  // Мафия стреляет в мясника: он тоже успевает ударить.
  expect(out(play(night1(), act('mafia_shot', null, 2), act('butcher_kill', 2, 5))).deaths).toEqual([{ seat: 2, cause: 'shot' }, { seat: 5, cause: 'slain' }])
})
test('шериф видит мясника красным, крёстный отец получает про него «не шериф»', () => {
  const s = play(night1(), act('sheriff_check', 1, 2), act('godfather_search', 3, 2))
  expect(step(s, 'sheriff_check:1').answer).toEqual({ kind: 'side', side: 'red' })
  expect(step(s, 'godfather_search:3').answer).toEqual({ kind: 'found', found: false })
})
test('подтверждение ставит каждому свою причину; утро называет двоих', () => {
  const s = play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 2, 5), { type: 'confirmNight', died: [5, 7] })
  expect(st(s).players[4]).toMatchObject({ status: 'out', cause: 'slain', outPhase: N1 }); expect(st(s).players[6]).toMatchObject({ status: 'out', cause: 'shot' })
  expect(st(s).morning).toMatchObject({ deaths: [5, 7], announced: false })
  expect(st(s).warnings).toEqual([])
})
test('журнал: запись мясника, итог с причиной, резюме ночи', () => {
  const R = DEFAULT_REGISTRY
  const one = play(night1(), act('butcher_kill', 2, 5), { type: 'confirmNight', died: [5] })
  const night = (s: Session) => journal(s, R).find((g) => g.phase.kind === 'night')!
  const texts = (s: Session, lang: 'ru' | 'uk' = 'ru') => night(s).entries.map((e) => entryText(lang, e, R))
  expect(texts(one)).toContain('Мясник → №5'); expect(texts(one)).toContain('Итог ночи: №5 убит мясником')
  expect(texts(one, 'uk')).toContain('Різник → №5'); expect(texts(one, 'uk')).toContain('Підсумок ночі: №5 убитий різником')
  expect(summaryBody('ru', night(one), R)).toBe('удар мясника по №5 → №5 убит мясником')
  const two = play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 2, 5), { type: 'confirmNight', died: [5, 7] })
  expect(texts(two)).toContain('Итог ночи: выбыли №5 и №7')
  // Прежняя запись без причины (один застреленный) читается как раньше.
  const shot = play(night1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] })
  expect(texts(shot)).toContain('Итог ночи: №7 застрелен')
  // Ведущий отметил выбывшим не того, кого называла подсказка: причина у него — «застрелен», как у любой ручной отметки итога.
  const other = play(night1(), act('butcher_kill', 2, 5), { type: 'confirmNight', died: [9] })
  expect(texts(other)).toContain('Итог ночи: №9 застрелен')
})
