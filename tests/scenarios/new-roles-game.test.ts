import { entryText } from '../../src/app/i18n'
import { applyUndo, DEFAULT_REGISTRY, hauntCount, journal } from '../../src/engine'
import type { Command, PhaseRef, Session } from '../../src/engine'
import { act, attempt, game, play, st } from '../helpers'

// Партия со всеми пятью новыми ролями, пройденная командами движка (дополнение от 2026-11-21, раздел 5).
// Стол: №1 шериф, №2 бронежилет, №3 мирный, №4 мирный, №5 доктор, №6 крёстный отец, №7 мирный, №8 мясник,
// №9 охранник, №10 маньяк, №11 журналист, №12 проститутка.
const TABLE = 'S bulletproof c c D G c butcher bodyguard maniac journalist P'
const R = DEFAULT_REGISTRY
const day = (n: number): PhaseRef => ({ kind: 'day', n })
const night = (n: number): PhaseRef => ({ kind: 'night', n })
const speak = (seat: number): Command => ({ type: 'startSpeech', kind: 'speech', seat })
const step = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!
const lines = (s: Session, phase: PhaseRef) =>
  journal(s, R).find((g) => g.phase.kind === phase.kind && (g.phase.kind === 'deal' || (phase.kind !== 'deal' && g.phase.n === phase.n)))!.entries.map((e) => entryText('ru', e, R))
const undo = (s: Session): Session => ({ ...s, log: applyUndo(s.log, s.undo.at(-1)!), undo: s.undo.slice(0, -1) })

