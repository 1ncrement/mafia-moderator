import { DEFAULT_REGISTRY, deriveState, execute, journal, nightState, phaseOrder } from '../../src/engine'
import type { Command, PhaseRef, Session } from '../../src/engine'
import { act, attempt, customNight, game, play, playWith, st, TABLE_11 } from '../helpers'

// Приёмочный сценарий из раздела 8 спецификации, пройденный командами движка.
// Стол: №1 шериф, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка.

const day = (n: number): PhaseRef => ({ kind: 'day', n })
const night = (n: number): PhaseRef => ({ kind: 'night', n })
const speak = (seat: number): Command => ({ type: 'startSpeech', kind: 'speech', seat })
const nominate = (by: number, target: number): Command => ({ type: 'nominate', by, target })
const setVotes = (ballot: 1 | 2, candidate: number, count: number): Command => ({ type: 'setVotes', ballot, candidate, count })
const step = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!

test('полная партия на 11 игроков по приёмочному сценарию', () => {
  // Шаг 1: раздать, поменять роли двум номерам, начать День 1 с №5.
  let s = play(game(TABLE_11), { type: 'swapRoles', a: 2, b: 8 })
  expect(st(s).players[1]!.roleId).toBe('mafia'); expect(st(s).players[7]!.roleId).toBe('civilian')
  s = play(s, { type: 'startPhase', phase: day(1) }, { type: 'openCircle', first: 5 }, speak(5))
  expect(st(s).day).toMatchObject({ opener: 5, speaking: { seat: 5 } }); expect(st(s).day!.waiting).toHaveLength(10)
  for (const seat of [6, 7, 8, 9, 10, 11, 1, 2, 3, 4]) s = play(s, speak(seat))
  s = play(s, { type: 'endSpeech' })
  expect(st(s).day!.waiting).toEqual([]); expect(st(s).day!.spoken).toHaveLength(11)

  // Шаг 2: Ночь 1 — выстрел не в того, поиск шерифа, доктор лечит №4; утром правка выстрела.
  s = play(s, { type: 'startPhase', phase: night(1) }, act('mafia_shot', null, 6), act('godfather_search', 3, 5), act('doctor_heal', 4, 4))
  expect(step(s, 'godfather_search:3').answer).toEqual({ kind: 'found', found: false })
  expect(st(s).night!.outcome).toMatchObject({ deaths: [{ seat: 6, cause: 'shot' }], noAttack: null })
  s = play(s, { type: 'confirmNight', died: [6] })
  expect(st(s).phase).toEqual(day(2)); expect(st(s).players[5]!.status).toBe('out')
  s = play(s, { type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 9, phase: night(1) })
  expect(st(s).warnings).toContainEqual({ code: 'night_outcome_changed', night: 1, expected: [9] })
  expect(st(s).players[5]!.status).toBe('out')
  s = play(s, { type: 'acknowledgeNight', night: 1, apply: true })
  expect(st(s).players[8]).toMatchObject({ status: 'out', cause: 'shot', outPhase: night(1) })
  expect(st(s).players[5]!.status).toBe('alive'); expect(st(s).warnings).toEqual([])

  // Шаг 3: День 2 — балаган, круг с №5, выставлены 7, 3, 10, 11, 4.
  expect(st(s).step).toBe('balagan')
  s = play(s, { type: 'startSpeech', kind: 'balagan', seat: null }, { type: 'enterStep', step: 'speeches' }, { type: 'openCircle', first: 5 })
  expect(st(s).day!.previousOpener).toBe(5)
  s = play(s, speak(5), nominate(5, 7), speak(6), nominate(6, 3), speak(7), nominate(7, 10), speak(8), nominate(8, 11), speak(10), nominate(10, 4))
  s = play(s, speak(11), speak(1))                                  // №11 никого не выставил
  expect(attempt(s, nominate(1, 3))).toEqual({ ok: false, reason: 'already_nominated' })
  for (const seat of [2, 3, 4]) s = play(s, speak(seat))
  s = play(s, { type: 'endSpeech' })
  expect(st(s).day!.nominations.map((x) => x.target)).toEqual([7, 3, 10, 11, 4])
  expect(st(s).day!.waiting).toEqual([])
  s = play(s, { type: 'enterStep', step: 'defense' })
  expect(st(s).day!.defense.waiting).toEqual([7, 3, 10, 11, 4])
  for (const seat of [7, 3, 10, 11, 4]) s = play(s, { type: 'startSpeech', kind: 'defense', seat })
  s = play(s, { type: 'endSpeech' })
  expect(st(s).day!.defense).toEqual({ done: [7, 3, 10, 11, 4], waiting: [] })

  // Шаг 5: голосование — перебор запрещён, ничья двоих, переголосование, вторая ничья, выгнан один.
  s = play(s, { type: 'enterStep', step: 'vote' })
  expect(st(s).day!.ballots[0]!.voters).toBe(10)
  expect(attempt(s, setVotes(1, 7, 11))).toEqual({ ok: false, reason: 'votes_exceed' })
  s = play(s, setVotes(1, 7, 4), setVotes(1, 3, 1), setVotes(1, 10, 1), setVotes(1, 11, 4))
  expect(st(s).day!.ballots[0]).toMatchObject({ complete: true, remaining: 0, hint: { outcome: 'tie', seats: [7, 11] } })
  expect(st(s).day!.ballots[0]!.entries.at(-1)).toEqual({ candidate: 4, count: 0, auto: true })
  s = play(s, { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [7, 11] }, { type: 'enterStep', step: 'tiebreak' })
  expect(st(s).day!.tiebreak.waiting).toEqual([7, 11])
  s = play(s, { type: 'startSpeech', kind: 'tiebreak', seat: 7 }, { type: 'startSpeech', kind: 'tiebreak', seat: 11 }, { type: 'enterStep', step: 'revote' })
  expect(st(s).day!.ballots[1]).toMatchObject({ n: 2, candidates: [7, 11], voters: 8 })
  s = play(s, setVotes(2, 7, 4))
  expect(st(s).day!.ballots[1]).toMatchObject({ complete: true, hint: { outcome: 'tie', seats: [7, 11] } })
  s = play(s, { type: 'resolveVote', ballot: 2, outcome: 'eliminated', seats: [11] }, { type: 'enterStep', step: 'farewell' })
  expect(st(s).players[10]).toMatchObject({ status: 'out', cause: 'voted', outPhase: day(2) })
  expect(st(s).day!.farewell.waiting).toEqual([11])
  s = play(s, { type: 'startSpeech', kind: 'farewell', seat: 11 })
  expect(st(s).day!.speaking).toMatchObject({ kind: 'farewell', seat: 11 })

  // Шаг 6: Ночь 2 — повтор лечения №4 даёт предупреждение; заблокированный шериф без ответа.
  s = play(s, { type: 'startPhase', phase: night(2) })
  expect(step(s, 'doctor_heal:4').lastNight).toMatchObject({ recorded: true, target: 4 })
  expect(attempt(s, act('doctor_heal', 4, 4))).toEqual({ ok: false, reason: 'repeat_target' })
  s = play(s, act('mafia_shot', null, 5), act('godfather_search', 3, 7), act('prostitute_block', 10, 1), act('sheriff_check', 1, 3), act('doctor_heal', 4, 5))
  expect(step(s, 'sheriff_check:1').answer).toEqual({ kind: 'blocked' })
  expect(st(s).night!.outcome).toMatchObject({ deaths: [], noAttack: null })
  s = play(s, { type: 'confirmNight', died: [] })

  // Шаг 7: День 3 — выставлен один игрок, шериф: без голосования, выгнан.
  expect(st(s).phase).toEqual(day(3))
  s = play(s, nominate(5, 1))
  expect(st(s).day!.ballots[0]).toMatchObject({ complete: true, hint: { outcome: 'eliminated', seats: [1] } })
  s = play(s, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [1] })
  expect(st(s).players[0]).toMatchObject({ status: 'out', cause: 'voted', outPhase: day(3) })
  expect(st(s).day!.farewell.waiting).toEqual([1])

  // Шаг 8: Ночь 3 — шаг шерифа серый; блок крёстного отца отменяет выстрел. День 4 без кандидатов.
  s = play(s, { type: 'startPhase', phase: night(3) })
  expect(st(s).night!.steps.find((x) => x.actionId === 'sheriff_check')).toMatchObject({ id: 'sheriff_check', grey: true })
  expect(attempt(s, act('sheriff_check', null, 2))).toEqual({ ok: false, reason: 'step_grey' })
  s = play(s, act('mafia_shot', null, 5), act('prostitute_block', 10, 3))
  expect(st(s).night!.outcome).toMatchObject({ deaths: [], noAttack: 'blocked' })
  s = play(s, { type: 'confirmNight', died: [] })
  expect(st(s).phase).toEqual(day(4)); expect(st(s).day!.ballots).toEqual([])

  // Шаг 9: случайно отметить выбывшим и вернуть; обмен ролями посреди игры.
  const before = st(s).counts.alive
  s = play(s, { type: 'setStatus', seat: 7, status: 'out', cause: 'shot' })
  expect(st(s).counts.alive).toBe(before - 1)
  s = play(s, { type: 'setStatus', seat: 7, status: 'alive' })
  expect(st(s).counts.alive).toBe(before)
  s = play(s, { type: 'swapRoles', a: 2, b: 8 })
  expect(st(s).players[7]!.roleId).toBe('mafia'); expect(st(s).warnings).toEqual([])

  // Шаг 11: остановить игру, победитель, журнал от Дня 4 до распределения.
  s = play(s, { type: 'finishGame', winner: 'black' })
  expect(st(s).finished).toEqual({ winner: 'black' })
  const groups = journal(s, DEFAULT_REGISTRY)
  expect(groups.map((g) => phaseOrder(g.phase))).toEqual([7, 6, 5, 4, 3, 2, 1, 0])
  expect(groups[0]!.entries.map((e) => e.kind)).toEqual(['status', 'status', 'swap', 'finish'])
  expect(groups[3]!.entries.find((e) => e.kind === 'night_action' && e.actionId === 'sheriff_check')).toMatchObject({ answer: { kind: 'blocked' } })
  expect(groups[4]!.entries.filter((e) => e.kind === 'vote_result')).toMatchObject([{ outcome: 'tie', seats: [7, 11] }, { outcome: 'eliminated', seats: [11] }])
  expect(groups[4]!.entries.find((e) => e.kind === 'votes')).toMatchObject({ ballot: 1, voters: 10, entries: [
    { candidate: 7, count: 4 }, { candidate: 3, count: 1 }, { candidate: 10, count: 1 }, { candidate: 11, count: 4 }, { candidate: 4, count: 0 }] })
  expect(groups[5]!.entries.at(-1)).toMatchObject({ kind: 'night_result', died: [9] })
})

