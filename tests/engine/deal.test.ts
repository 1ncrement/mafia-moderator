import { dealRoles, shuffle } from '../../src/engine/deal'
import { DEFAULT_REGISTRY } from '../../src/engine/roles/registry'
import { checkComposition } from '../../src/engine/setup'
import { countBy, seededInt } from '../helpers'

const deck = checkComposition(11, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }, DEFAULT_REGISTRY).deck
test('раздача детерминирована при фиксированном зерне', () => {
  expect(dealRoles(deck, seededInt(42))).toEqual(dealRoles(deck, seededInt(42)))
  expect(dealRoles(deck, seededInt(42))).not.toEqual(dealRoles(deck, seededInt(43)))
})
test('10 000 раздач: состав всегда равен колоде, мафий ровно две', () => {
  const rnd = seededInt(1)
  for (let i = 0; i < 10_000; i++) expect(countBy(dealRoles(deck, rnd))).toEqual(countBy(deck))
})
test('крёстный отец попадает на место №1 примерно в 1/11 раздач', () => {
  const rnd = seededInt(7); let hits = 0
  for (let i = 0; i < 11_000; i++) if (dealRoles(deck, rnd)[0] === 'godfather') hits++
  expect(hits).toBeGreaterThan(850); expect(hits).toBeLessThan(1150)
})
test('shuffle не меняет исходный массив', () => {
  const src = [1, 2, 3, 4]; shuffle(src, seededInt(3)); expect(src).toEqual([1, 2, 3, 4])
})
