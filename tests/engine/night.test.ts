import { entryText } from '../../src/app/i18n'
import { applyUndo, checkComposition, DEFAULT_REGISTRY, DEFAULT_RULES, deriveState, journal, nightOrder, nightState, registryFor, roleOption } from '../../src/engine'
import type { Command, GameEvent, Registry, Session } from '../../src/engine'
import { act, attempt, customNight, game, gameWith, JOURNALIST, n1, play, playWith, st, TABLE_11, toDay } from '../helpers'

const out = (s: Session) => st(s).night!.outcome
test('шаги ночи из справочника', () => {
  expect(st(n1()).night!.steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4'])
  expect(st(n1()).night!.steps[0]).toMatchObject({ actors: [3, 8], grey: false, recorded: false })
  expect(st(n1('S c G D c c c M c c c')).night!.steps.map((x) => x.actionId)).not.toContain('prostitute_block')
  expect(st(n1('S D G M c c c c D')).night!.steps.map((x) => x.id)).toContain('doctor_heal:9')
})
test('выстрел, лечение, пропуск', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7)))).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], noAttack: null })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7)))).toMatchObject({ deaths: [], notes: [{ seat: 7, kind: 'healed', cause: 'shot' }], healed: [7], noAttack: null })
  expect(out(play(n1(), act('mafia_shot', null, null)))).toMatchObject({ deaths: [], noAttack: 'none' })
  expect(out(play(n1(), act('mafia_shot', null, 8)))).toMatchObject({ deaths: [{ seat: 8, cause: 'shot' }] })
  expect(out(play(n1(), act('mafia_shot', null, 4), act('doctor_heal', 4, 4)))).toMatchObject({ deaths: [], noAttack: null })
})
test('блок', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 3)))).toMatchObject({ deaths: [], noAttack: 'blocked' })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 8)))).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }] })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7), act('prostitute_block', 10, 4)))).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], blocked: [4] })
})
test('крёстный отец выбыл: стреляют оставшиеся, шерифа никто не ищет', () => {
  const t = 'S c G D c c M M c P c'
  let s = play(toDay(game(t), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' }, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(st(s).night!.steps.find((x) => x.actionId === 'godfather_search')).toMatchObject({ id: 'godfather_search', grey: true })
  expect(attempt(s, act('godfather_search', null, 1))).toEqual({ ok: false, reason: 'step_grey' })
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 7)))).toMatchObject({ deaths: [{ seat: 5, cause: 'shot' }] })
  s = play(toDay(game(t), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' }, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' },
    { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 8)))).toMatchObject({ deaths: [], noAttack: 'blocked' })
})
test('все мафии выбыли: стреляет проститутка', () => {
  let s = toDay(game(TABLE_11), 1)
  for (const seat of [3, 8]) s = play(s, { type: 'setStatus', seat, status: 'out', cause: 'voted' })
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(st(s).night!.steps[0]).toMatchObject({ id: 'mafia_shot', actors: [10], performerRole: 'prostitute', inherited: true, grey: false })
  expect(out(play(s, act('mafia_shot', null, 5)))).toMatchObject({ deaths: [{ seat: 5, cause: 'shot' }] })
  expect(out(play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 10)))).toMatchObject({ deaths: [], noAttack: 'blocked' })
})
test('ответы шерифу и крёстному отцу', () => {
  const answer = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!.answer
  for (const [target, side] of [[8, 'black'], [3, 'black'], [10, 'black'], [2, 'red']] as const)
    expect(answer(play(n1(), act('sheriff_check', 1, target)), 'sheriff_check:1')).toEqual({ kind: 'side', side })
  expect(answer(play(n1(), act('prostitute_block', 10, 1), act('sheriff_check', 1, 8)), 'sheriff_check:1')).toEqual({ kind: 'blocked' })
  expect(answer(play(n1(), act('godfather_search', 3, 1)), 'godfather_search:3')).toEqual({ kind: 'found', found: true })
  expect(answer(play(n1(), act('godfather_search', 3, 5), act('prostitute_block', 10, 3)), 'godfather_search:3')).toEqual({ kind: 'found', found: false })
})

