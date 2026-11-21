import { translate } from '../../src/app/i18n'
import {
  checkComposition, configurableRoles, DEFAULT_REGISTRY, defaultComposition, deriveState, nightOrder, optionValue, roleOption, soloCount,
} from '../../src/engine'
import type { RoleOptionDef } from '../../src/engine'
import { game, play, st, toDay } from '../helpers'

// Этап 3: пять новых ролей, стороны одиночек и опции — записи справочника.

const R = DEFAULT_REGISTRY
const role = (id: string) => R.roles.find((r) => r.id === id)!
const NEW = ['bodyguard', 'journalist', 'butcher', 'maniac', 'bulletproof']
const option = (id: string): RoleOptionDef => R.roles.flatMap((r) => r.options ?? []).find((o) => o.id === id)!
const BASE = { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }

test('пять новых ролей есть в справочнике и по умолчанию выключены', () => {
  for (const id of NEW) expect(role(id)).toMatchObject({ id, defaultCount: 0 })
  expect(defaultComposition(R)).toMatchObject({ bodyguard: 0, journalist: 0, butcher: 0, maniac: 0, bulletproof: 0 })
  const deck = checkComposition(10, defaultComposition(R), R).deck
  for (const id of NEW) expect(deck).not.toContain(id)
  // Порядок строк на экране состава — как на макете: после доктора идут охранник, журналист, мясник, маньяк, бронежилет.
  expect(configurableRoles(R).map((r) => r.id)).toEqual(['mafia', 'prostitute', 'sheriff', 'doctor', ...NEW])
  // В ночи обычного состава новых шагов нет.
  expect(nightOrder(R, deck).map((a) => a.id)).toEqual(['mafia_shot', 'godfather_search', 'prostitute_block', 'sheriff_check', 'doctor_heal'])
})
test('стороны: чёрные, красные и по одной стороне-одиночке у мясника и маньяка; шериф видит одиночек красными', () => {
  expect(R.sides.map((s) => [s.id, s.solo === true])).toEqual([['black', false], ['red', false], ['solo_butcher', true], ['solo_maniac', true]])
  expect(role('butcher')).toMatchObject({ side: 'solo_butcher', seenBySheriffAs: 'red', maxCount: 1 })
  expect(role('maniac')).toMatchObject({ side: 'solo_maniac', seenBySheriffAs: 'red', maxCount: 1 })
  for (const id of ['bodyguard', 'journalist', 'bulletproof']) expect(role(id)).toMatchObject({ side: 'red', seenBySheriffAs: 'red' })
  expect(role('bulletproof').extraLife).toBe(true)
})
test('мясника и маньяка не больше одного: лишнее из состава в колоду не попадает', () => {
  const check = checkComposition(11, { ...BASE, butcher: 3, maniac: 2, bodyguard: 2 }, R)
  expect(check.deck.filter((c) => c === 'butcher')).toHaveLength(1); expect(check.deck.filter((c) => c === 'maniac')).toHaveLength(1)
  expect(check.deck.filter((c) => c === 'bodyguard')).toHaveLength(2); expect(check.errors).toEqual([])
})
test('счётчики сторон: одиночки считаются каждый в своей стороне и вместе — «сам за себя»', () => {
  const check = checkComposition(11, { ...BASE, butcher: 1, maniac: 1, journalist: 1 }, R)
  expect(check.bySide).toEqual({ black: 3, red: 6, solo_butcher: 1, solo_maniac: 1 })
  expect(soloCount(R, check.bySide)).toBe(2); expect(soloCount(R, checkComposition(10, defaultComposition(R), R).bySide)).toBe(0)
  const s = st(game('S c G D butcher c c M maniac P c'))
  expect(s.counts.bySide).toEqual({ black: 3, red: 6, solo_butcher: 1, solo_maniac: 1 })
})
test('в составе с мясником, но без мафии, предупреждение «нет мафии» остаётся', () => {
  expect(checkComposition(8, { mafia: 0, prostitute: 0, sheriff: 1, doctor: 1, butcher: 1 }, R).warnings).toContain('no_killer')
  expect(checkComposition(8, { ...BASE, butcher: 1 }, R).warnings).not.toContain('no_killer')
})
test('подсказка о конце игры скрыта, пока в игре одиночка', () => {
  const out = (seat: number) => ({ type: 'setStatus', seat, status: 'out', cause: 'voted' } as const)
  // №1 крёстный отец, №2 мясник, остальные мирные: чёрных не осталось, но мясник жив — подсказки нет.
  let s = play(toDay(game('G butcher c c c c'), 1), out(1))
  expect(st(s).counts.bySide.black).toBe(0); expect(st(s).endHint).toBeNull()
  s = play(s, out(2)); expect(st(s).endHint).toBe('no_black')
  // Чёрных не меньше остальных, одиночка жив — тоже молчим; одиночка выбыл — подсказка есть.
  s = play(toDay(game('G M butcher c c'), 1), out(4))
  expect(st(s).endHint).toBeNull(); expect(st(play(s, out(3))).endHint).toBe('black_not_less')
})
test('опции новых ролей описаны в справочнике: журналист — каждую ночь или через ночь, у маньяка три выключателя', () => {
  expect(option('journalist_pace')).toMatchObject({ kind: 'choice', default: 'every' })
  const pace = option('journalist_pace')
  expect(pace.kind === 'choice' && pace.choices.map((c) => c.value)).toEqual(['every', 'alternate'])
  expect(role('maniac').options!.map((o) => [o.id, o.kind, o.default])).toEqual([
    ['maniac_no_repeat', 'toggle', true], ['maniac_no_nominate', 'toggle', false], ['maniac_no_vote', 'toggle', false],
  ])
  expect(roleOption(game('S c G D c'), R, 'maniac_no_repeat')).toBe(true)
  expect(roleOption(game('S c G D c', { roleOptions: { maniac_no_vote: true, journalist_pace: 'alternate' } }), R, 'maniac_no_vote')).toBe(true)
  expect(optionValue(pace, { journalist_pace: 'чепуха' })).toBe('every')
})
test('у каждой новой роли, стороны и опции есть строки в обоих словарях; мясник по-украински — різник', () => {
  expect(translate('uk', 'role.butcher')).toBe('різник'); expect(translate('ru', 'role.butcher')).toBe('мясник')
  expect(translate('ru', 'side.solo_butcher.win')).toBe('Победа мясника'); expect(translate('uk', 'side.solo_butcher.win')).toBe('Перемога різника')
  expect(translate('ru', 'side.solo_maniac.win')).toBe('Победа маньяка'); expect(translate('ru', 'side.solo.gen')).toBe('сам за себя')
  expect(translate('ru', 'role.bulletproof')).toBe('бронежилет'); expect(translate('ru', 'role.bodyguard')).toBe('охранник')
})
test('игра, сохранённая до обновления (в составе нет новых ролей и нет опций), выводится как раньше', () => {
  const s = toDay(game('S c G D c c c M c P c'), 2)
  expect(s.config.roleOptions).toBeUndefined(); expect(Object.keys(s.config.composition).sort()).toEqual(['doctor', 'mafia', 'prostitute', 'sheriff'])
  const state = deriveState(s, R)
  expect(state.counts.bySide).toEqual({ black: 3, red: 8, solo_butcher: 0, solo_maniac: 0 }); expect(state.endHint).toBeNull()
})
