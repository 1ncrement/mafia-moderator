import { DEFAULT_REGISTRY } from '../../src/engine/roles/registry'
import { checkComposition, defaultComposition } from '../../src/engine/setup'
import { countBy } from '../helpers'

const std = { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }
test('по умолчанию каждой роли по одной', () => {
  expect(defaultComposition(DEFAULT_REGISTRY)).toEqual({ mafia: 1, prostitute: 1, sheriff: 1, doctor: 1 })
})
test('11 игроков, 2 мафии: один крёстный отец внутри числа мафий, 6 мирных', () => {
  const r = checkComposition(11, std, DEFAULT_REGISTRY)
  expect(countBy(r.deck)).toEqual({ godfather: 1, mafia: 1, prostitute: 1, sheriff: 1, doctor: 1, civilian: 6 })
  expect(r.civilians).toBe(6); expect(r.bySide).toEqual({ black: 3, red: 8 }); expect(r.errors).toEqual([])
})
test('одна мафия — это крёстный отец', () => {
  expect(countBy(checkComposition(10, { ...std, mafia: 1 }, DEFAULT_REGISTRY).deck).mafia).toBeUndefined()
})
test('ролей больше, чем игроков — ошибка', () => {
  expect(checkComposition(4, std, DEFAULT_REGISTRY).errors).toEqual(['too_many_roles'])
})
test('границы числа игроков', () => {
  expect(checkComposition(3, {}, DEFAULT_REGISTRY).errors).toContain('players_out_of_range')
  expect(checkComposition(21, {}, DEFAULT_REGISTRY).errors).toContain('players_out_of_range')
})
test('предупреждения состава', () => {
  expect(checkComposition(8, { ...std, mafia: 0, prostitute: 0 }, DEFAULT_REGISTRY).warnings).toContain('no_killer')
  expect(checkComposition(4, { mafia: 2 }, DEFAULT_REGISTRY).warnings).toContain('black_not_less_than_red')
})