test('доктор: повтор цели — предупреждение, через ночь можно', () => {
  let s = play(n1(), act('doctor_heal', 4, 5), { type: 'confirmNight', died: [] })
  s = play(s, { type: 'startPhase', phase: { kind: 'night', n: 2 } })
  expect(st(s).night!.steps.at(-1)!.lastNight).toMatchObject({ recorded: true, target: 5 })
  expect(attempt(s, act('doctor_heal', 4, 5))).toEqual({ ok: false, reason: 'repeat_target' })
  const forced = play(s, act('mafia_shot', null, 5), { type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5, force: true })
  expect(out(forced)).toMatchObject({ deaths: [], noAttack: null })
  s = play(s, act('doctor_heal', 4, 6), { type: 'confirmNight', died: [] }, { type: 'startPhase', phase: { kind: 'night', n: 3 } })
  expect(attempt(s, act('doctor_heal', 4, 5)).ok).toBe(true)
})
test('цель должна быть в игре; постоянные метки', () => {
  const s = play(toDay(game(TABLE_11), 1), { type: 'setStatus', seat: 9, status: 'out', cause: 'voted' }, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(attempt(s, act('mafia_shot', null, 9))).toEqual({ ok: false, reason: 'not_alive' })
  const marked = st(play(s, act('sheriff_check', 1, 8), act('godfather_search', 3, 5)))
  expect(marked.permanentMarks).toEqual(expect.arrayContaining([{ seat: 8, actionId: 'sheriff_check' }, { seat: 5, actionId: 'godfather_search' }]))
})
test('подтверждение итога — одна пачка: статус, отметка и новый день', () => {
  const before = play(n1(), act('mafia_shot', null, 7))
  expect(st(before).night!.complete).toBe(false)
  const s = play(before, { type: 'confirmNight', died: [7] })
  expect(st(s).phase).toEqual({ kind: 'day', n: 2 })
  expect(st(s).players[6]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
  expect(nightState(s, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [7], chosen: [7] })
  expect(st({ ...s, log: applyUndo(s.log, s.undo.at(-1)!) }).phase).toEqual({ kind: 'night', n: 1 })
  expect(st(play(before, { type: 'confirmNight', died: [2] })).players[1]!.status).toBe('out')
})
// ── Итог ночи — список событий ──────────────────────────────────────────────

test('итог ночи — список событий: выстрел даёт одну смерть с причиной', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7)))).toEqual({ deaths: [{ seat: 7, cause: 'shot' }], notes: [], blocked: [], healed: [], noAttack: null })
})
test('лечение — заметка «вылечен»: спасённый от выстрела — с причиной нападения, вылеченный без нападения — без неё', () => {
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7))))
    .toEqual({ deaths: [], notes: [{ seat: 7, kind: 'healed', cause: 'shot' }], blocked: [], healed: [7], noAttack: null })
  // Доктор лечил не того: застреленный выбывает, вылеченный остаётся заметкой без причины.
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 5))))
    .toEqual({ deaths: [{ seat: 7, cause: 'shot' }], notes: [{ seat: 5, kind: 'healed' }], blocked: [], healed: [5], noAttack: null })
  // Заблокированный доктор не лечит: заметки нет.
  expect(out(play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7), act('prostitute_block', 10, 4))).notes).toEqual([])
})
test('нападения не было: никто не стрелял — none, стрелявший заблокирован — blocked', () => {
  expect(out(n1())).toEqual({ deaths: [], notes: [], blocked: [], healed: [], noAttack: 'none' })
  expect(out(play(n1(), act('mafia_shot', null, null)))).toMatchObject({ deaths: [], noAttack: 'none' })
  expect(out(play(n1(), act('mafia_shot', null, 7), act('prostitute_block', 10, 3)))).toEqual({ deaths: [], notes: [], blocked: [3], healed: [], noAttack: 'blocked' })
})
test('подтверждение с двумя выбывшими: два статуса одной пачкой, отменяется одним нажатием', () => {
  const before = play(n1(), act('mafia_shot', null, 7))
  // Ведущий оставил отметку у застреленного №7 и добавил №2; повтор номера не даёт второго статуса.
  const s = play(before, { type: 'confirmNight', died: [7, 2, 7] })
  expect(st(s).phase).toEqual({ kind: 'day', n: 2 }); expect(st(s).counts.alive).toBe(9)
  for (const seat of [2, 7]) expect(st(s).players[seat - 1]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
  expect(s.log.filter((e) => e.type === 'status_set')).toHaveLength(2)
  expect(nightState(s, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [7], chosen: [2, 7] }); expect(st(s).warnings).toEqual([])
  const undone = st({ ...s, log: applyUndo(s.log, s.undo.at(-1)!) })
  expect(undone.phase).toEqual({ kind: 'night', n: 1 }); expect(undone.counts.alive).toBe(11); expect(undone.night!.confirmed).toBeNull()
  // Номера вне стола подтверждение не принимает.
  expect(attempt(before, { type: 'confirmNight', died: [7, 99] })).toEqual({ ok: false, reason: 'not_alive' })
})
test('запись подтверждения из сохранения до обновления (один номер или null) читается как набор', () => {
  const N1 = { kind: 'night', n: 1 } as const
  const s = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] })
  const saved = (hinted: unknown, chosen: unknown): Session =>
    ({ ...s, log: s.log.map((e) => (e.type === 'night_confirmed' ? { ...e, hinted, chosen } as unknown as GameEvent : e)) })
  const old = saved(7, 7)
  expect(nightState(old, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [7], chosen: [7] }); expect(st(old).warnings).toEqual([])
  expect(journal(old, DEFAULT_REGISTRY).find((g) => g.phase.kind === 'night')!.entries.at(-1)).toMatchObject({ kind: 'night_result', died: [7] })
  expect(nightState(saved(null, null), DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [], chosen: [] })
  // Мусор в записи не роняет вывод: номера вне стола и не-числа отбрасываются.
  expect(nightState(saved('чепуха', [7, 99, 'x', 7]), DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [], chosen: [7] })
  expect(() => st(saved({ a: 1 }, undefined))).not.toThrow()
  // По старой записи работает и правка задним числом: предупреждение, «Исправить» и «Оставить».
  const edited = play(old, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 9, phase: N1 })
  expect(st(edited).warnings).toEqual([{ code: 'night_outcome_changed', night: 1, expected: [9] }])
  const fixed = play(edited, { type: 'acknowledgeNight', night: 1, apply: true })
  expect(st(fixed).players[6]!.status).toBe('alive'); expect(st(fixed).players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: N1 })
  expect(nightState(fixed, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [9], chosen: [9] })
  const kept = play(edited, { type: 'acknowledgeNight', night: 1, apply: false })
  expect(nightState(kept, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [9], chosen: [7] }); expect(st(kept).warnings).toEqual([])
})
test('несколько нападений за ночь (вымышленная вторая стреляющая роль): двое выбывших, одна цель — одна смерть, лечение и блок считаются по каждому нападению', () => {
  // №1 крёстный отец, №2 охотник (стреляет сам), №5 доктор, №6 проститутка.
  const reg: Registry = { ...DEFAULT_REGISTRY,
    roles: [...DEFAULT_REGISTRY.roles, { id: 'hunter', nameKey: 'role.hunter', side: 'red', defaultCount: 0, seenBySheriffAs: 'red' }],
    nightActions: [...DEFAULT_REGISTRY.nightActions, { id: 'hunter_shot', order: 45, effect: 'kill', performers: ['hunter'], scope: 'each', stepKey: 'k', questionKey: 'q' }] }
  const N1 = { kind: 'night', n: 1 } as const
  const start = playWith(reg, gameWith(reg, ['godfather', 'hunter', 'civilian', 'civilian', 'doctor', 'prostitute']),
    { type: 'startPhase', phase: { kind: 'day', n: 1 } }, { type: 'startPhase', phase: N1 })
  const night = (...cmds: Command[]) => nightState(playWith(reg, start, ...cmds), reg, 1).outcome
  expect(night(act('mafia_shot', null, 4), act('hunter_shot', 2, 3))).toMatchObject({ deaths: [{ seat: 3, cause: 'shot' }, { seat: 4, cause: 'shot' }], noAttack: null })
  expect(night(act('mafia_shot', null, 4), act('hunter_shot', 2, 4)).deaths).toEqual([{ seat: 4, cause: 'shot' }])
  // Лечение отменяет все нападения на вылеченного; блок одного нападавшего чужое нападение не отменяет.
  expect(night(act('mafia_shot', null, 4), act('hunter_shot', 2, 4), act('doctor_heal', 5, 4)))
    .toMatchObject({ deaths: [], notes: [{ seat: 4, kind: 'healed', cause: 'shot' }], noAttack: null })
  expect(night(act('mafia_shot', null, 4), act('hunter_shot', 2, 3), act('prostitute_block', 6, 2))).toMatchObject({ deaths: [{ seat: 4, cause: 'shot' }], noAttack: null })
  expect(night(act('hunter_shot', 2, 3), act('prostitute_block', 6, 2))).toMatchObject({ deaths: [], noAttack: 'blocked' })
  // Подсказка из двоих: подтверждение помнит оба номера; правка задним числом предлагает новый набор, «Исправить» ставит его целиком.
  let s = playWith(reg, start, act('mafia_shot', null, 4), act('hunter_shot', 2, 3), { type: 'confirmNight', died: [3, 4] })
  expect(nightState(s, reg, 1).confirmed).toEqual({ hinted: [3, 4], chosen: [3, 4] }); expect(deriveState(s, reg).warnings).toEqual([])
  s = playWith(reg, s, { type: 'recordNightAction', actionId: 'hunter_shot', actor: 2, target: 5, phase: N1 })
  expect(deriveState(s, reg).warnings).toEqual([{ code: 'night_outcome_changed', night: 1, expected: [4, 5] }])
  const fixed = deriveState(playWith(reg, s, { type: 'acknowledgeNight', night: 1, apply: true }), reg)
  expect([3, 4, 5].map((seat) => fixed.players[seat - 1]!.status)).toEqual(['alive', 'out', 'out']); expect(fixed.warnings).toEqual([])
})
test('вымышленная роль с существующим эффектом работает без правок движка', () => {
  const reg: Registry = { ...DEFAULT_REGISTRY,
    roles: [...DEFAULT_REGISTRY.roles, { id: 'bodyguard', nameKey: 'role.bodyguard', side: 'red', defaultCount: 0, seenBySheriffAs: 'red' }],
    nightActions: [...DEFAULT_REGISTRY.nightActions, { id: 'bodyguard_guard', order: 45, effect: 'heal', performers: ['bodyguard'], scope: 'each', stepKey: 'k', questionKey: 'q' }] }
  const s = gameWith(reg, ['godfather', 'bodyguard', 'civilian', 'civilian'])
  const cmds: Command[] = [{ type: 'startPhase', phase: { kind: 'day', n: 1 } }, { type: 'startPhase', phase: { kind: 'night', n: 1 } },
    act('mafia_shot', null, 3), act('bodyguard_guard', 2, 3)]
  const night = playWith(reg, s, ...cmds)
  expect(nightState(night, reg, 1).steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:1', 'bodyguard_guard:2'])
  expect(nightState(night, reg, 1).outcome).toMatchObject({ deaths: [], noAttack: null })
})

test('шаг знает, что его исполнитель заблокирован этой ночью', () => {
  const blocked = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!.blocked
  const s = play(n1(), act('prostitute_block', 10, 1))
  expect(blocked(s, 'sheriff_check:1')).toBe(true); expect(blocked(s, 'doctor_heal:4')).toBe(false)
  expect(blocked(play(n1(), act('prostitute_block', 10, 8)), 'mafia_shot')).toBe(false)
  expect(blocked(play(n1(), act('prostitute_block', 10, 3)), 'mafia_shot')).toBe(true)
})

test('статус меняется посреди ночи: шаги и цели пересчитываются от текущих статусов', () => {
  let s = play(toDay(game(TABLE_11), 1), { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' }, { type: 'setStatus', seat: 4, status: 'out', cause: 'voted' },
    { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(st(s).night!.steps.at(-1)).toMatchObject({ id: 'doctor_heal', grey: true })
  expect(attempt(s, act('mafia_shot', null, 7))).toEqual({ ok: false, reason: 'not_alive' })
  s = play(s, { type: 'setStatus', seat: 7, status: 'alive' }, { type: 'setStatus', seat: 4, status: 'alive' })
  expect(st(s).night!.steps.at(-1)).toMatchObject({ id: 'doctor_heal:4', grey: false }); expect(attempt(s, act('mafia_shot', null, 7)).ok).toBe(true)
  // Подтверждённая ночь смотрится по статусам на момент подтверждения: застреленный доктор успел вылечить.
  s = play(s, act('mafia_shot', null, 4), act('doctor_heal', 4, 5), { type: 'confirmNight', died: [4] })
  expect(nightState(s, DEFAULT_REGISTRY, 1).steps.at(-1)).toMatchObject({ id: 'doctor_heal:4', grey: false, recorded: true, target: 5 })
  expect(st(s).warnings).toEqual([]); expect(st(s).players[3]).toMatchObject({ status: 'out', cause: 'shot' })
})
test('обмен ролями не теряет ночные записи роли', () => {
  let s = play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7), act('sheriff_check', 1, 8), { type: 'confirmNight', died: [] })
  s = play(s, { type: 'swapRoles', a: 4, b: 9 }, { type: 'swapRoles', a: 1, b: 2 })
  const night = nightState(s, DEFAULT_REGISTRY, 1)
  expect(night.steps.find((x) => x.id === 'doctor_heal:9')).toMatchObject({ recorded: true, target: 7 })
  expect(night.steps.find((x) => x.id === 'sheriff_check:2')).toMatchObject({ recorded: true, target: 8, answer: { kind: 'side', side: 'black' } })
  expect(night.outcome).toMatchObject({ deaths: [], noAttack: null }); expect(st(s).warnings).toEqual([])
  expect(st(s).permanentMarks).toContainEqual({ seat: 8, actionId: 'sheriff_check' })
  const n2 = play(s, { type: 'startPhase', phase: { kind: 'night', n: 2 } })
  expect(st(n2).night!.steps.find((x) => x.id === 'doctor_heal:9')!.lastNight).toMatchObject({ recorded: true, target: 7 })
  expect(attempt(n2, act('doctor_heal', 9, 7))).toEqual({ ok: false, reason: 'repeat_target' })
  // Правка прошлой записи после обмена попадает в ту же запись, а не создаёт вторую.
  const edited = play(n2, { type: 'recordNightAction', actionId: 'doctor_heal', actor: 9, target: 5, phase: { kind: 'night', n: 1 } })
  expect(edited.log.filter((e) => e.type === 'night_action' && e.actionId === 'doctor_heal')).toHaveLength(1)
  expect(nightState(edited, DEFAULT_REGISTRY, 1).steps.find((x) => x.id === 'doctor_heal:9')).toMatchObject({ target: 5, edited: true })
})

// ── Порядок проститутки и опция «что отменяет блок крёстного отца» ──────────

const FIRST = registryFor(DEFAULT_REGISTRY, undefined, { ...DEFAULT_RULES, prostituteFirst: true })
const LATER = registryFor(DEFAULT_REGISTRY, undefined, { ...DEFAULT_RULES, prostituteFirst: false })
const OPTION = DEFAULT_REGISTRY.roles.find((r) => r.id === 'prostitute')!.options![0]!
/** Ночь 1 с заданным значением опции проститутки: мафия стреляет в №7, крёстный отец (№3) ищет шерифа (№1). */
const nightWith = (roleOptions: Record<string, boolean | string> | undefined, blocked: number): Session => {
  const dealt = game(TABLE_11, roleOptions === undefined ? {} : { roleOptions })
  return play(toDay(dealt, 1), { type: 'startPhase', phase: { kind: 'night', n: 1 } },
    act('mafia_shot', null, 7), act('godfather_search', 3, 1), act('prostitute_block', 10, blocked))
}
const stepOf = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!
const FOUND = { kind: 'found', found: true }

test('порядок шагов: проститутка первой или после мафии — по правилу партии', () => {
  const ids = (registry: Registry) => nightState(n1(), registry, 1).steps.map((x) => x.id)
  expect(ids(FIRST)).toEqual(['prostitute_block:10', 'mafia_shot', 'godfather_search:3', 'sheriff_check:1', 'doctor_heal:4'])
  expect(ids(LATER)).toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4'])
  const deck = checkComposition(11, { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }, FIRST).deck
  expect(nightOrder(FIRST, deck).map((a) => a.id)[0]).toBe('prostitute_block')
  expect(nightOrder(LATER, deck).map((a) => a.id)[0]).toBe('mafia_shot')
})
test('справочник по правилу собирается один раз: тот же вход — тот же объект; без правила порядок прежний', () => {
  expect(LATER).toBe(DEFAULT_REGISTRY); expect(registryFor(DEFAULT_REGISTRY, undefined)).toBe(DEFAULT_REGISTRY)
  expect(registryFor(DEFAULT_REGISTRY, undefined, { ...DEFAULT_RULES, prostituteFirst: true })).toBe(FIRST)
  const custom = [JOURNALIST]
  const withCustom = registryFor(DEFAULT_REGISTRY, custom, DEFAULT_RULES)
  expect(registryFor(DEFAULT_REGISTRY, custom, { ...DEFAULT_RULES })).toBe(withCustom)
  expect(registryFor(DEFAULT_REGISTRY, custom, { ...DEFAULT_RULES, prostituteFirst: false })).toBe(registryFor(DEFAULT_REGISTRY, custom))
  // Свои роли по-прежнему в конце очереди, проститутка — в начале.
  const order = [...withCustom.nightActions].sort((a, b) => a.order - b.order).map((a) => a.id)
  expect(order[0]).toBe('prostitute_block'); expect(order.at(-1)).toBe('act_custom_j')
  const { s } = customNight()
  expect(nightState(s, withCustom, 1).steps.map((x) => x.actionId)).toEqual(['prostitute_block', 'mafia_shot', 'godfather_search', 'sheriff_check', 'doctor_heal', 'act_custom_j'])
})
test('опция проститутки описана в справочнике: выбор из трёх значений, по умолчанию отменяется выстрел', () => {
  expect(OPTION).toMatchObject({ kind: 'choice', default: 'shot' })
  expect(OPTION.kind === 'choice' && OPTION.choices.map((c) => c.value)).toEqual(['shot', 'search', 'both'])
  expect(roleOption(game(TABLE_11), DEFAULT_REGISTRY, OPTION.id)).toBe('shot')
  expect(roleOption(game(TABLE_11, { roleOptions: { [OPTION.id]: 'both' } }), DEFAULT_REGISTRY, OPTION.id)).toBe('both')
})
test('блок крёстного отца: что отменяется — выстрел, поиск шерифа или оба — по значению опции', () => {
  const shot = nightWith({ [OPTION.id]: 'shot' }, 3)
  expect(out(shot)).toMatchObject({ deaths: [], noAttack: 'blocked', blocked: [3] })
  expect(stepOf(shot, 'godfather_search:3').answer).toEqual(FOUND)
  expect([stepOf(shot, 'mafia_shot').blocked, stepOf(shot, 'godfather_search:3').blocked]).toEqual([true, false])

  const search = nightWith({ [OPTION.id]: 'search' }, 3)
  expect(out(search)).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], noAttack: null, blocked: [3] })
  expect(stepOf(search, 'godfather_search:3').answer).toEqual({ kind: 'blocked' })
  expect([stepOf(search, 'mafia_shot').blocked, stepOf(search, 'godfather_search:3').blocked]).toEqual([false, true])

  const both = nightWith({ [OPTION.id]: 'both' }, 3)
  expect(out(both)).toMatchObject({ deaths: [], noAttack: 'blocked' })
  expect(stepOf(both, 'godfather_search:3').answer).toEqual({ kind: 'blocked' })
  expect([stepOf(both, 'mafia_shot').blocked, stepOf(both, 'godfather_search:3').blocked]).toEqual([true, true])
})
test('блок рядовой мафии при живом крёстном отце ничего не отменяет при любом значении опции', () => {
  for (const value of ['shot', 'search', 'both']) {
    const s = nightWith({ [OPTION.id]: value }, 8)
    expect(out(s)).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], noAttack: null, blocked: [8] })
    expect(stepOf(s, 'godfather_search:3').answer).toEqual(FOUND)
    expect([stepOf(s, 'mafia_shot').blocked, stepOf(s, 'godfather_search:3').blocked]).toEqual([false, false])
  }
})
test('игра без опций ролей ведёт себя как «выстрел»; мусор в значении опции — тоже', () => {
  for (const options of [undefined, {}, { [OPTION.id]: 'чепуха' }, { [OPTION.id]: true }, { чужая: 'both' }]) {
    const s = nightWith(options, 3)
    expect(out(s)).toMatchObject({ deaths: [], noAttack: 'blocked' })
    expect(stepOf(s, 'godfather_search:3').answer).toEqual(FOUND)
  }
})
test('крёстный отец выбыл: блок единственной мафии отменяет выстрел при любом значении опции', () => {
  for (const value of ['shot', 'search', 'both']) {
    const s = play(toDay(game(TABLE_11, { roleOptions: { [OPTION.id]: value } }), 1), { type: 'setStatus', seat: 3, status: 'out', cause: 'voted' },
      { type: 'startPhase', phase: { kind: 'night', n: 1 } }, act('mafia_shot', null, 7), act('prostitute_block', 10, 8))
    expect(out(s)).toMatchObject({ deaths: [], noAttack: 'blocked' })
  }
})
test('отменённый блоком поиск: постоянной метки нет, запись журнала говорит, что поиск не состоялся', () => {
  const s = nightWith({ [OPTION.id]: 'both' }, 3)
  expect(st(s).permanentMarks).not.toContainEqual({ seat: 1, actionId: 'godfather_search' })
  const entry = journal(s, DEFAULT_REGISTRY)[0]!.entries.find((e) => e.kind === 'night_action' && e.actionId === 'godfather_search')!
  expect(entryText('ru', entry, DEFAULT_REGISTRY)).toBe('Крёстный отец → №1 — заблокирован, поиск не состоялся')
  expect(entryText('uk', entry, DEFAULT_REGISTRY)).toBe('Хрещений батько → №1 — заблокований, пошук не відбувся')
  // Проверка шерифа подписана по-прежнему.
  const check = play(n1(), act('prostitute_block', 10, 1), act('sheriff_check', 1, 8))
  const checked = journal(check, DEFAULT_REGISTRY)[0]!.entries.find((e) => e.kind === 'night_action' && e.actionId === 'sheriff_check')!
  expect(entryText('ru', checked, DEFAULT_REGISTRY)).toBe('Шериф → №8 — заблокирован, проверка не состоялась')
})

