import { DEFAULT_REGISTRY } from '../../src/engine/roles/registry'
import { checkComposition, DEFAULT_RULES, defaultComposition, normalizeRules } from '../../src/engine/setup'
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

// ── Правила партии ──────────────────────────────────────────────────────────

const OLD_RULES = { nominationsFromDay: 2, balaganFromDay: 2 }
const LEGACY = { ...OLD_RULES, balagan: true, farewellAfterVote: true, farewellAfterNight: false, prostituteFirst: false }

test('умолчания новой игры: балаган и прощание после голосования есть, после ночи нет, проститутка первой', () => {
  expect(DEFAULT_RULES).toEqual({ ...OLD_RULES, balagan: true, farewellAfterVote: true, farewellAfterNight: false, prostituteFirst: true })
})
test('правила игры до обновления: недостающие поля читаются «как было» — проститутка после мафии', () => {
  expect(normalizeRules(OLD_RULES)).toEqual(LEGACY)
})
test('заданные правила сохраняются как есть', () => {
  const rules = { nominationsFromDay: 3, balaganFromDay: 4, balagan: false, farewellAfterVote: false, farewellAfterNight: true, prostituteFirst: true }
  expect(normalizeRules(rules)).toEqual(rules)
})
test('мусор в полях правил заменяется прежним значением, а не роняет чтение', () => {
  expect(normalizeRules({ ...OLD_RULES, balagan: 'да', farewellAfterVote: null, farewellAfterNight: 1, prostituteFirst: {} })).toEqual(LEGACY)
  expect(normalizeRules(null)).toEqual(LEGACY)
  expect(normalizeRules('rules')).toEqual(LEGACY)
})
test('недостающие поля можно читать и по умолчаниям новой игры — для черновика состава', () => {
  expect(normalizeRules(OLD_RULES, DEFAULT_RULES)).toEqual(DEFAULT_RULES)
  expect(normalizeRules({ ...OLD_RULES, prostituteFirst: false }, DEFAULT_RULES)).toEqual({ ...DEFAULT_RULES, prostituteFirst: false })
})