test('партия со всеми новыми ролями: две ночи с несколькими событиями, день жертвы маньяка, победа одиночки', () => {
  let s = play(game(TABLE, { roleOptions: { maniac_no_repeat: false } }), { type: 'startPhase', phase: day(1) }, { type: 'startPhase', phase: night(1) })
  expect(st(s).counts.bySide).toEqual({ black: 2, red: 8, solo_butcher: 1, solo_maniac: 1 }); expect(st(s).endHint).toBeNull()
  // Порядок ночи из дополнения: (проститутка) → мафия → крёстный отец → мясник → маньяк → шериф → журналист → доктор → охранник.
  expect(st(s).night!.steps.map((x) => x.id)).toEqual(['mafia_shot', 'godfather_search:6', 'prostitute_block:12', 'butcher_kill:8', 'maniac_visit:10',
    'sheriff_check:1', 'journalist_compare:11', 'doctor_heal:5', 'bodyguard_guard:9'])

  // ── Ночь 1: два нападения, первый визит, лечение «в пустую», блок шерифа ──
  s = play(s, act('prostitute_block', 12, 1), act('mafia_shot', null, 7), act('godfather_search', 6, 1), act('butcher_kill', 8, 3), act('maniac_visit', 10, 4),
    act('sheriff_check', 1, 8), { type: 'recordNightAction', actionId: 'journalist_compare', actor: 11, target: 6, target2: 8 },
    act('doctor_heal', 5, 11), act('bodyguard_guard', 9, 5))
  expect(st(s).night!.outcome).toEqual({
    deaths: [{ seat: 3, cause: 'slain' }, { seat: 7, cause: 'shot' }],
    notes: [{ seat: 4, kind: 'silenced' }, { seat: 11, kind: 'healed' }], blocked: [1], healed: [11], noAttack: null,
  })
  expect(step(s, 'sheriff_check:1').answer).toEqual({ kind: 'blocked' }); expect(step(s, 'godfather_search:6').answer).toEqual({ kind: 'found', found: true })
  expect(step(s, 'journalist_compare:11').answer).toEqual({ kind: 'same', same: false })
  expect(st(s).night!.complete).toBe(true)
  s = play(s, { type: 'confirmNight', died: [3, 7] })
  expect(st(s).morning).toEqual({ deaths: [3, 7], farewell: [], spared: [], silenced: [4], silence: { noNominate: false, noVote: false }, penalized: [], announced: false })
  expect(lines(s, night(1))).toEqual(expect.arrayContaining(['Мясник → №3', 'Маньяк → №4 — первый визит', 'Журналист: №6 и №8 — разные стороны',
    'Шериф → №8 — заблокирован, проверка не состоялась', 'Охранник → №5', 'Итог ночи: выбыли №3 и №7']))
  s = play(s, { type: 'announceMorning' })

  // ── День 2: жертва маньяка молчит, но выставляет; выгнана проститутка ──
  s = play(s, { type: 'enterStep', step: 'speeches' }, { type: 'openCircle', first: 2 }, speak(2), { type: 'startSpeech', kind: 'silent', seat: 4 },
    { type: 'nominate', by: 4, target: 12 }, speak(5))
  expect(st(s).day).toMatchObject({ silenced: [4], spoken: [2, 4], speaking: { kind: 'speech', seat: 5 } })
  s = play(s, { type: 'endSpeech' }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [12] }, { type: 'startPhase', phase: night(2) })
  expect(st(s).players[11]).toMatchObject({ status: 'out', cause: 'voted' })

  // ── Ночь 2 (по макету итога): мафия, мясник, охранник, жилет, повторный визит маньяка, лечение ──
  expect(step(s, 'journalist_compare:11')).toMatchObject({ used: [6, 8], resting: false }); expect(hauntCount(s, R, 2, 4)).toBe(1)
  expect(attempt(s, act('bodyguard_guard', 9, 5))).toEqual({ ok: false, reason: 'repeat_target' })
  s = play(s, act('mafia_shot', null, 5), act('butcher_kill', 8, 2), act('maniac_visit', 10, 4), act('doctor_heal', 5, 4),
    { type: 'recordNightAction', actionId: 'bodyguard_guard', actor: 9, target: 5, force: true },
    { type: 'recordNightAction', actionId: 'journalist_compare', actor: 11, target: 1, target2: 2 })
  const hint = {
    deaths: [{ seat: 9, cause: 'guard', guarded: 5 }],
    notes: [{ seat: 2, kind: 'vest', cause: 'slain' }, { seat: 4, kind: 'healed', cause: 'haunted' }, { seat: 4, kind: 'silenced', cause: 'haunted' }],
    blocked: [], healed: [4], noAttack: null,
  }
  expect(st(s).night!.outcome).toEqual(hint)
  expect(step(s, 'journalist_compare:11').answer).toEqual({ kind: 'same', same: true })
  const before = s
  s = play(s, { type: 'confirmNight', died: [9] })
  expect(st(s).players[8]).toMatchObject({ status: 'out', cause: 'guard', outPhase: night(2) }); expect(st(s).players[1]).toMatchObject({ status: 'alive', vest: 'used' })
  // Охранник прощается, хотя правило «прощание после ночной смерти» выключено; спасённый жилетом и молчащий названы.
  expect(st(s).morning).toMatchObject({ deaths: [9], farewell: [9], spared: [2], silenced: [4] }); expect(st(s).step).toBe('night_farewell')
  expect(st(s).warnings).toEqual([])
  // «Отменить» подтверждение возвращает всё разом: ночь, охранника, жилет и молчание.
  const undone = undo(s)
  expect(st(undone).phase).toEqual(night(2)); expect(st(undone).players[8]!.status).toBe('alive'); expect(st(undone).players[1]!.vest).toBe('intact')
  expect(st(undone).day).toBeNull(); expect(st(undone).night!.outcome).toEqual(hint); expect(undone.log).toEqual(before.log)

  // Правка прошлой ночи статусы и жилет молча не меняет: мясник «на самом деле» бил №1.
  const edited = play(s, { type: 'recordNightAction', actionId: 'butcher_kill', actor: 8, target: 1, phase: night(2) })
  expect(st(edited).warnings).toEqual([{ code: 'night_outcome_changed', night: 2, expected: [1, 9] }])
  expect(st(edited).players[0]!.status).toBe('alive'); expect(st(edited).players[1]!.vest).toBe('used')
  const fixed = play(edited, { type: 'acknowledgeNight', night: 2, apply: true })
  expect(st(fixed).players[0]).toMatchObject({ status: 'out', cause: 'slain' }); expect(st(fixed).players[1]!.vest).toBe('intact'); expect(st(fixed).morning!.spared).toEqual([])

  // ── День 3: прощание охранника, жертва снова молчит, бронежилет (жилет снят) выгнан по-настоящему ──
  s = play(s, { type: 'announceMorning' }, { type: 'startSpeech', kind: 'farewell', seat: 9 }, { type: 'endSpeech' })
  expect(st(s).day!.nightFarewell).toEqual({ done: [9], waiting: [] }); expect(st(s).day!.silenced).toEqual([4])
  s = play(s, { type: 'nominate', by: 1, target: 2 }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [2] })
  expect(st(s).players[1]).toMatchObject({ status: 'out', cause: 'voted' }); expect(st(s).day).toMatchObject({ spared: [], farewell: { waiting: [2] } })

  // ── Ночь 3: третий визит маньяка убивает; журналист не может взять уже проверенных ──
  s = play(s, { type: 'startPhase', phase: night(3) })
  expect(step(s, 'journalist_compare:11').used).toEqual([1, 2, 6, 8]); expect(step(s, 'bodyguard_guard')).toMatchObject({ grey: true })
  expect(hauntCount(s, R, 3, 4)).toBe(2)
  s = play(s, act('maniac_visit', 10, 4))
  expect(st(s).night!.outcome.deaths).toEqual([{ seat: 4, cause: 'haunted' }])
  s = play(s, { type: 'confirmNight', died: [4] })
  expect(st(s).players[3]).toMatchObject({ status: 'out', cause: 'haunted' }); expect(st(s).day!.silenced).toEqual([])

  // ── Конец: чёрных не меньше остальных, но одиночки в игре — подсказки нет; побеждает маньяк ──
  s = play(s, { type: 'announceMorning' }, { type: 'setStatus', seat: 1, status: 'out', cause: 'voted' }, { type: 'setStatus', seat: 5, status: 'out', cause: 'voted' },
    { type: 'setStatus', seat: 11, status: 'out', cause: 'voted' })
  expect(st(s).counts.bySide).toEqual({ black: 1, red: 0, solo_butcher: 1, solo_maniac: 1 }); expect(st(s).endHint).toBeNull()
  s = play(s, { type: 'finishGame', winner: 'solo_maniac' })
  expect(st(s).finished).toEqual({ winner: 'solo_maniac' }); expect(lines(s, day(4)).at(-1)).toBe('Игра остановлена: победа маньяка')
  expect(st(s).warnings).toEqual([])
  expect(lines(s, night(2))).toEqual(expect.arrayContaining(['Мясник → №2', 'Маньяк → №4 — повторный визит', 'Журналист: №1 и №2 — одна сторона',
    '№2 был в бронежилете — остаётся', 'Итог ночи: №9 погиб, закрыв собой игрока']))
})