test('шаг знает, кто из его исполнителей заблокирован, — даже когда действие блоком не отменено', () => {
  const blockedIn = (s: Session, id: string) => stepOf(s, id).blockedActors
  const sheriff = play(n1(), act('prostitute_block', 10, 1))
  expect(blockedIn(sheriff, 'sheriff_check:1')).toEqual([1]); expect(blockedIn(sheriff, 'doctor_heal:4')).toEqual([]); expect(blockedIn(sheriff, 'mafia_shot')).toEqual([])
  // Рядовая мафия заблокирована: выстрел не отменён, но показать игроку блок надо.
  const soldier = play(n1(), act('prostitute_block', 10, 8))
  expect(stepOf(soldier, 'mafia_shot')).toMatchObject({ blocked: false, blockedActors: [8] })
  // Крёстный отец заблокирован: он исполнитель и выстрела, и поиска.
  const boss = play(n1(), act('prostitute_block', 10, 3))
  expect(stepOf(boss, 'mafia_shot')).toMatchObject({ blocked: true, blockedActors: [3] })
  expect(stepOf(boss, 'godfather_search:3')).toMatchObject({ blocked: false, blockedActors: [3] })
  // Мирный житель заблокирован — ни у одного шага исполнителей под блоком нет.
  expect(st(play(n1(), act('prostitute_block', 10, 5))).night!.steps.every((x) => x.blockedActors.length === 0)).toBe(true)
})
