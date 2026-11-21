import { entryText } from '../../src/app/i18n'
import { applyUndo, DEFAULT_REGISTRY, DEFAULT_RULES, journal, nightState, registryFor } from '../../src/engine'
import type { Session, SessionConfig } from '../../src/engine'
import { act, attempt, game, JOURNALIST, play, st, toDay } from '../helpers'

// Охранник (дополнение 5.5, пункты 3, 4 и 8; 5.7). Стол: №1 шериф, №2 охранник, №3 крёстный отец, №4 доктор,
// №5 мясник, №8 мафия, №10 проститутка.
const TABLE = 'S bodyguard G D butcher c c M c P c'
const N1 = { kind: 'night', n: 1 } as const
const night1 = (config?: Partial<SessionConfig>, table = TABLE): Session => play(toDay(game(table, config), 1), { type: 'startPhase', phase: N1 })
const out = (s: Session) => st(s).night!.outcome
const step = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!
const guard = (target: number | null) => act('bodyguard_guard', 2, target)

test('охранник просыпается последним — после доктора и после своих ролей ведущего', () => {
  expect(st(night1()).night!.steps.map((x) => x.id).at(-1)).toBe('bodyguard_guard:2')
  const registry = registryFor(DEFAULT_REGISTRY, [JOURNALIST], DEFAULT_RULES)
  const order = [...registry.nightActions].sort((a, b) => a.order - b.order).map((a) => a.id)
  expect(order.slice(-3)).toEqual(['doctor_heal', 'act_custom_j', 'bodyguard_guard']); expect(order[0]).toBe('prostitute_block')
})
test('нападение на подзащитного переходит на охранника: выбывает он, причина — «защита», подзащитный назван', () => {
  expect(out(play(night1(), act('mafia_shot', null, 7), guard(7))))
    .toEqual({ deaths: [{ seat: 2, cause: 'guard', guarded: 7 }], notes: [], blocked: [], healed: [], noAttack: null })
  // Удар мясника — так же; два нападения на подзащитного — одна смерть охранника.
  expect(out(play(night1(), act('butcher_kill', 5, 7), guard(7))).deaths).toEqual([{ seat: 2, cause: 'guard', guarded: 7 }])
  expect(out(play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 5, 7), guard(7))).deaths).toEqual([{ seat: 2, cause: 'guard', guarded: 7 }])
  // Нападение на другого игрока охранника не касается.
  expect(out(play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 5, 9), guard(7))).deaths)
    .toEqual([{ seat: 2, cause: 'guard', guarded: 7 }, { seat: 9, cause: 'slain' }])
  // Никто не напал — защита ничего не меняет.
  expect(out(play(night1(), guard(7)))).toMatchObject({ deaths: [], notes: [], noAttack: 'none' })
})
test('доктор лечил самого охранника — он закрыл подзащитного и выжил: никто не выбывает', () => {
  expect(out(play(night1(), act('mafia_shot', null, 7), guard(7), act('doctor_heal', 4, 2))))
    .toEqual({ deaths: [], notes: [{ seat: 2, kind: 'healed', cause: 'guard' }], blocked: [], healed: [2], noAttack: null })
})
test('доктор срабатывает раньше охранника: вылеченный подзащитный спасён доктором, охранник жив', () => {
  expect(out(play(night1(), act('mafia_shot', null, 7), guard(7), act('doctor_heal', 4, 7))))
    .toEqual({ deaths: [], notes: [{ seat: 7, kind: 'healed', cause: 'shot' }], blocked: [], healed: [7], noAttack: null })
})
test('заблокированный охранник не защищает', () => {
  const s = play(night1(), act('mafia_shot', null, 7), guard(7), act('prostitute_block', 10, 2))
  expect(out(s).deaths).toEqual([{ seat: 7, cause: 'shot' }]); expect(step(s, 'bodyguard_guard:2')).toMatchObject({ blocked: true, blockedActors: [2] })
})
test('в охранника стреляют напрямую — обычная смерть, без «защиты»', () => {
  expect(out(play(night1(), act('mafia_shot', null, 2), guard(7))).deaths).toEqual([{ seat: 2, cause: 'shot' }])
  // И напрямую, и вместо подзащитного: он погиб, закрыв собой.
  expect(out(play(night1(), act('mafia_shot', null, 2), act('butcher_kill', 5, 7), guard(7))).deaths).toEqual([{ seat: 2, cause: 'guard', guarded: 7 }])
})
test('себя охранник выбрать не может: на шаге его нет среди целей, запись отклоняется', () => {
  expect(step(night1(), 'bodyguard_guard:2').allowed).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  expect(attempt(night1(), guard(2))).toEqual({ ok: false, reason: 'target_not_allowed' })
  expect(attempt(night1(), guard(null)).ok).toBe(true)
  // Остальным ролям себя выбирать можно, как раньше.
  expect(step(night1(), 'doctor_heal:4').allowed).toContain(4); expect(attempt(night1(), act('doctor_heal', 4, 4)).ok).toBe(true)
})
test('одного и того же две ночи подряд — предупреждение, «Записать всё равно» записывает; через ночь можно', () => {
  let s = play(night1(), guard(7), { type: 'confirmNight', died: [] }, { type: 'startPhase', phase: { kind: 'night', n: 2 } })
  expect(step(s, 'bodyguard_guard:2').lastNight).toMatchObject({ recorded: true, target: 7 })
  expect(attempt(s, guard(7))).toEqual({ ok: false, reason: 'repeat_target' })
  const forced = play(s, act('mafia_shot', null, 7), { type: 'recordNightAction', actionId: 'bodyguard_guard', actor: 2, target: 7, force: true })
  expect(out(forced).deaths).toEqual([{ seat: 2, cause: 'guard', guarded: 7 }])
  s = play(s, guard(6), { type: 'confirmNight', died: [] }, { type: 'startPhase', phase: { kind: 'night', n: 3 } })
  expect(attempt(s, guard(7)).ok).toBe(true)
})
test('охранник, погибший вместо подзащитного, прощается всегда — и при выключенном правиле', () => {
  const s = play(night1(), act('mafia_shot', null, 7), act('butcher_kill', 5, 9), guard(7), { type: 'confirmNight', died: [2, 9] })
  expect(s.config.rules.farewellAfterNight).toBe(false)
  expect(st(s).players[1]).toMatchObject({ status: 'out', cause: 'guard', outPhase: N1 })
  // Убитый мясником без правила не прощается; охранник — прощается.
  expect(st(s).morning).toMatchObject({ deaths: [2, 9], farewell: [2] })
  expect(st(s).day!.nightFarewell).toEqual({ done: [], waiting: [2] }); expect(st(s).step).toBe('night_farewell')
  expect(attempt(s, { type: 'startSpeech', kind: 'farewell', seat: 2 }).ok).toBe(true)
  // Отмена возвращает и охранника, и ночь.
  expect(st({ ...s, log: applyUndo(s.log, s.undo.at(-1)!) }).players[1]!.status).toBe('alive')
  // Правило включено — прощаются оба, по возрастанию номеров.
  const both = play(night1({ rules: { ...DEFAULT_RULES, farewellAfterNight: true } }), act('mafia_shot', null, 7), act('butcher_kill', 5, 9), guard(7), { type: 'confirmNight', died: [2, 9] })
  expect(st(both).day!.nightFarewell.waiting).toEqual([2, 9])
})
test('охранник, в которого стреляли напрямую, гарантированного прощания не имеет', () => {
  const s = play(night1(), act('mafia_shot', null, 2), guard(7), { type: 'confirmNight', died: [2] })
  expect(st(s).players[1]).toMatchObject({ status: 'out', cause: 'shot' })
  expect(st(s).morning).toMatchObject({ deaths: [2], farewell: [] }); expect(st(s).step).not.toBe('night_farewell')
  // Ведущий снял отметку с погибшего охранника — прощаться некому.
  const kept = play(night1(), act('mafia_shot', null, 7), guard(7), { type: 'confirmNight', died: [] })
  expect(st(kept).morning).toMatchObject({ deaths: [], farewell: [] })
})
test('охранник выбыл вручную посреди ночи: его шаг серый, итог пересчитан, ведущий остаётся на шаге', () => {
  let s = play(night1(), act('mafia_shot', null, 7), guard(7), { type: 'enterStep', step: 'bodyguard_guard:2' })
  expect(out(s).deaths).toEqual([{ seat: 2, cause: 'guard', guarded: 7 }])
  s = play(s, { type: 'setStatus', seat: 2, status: 'out', cause: 'shot' })
  expect(st(s).night!.steps.at(-1)).toMatchObject({ id: 'bodyguard_guard', grey: true, recorded: false }); expect(st(s).step).toBe('bodyguard_guard')
  expect(out(s).deaths).toEqual([{ seat: 7, cause: 'shot' }])
  // Вернули в игру — запись и защита снова на месте.
  s = play(s, { type: 'setStatus', seat: 2, status: 'alive' })
  expect(out(s).deaths).toEqual([{ seat: 2, cause: 'guard', guarded: 7 }]); expect(st(s).step).toBe('bodyguard_guard:2')
  // Подзащитный выбыл вручную — защищать некого, нападение на него ничего не даёт.
  s = play(s, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' })
  expect(out(s).deaths).toEqual([])
})
test('правка прошлой ночи: защита, записанная задним числом, меняет подсказку и предлагает исправить статусы', () => {
  let s = play(night1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] })
  expect(st(s).warnings).toEqual([])
  s = play(s, { type: 'recordNightAction', actionId: 'bodyguard_guard', actor: 2, target: 7, phase: N1 })
  expect(st(s).warnings).toEqual([{ code: 'night_outcome_changed', night: 1, expected: [2] }])
  const fixed = play(s, { type: 'acknowledgeNight', night: 1, apply: true })
  expect(st(fixed).players[6]!.status).toBe('alive'); expect(st(fixed).players[1]).toMatchObject({ status: 'out', cause: 'guard', outPhase: N1 })
  expect(st(fixed).morning!.farewell).toEqual([2]); expect(nightState(fixed, DEFAULT_REGISTRY, 1).confirmed).toEqual({ hinted: [2], chosen: [2] })
})
test('журнал: запись охранника и итог «погиб, закрыв собой»', () => {
  const s = play(night1(), act('mafia_shot', null, 7), guard(7), { type: 'confirmNight', died: [2] })
  const texts = (lang: 'ru' | 'uk') => journal(s, DEFAULT_REGISTRY).find((g) => g.phase.kind === 'night')!.entries.map((e) => entryText(lang, e, DEFAULT_REGISTRY))
  expect(texts('ru')).toContain('Охранник → №7'); expect(texts('ru')).toContain('Итог ночи: №2 погиб, закрыв собой игрока')
  expect(texts('uk')).toContain('Охоронець → №7')
})
