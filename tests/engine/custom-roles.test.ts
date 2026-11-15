import {
  checkComposition, configurableRoles, DEFAULT_REGISTRY, deriveState, nightOrder, nightState, registryFor, sanitizeCustomRoles,
} from '../../src/engine'
import type { Command, Session } from '../../src/engine'
import { act, CUSTOM_TABLE, customNight, JOURNALIST, MANIAC, playWith } from '../helpers'

const ROLES = [JOURNALIST, MANIAC]
const R = registryFor(DEFAULT_REGISTRY, ROLES)
const night = (s: Session) => nightState(s, R, 1)
const rec = (s: Session, ...cmds: Command[]) => playWith(R, s, ...cmds)

test('без своих ролей справочник — тот же объект; тот же перечень — тот же справочник', () => {
  expect(registryFor(DEFAULT_REGISTRY, [])).toBe(DEFAULT_REGISTRY)
  expect(registryFor(DEFAULT_REGISTRY, undefined)).toBe(DEFAULT_REGISTRY)
  expect(registryFor(DEFAULT_REGISTRY, ROLES)).toBe(R)
})
test('свои роли стоят после встроенных; ночная получает действие «запись» в конце очереди', () => {
  expect(configurableRoles(R).map((r) => r.id)).toEqual(['mafia', 'prostitute', 'sheriff', 'doctor', 'custom_j', 'custom_m'])
  expect(R.roles.find((r) => r.id === 'custom_j')).toMatchObject({ name: 'журналист', side: 'red', seenBySheriffAs: 'red', custom: true, defaultCount: 0 })
  expect(R.nightActions.at(-1)).toMatchObject({ id: 'act_custom_j', effect: 'note', performers: ['custom_j'], scope: 'each' })
  expect(R.nightActions.at(-1)!.order).toBeGreaterThan(Math.max(...DEFAULT_REGISTRY.nightActions.map((a) => a.order)))
  expect(R.nightActions.some((a) => a.performers.includes('custom_m'))).toBe(false)
})
test('негодные записи перечня пропускаются', () => {
  const long = { id: 'c3', name: `  ${'д'.repeat(40)}  `, side: 'red', night: false }
  const dirty = [JOURNALIST, { ...JOURNALIST }, { id: 'a:b', name: 'x', side: 'red', night: false }, { id: 'mafia', name: 'x', side: 'red', night: false },
    { id: 'c1', name: '   ', side: 'red', night: false }, { id: 'c2', name: 'x', side: 'green', night: false }, long, null, 'роль']
  expect(sanitizeCustomRoles(DEFAULT_REGISTRY, dirty)).toEqual([JOURNALIST, { id: 'c3', name: 'д'.repeat(24), side: 'red', night: false }])
  expect(sanitizeCustomRoles(DEFAULT_REGISTRY, 'мусор')).toEqual([])
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `роль ${i}`, side: 'red', night: false }))
  expect(sanitizeCustomRoles(DEFAULT_REGISTRY, many)).toHaveLength(8)
})
test('состав считает свои роли по цвету; ролей больше игроков — раздать нельзя', () => {
  const check = checkComposition(11, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, custom_j: 1, custom_m: 1 }, R)
  expect(check.errors).toEqual([]); expect(check.civilians).toBe(4); expect(check.bySide).toEqual({ black: 4, red: 7 })
  expect(check.deck.filter((c) => c === 'custom_j')).toHaveLength(1)
  expect(checkComposition(4, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, custom_j: 1 }, R).errors).toEqual(['too_many_roles'])
  expect(checkComposition(6, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1, custom_j: 1 }, R)).toMatchObject({ errors: [], civilians: 0 })
})
test('порядок ночи для состава', () => {
  const deck = checkComposition(11, { mafia: 2, prostitute: 1, doctor: 1, custom_j: 1, custom_m: 1 }, R).deck
  expect(nightOrder(R, deck).map((a) => a.id)).toEqual(['mafia_shot', 'godfather_search', 'prostitute_block', 'doctor_heal', 'act_custom_j'])
})
test('шаг своей роли — последний; роль, которая ночью спит, шага не имеет', () => {
  expect(night(customNight().s).steps.map((x) => x.id))
    .toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4', 'act_custom_j:6'])
})
test('запись своей роли не меняет итог ночи', () => {
  const shot = rec(customNight().s, act('mafia_shot', null, 7))
  const noted = rec(shot, act('act_custom_j', 6, 7))
  expect(night(noted).outcome).toEqual(night(shot).outcome)
  expect(night(noted).outcome.dies).toBe(7)
  expect(night(noted).steps.at(-1)).toMatchObject({ effect: 'note', recorded: true, target: 7, blocked: false })
})
test('проститутка заблокировала носителя — шаг помечен, запись остаётся', () => {
  const s = rec(customNight().s, act('prostitute_block', 10, 6), act('act_custom_j', 6, 2))
  expect(night(s).steps.at(-1)).toMatchObject({ blocked: true, recorded: true, target: 2 })
})
test('шериф видит цвет своей роли, крёстный отец получает «не шериф»', () => {
  const answer = (s: Session, id: string) => night(s).steps.find((x) => x.id === id)!.answer
  expect(answer(rec(customNight().s, act('sheriff_check', 1, 9)), 'sheriff_check:1')).toEqual({ kind: 'side', side: 'black' })
  expect(answer(rec(customNight().s, act('sheriff_check', 1, 6)), 'sheriff_check:1')).toEqual({ kind: 'side', side: 'red' })
  expect(answer(rec(customNight().s, act('godfather_search', 3, 6)), 'godfather_search:3')).toEqual({ kind: 'found', found: false })
})
test('чёрная своя роль выстрел не наследует', () => {
  const s = rec(customNight().s, ...[3, 8, 10].map((seat): Command => ({ type: 'setStatus', seat, status: 'out', cause: 'voted' })))
  expect(night(s).steps.find((x) => x.actionId === 'mafia_shot')).toMatchObject({ grey: true })
})
test('две карты одной своей роли — два шага', () => {
  const table = CUSTOM_TABLE.map((r, i) => (i === 6 ? 'custom_j' : r))
  expect(night(customNight(ROLES, table).s).steps.slice(-2).map((x) => x.id)).toEqual(['act_custom_j:6', 'act_custom_j:7'])
})
test('носитель выбыл на своём шаге — ведущий остаётся на шаге этой роли, шаг серый', () => {
  const s = rec(customNight().s, { type: 'enterStep', step: 'act_custom_j:6' }, { type: 'setStatus', seat: 6, status: 'out', cause: 'voted' })
  const game = deriveState(s, R)
  expect(game.step).toBe('act_custom_j')
  expect(game.night!.steps.at(-1)).toMatchObject({ grey: true })
})
test('порядок ночи включает шаг, который достался наследнику: мафии нет, стреляет проститутка', () => {
  const deck = checkComposition(6, { mafia: 0, prostitute: 1, sheriff: 1, custom_j: 1 }, R).deck
  expect(nightOrder(R, deck).map((a) => a.id)).toEqual(['mafia_shot', 'prostitute_block', 'sheriff_check', 'act_custom_j'])
})
test('перечень из одних негодных записей — встроенный справочник', () => {
  expect(registryFor(DEFAULT_REGISTRY, [{ id: 'a:b', name: 'x', side: 'red', night: true }])).toBe(DEFAULT_REGISTRY)
})