// Приёмочный сценарий дополнения «Свои роли» (раздел 8), шаги, которые выражаются командами движка.
// Стол: №1 шериф, №3 крёстный отец, №4 доктор, №6 журналист (красный, ходит ночью), №8 мафия,
// №9 маньяк (чёрный, ночью спит), №10 проститутка.
test('партия со своими ролями: запись журналиста, блок, проверка маньяка, обмен ролей, журнал', () => {
  const { s: start, registry: R } = customNight()
  const go = (s: Session, ...cmds: Command[]) => playWith(R, s, ...cmds)
  const now = (s: Session) => deriveState(s, R)
  const stepOf = (s: Session, id: string) => now(s).night!.steps.find((x) => x.id === id)!
  expect(now(start).counts.bySide).toEqual({ black: 4, red: 7 })

  // Шаг 5: Ночь 1 — шаг журналиста идёт после доктора; запись есть, подсказка итога та же, что без неё.
  let s = go(start, act('mafia_shot', null, 7), act('doctor_heal', 4, 2))
  const hint = now(s).night!.outcome
  expect(hint).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], noAttack: null })
  expect(now(s).night!.steps.map((x) => x.actionId).slice(-2)).toEqual(['doctor_heal', 'act_custom_j'])
  s = go(s, act('act_custom_j', 6, 9))
  expect(now(s).night!.outcome).toEqual(hint)
  expect(stepOf(s, 'act_custom_j:6')).toMatchObject({ effect: 'note', recorded: true, target: 9, blocked: false })
  s = go(s, { type: 'confirmNight', died: [7] })
  expect(now(s).phase).toEqual(day(2)); expect(now(s).counts.bySide).toEqual({ black: 4, red: 6 }); expect(now(s).warnings).toEqual([])

  // Шаг 6: Ночь 2 — проститутка блокирует журналиста (запись всё равно делается), шериф видит маньяка чёрным.
  s = go(s, { type: 'startPhase', phase: night(2) })
  expect(stepOf(s, 'act_custom_j:6').lastNight).toEqual({ recorded: true, target: 9 })
  s = go(s, act('prostitute_block', 10, 6), act('sheriff_check', 1, 9), act('act_custom_j', 6, 9))   // та же цель — без предупреждения
  expect(stepOf(s, 'act_custom_j:6')).toMatchObject({ blocked: true, recorded: true, target: 9 })
  expect(stepOf(s, 'sheriff_check:1').answer).toEqual({ kind: 'side', side: 'black' })
  expect(now(s).night!.outcome).toMatchObject({ deaths: [], noAttack: 'none' })
  s = go(s, { type: 'confirmNight', died: [] })

  // День 3: своя роль — обычный игрок. Маньяк выставлен один и выгнан: чёрных на одного меньше.
  expect(now(s).phase).toEqual(day(3))
  s = go(s, { type: 'nominate', by: 6, target: 9 })
  expect(now(s).day!.ballots[0]).toMatchObject({ voters: 10, hint: { outcome: 'eliminated', seats: [9] } })
  s = go(s, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [9] })
  expect(now(s).counts.bySide).toEqual({ black: 3, red: 6 })

  // Обмен ролей с носителем своей роли: журналистом становится №2, ночные записи идут за ролью.
  s = go(s, { type: 'swapRoles', a: 6, b: 2 })
  expect(now(s).players[1]!.roleId).toBe('custom_j'); expect(now(s).players[5]!.roleId).toBe('civilian')
  expect(nightState(s, R, 2).steps.at(-1)).toMatchObject({ id: 'act_custom_j:2', recorded: true, target: 9 })
  expect(now(s).warnings).toEqual([])

  // Ночь 3: единственный носитель выбыл — шаг остаётся серым, записать в него нельзя.
  s = go(s, { type: 'startPhase', phase: night(3) }, { type: 'setStatus', seat: 2, status: 'out', cause: 'shot' })
  expect(now(s).night!.steps.at(-1)).toMatchObject({ id: 'act_custom_j', grey: true, recorded: false })
  expect(execute(s, act('act_custom_j', null, 5), R)).toEqual({ ok: false, reason: 'step_grey' })

  // Шаг 8: остановка игры; журнал от Ночи 3 до распределения называет записи своей роли.
  s = go(s, { type: 'finishGame', winner: 'red' })
  expect(now(s).finished).toEqual({ winner: 'red' })
  const groups = journal(s, R)
  expect(groups.map((g) => phaseOrder(g.phase))).toEqual([6, 5, 4, 3, 2, 1, 0])
  const noted = (order: number) => groups.find((g) => phaseOrder(g.phase) === order)!.entries.filter((e) => e.kind === 'night_action' && e.actionId === 'act_custom_j')
  expect(noted(2)).toMatchObject([{ performerRole: 'custom_j', actor: 2, target: 9 }])
  expect(noted(4)).toMatchObject([{ performerRole: 'custom_j', actor: 2, target: 9 }])
  expect(noted(6)).toEqual([])
  expect(groups.at(-1)!.entries[0]).toMatchObject({ kind: 'deal', counts: { custom_j: 1, custom_m: 1, civilian: 4 } })
  expect(groups.find((g) => phaseOrder(g.phase) === 2)!.entries.at(-1)).toMatchObject({ kind: 'night_result', died: [7] })
})
