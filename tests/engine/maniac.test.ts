import { entryText } from '../../src/app/i18n'
import { applyUndo, DEFAULT_REGISTRY, hauntCount, journal } from '../../src/engine'
import type { Command, Session, SessionConfig } from '../../src/engine'
import { act, attempt, game, play, st, toDay } from '../helpers'

// Маньяк (дополнение 5.5 пп. 2, 5, 7; 5.7; 5.8). Стол: №1 шериф, №2 маньяк, №3 крёстный отец, №4 доктор, №5 бронежилет,
// №6 охранник, №8 мафия, №10 проститутка.
const TABLE = 'S maniac G D bulletproof bodyguard c M c P c'
const R = DEFAULT_REGISTRY
const N = (n: number) => ({ kind: 'night', n }) as const
const night1 = (config?: Partial<SessionConfig>): Session => play(toDay(game(TABLE, config), 1), { type: 'startPhase', phase: N(1) })
const out = (s: Session) => st(s).night!.outcome
const step = (s: Session, id: string) => st(s).night!.steps.find((x) => x.id === id)!
const visit = (target: number | null, force = false): Command => ({ type: 'recordNightAction', actionId: 'maniac_visit', actor: 2, target, ...(force ? { force: true as const } : {}) })
const confirm = (...died: number[]): Command => ({ type: 'confirmNight', died })
/** Подтвердить ночь, объявить утро, начать следующую ночь. */
const nextNight = (s: Session, ...died: number[]): Session => {
  const day = play(s, confirm(...died), { type: 'announceMorning' })
  return play(day, { type: 'startPhase', phase: N(st(day).phase!.kind === 'day' ? (st(day).phase as { n: number }).n : 0) })
}
const speak = (seat: number): Command => ({ type: 'startSpeech', kind: 'speech', seat })

// ── Ночь ────────────────────────────────────────────────────────────────────

test('маньяк просыпается после мясника и перед шерифом', () => {
  expect(st(night1()).night!.steps.map((x) => x.id))
    .toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'maniac_visit:2', 'sheriff_check:1', 'doctor_heal:4', 'bodyguard_guard:6'])
})
test('первый визит: жертва остаётся в игре — заметка «молчит», нападения нет', () => {
  const s = play(night1(), visit(7))
  expect(out(s)).toEqual({ deaths: [], notes: [{ seat: 7, kind: 'silenced' }], blocked: [], healed: [], noAttack: 'none' })
  expect(step(s, 'maniac_visit:2').answer).toEqual({ kind: 'visit', lethal: false }); expect(hauntCount(s, R, 1, 7)).toBe(0)
})
test('второй визит к тому же игроку убивает: причина — «визит»', () => {
  const s = play(nextNight(play(night1(), visit(7))), visit(7, true))
  expect(hauntCount(s, R, 2, 7)).toBe(1)
  expect(out(s)).toEqual({ deaths: [{ seat: 7, cause: 'haunted' }], notes: [], blocked: [], healed: [], noAttack: null })
  expect(step(s, 'maniac_visit:2').answer).toEqual({ kind: 'visit', lethal: true })
  // Второй визит не обязательно подряд: между ними маньяк ходил к другому.
  const later = play(nextNight(play(nextNight(play(night1(), visit(7))), visit(9))), visit(7))
  expect(out(later).deaths).toEqual([{ seat: 7, cause: 'haunted' }]); expect(out(later).notes).toEqual([])
})
test('доктор и охранник спасают от второго визита; спасённый всё равно молчит; третий визит снова убивает', () => {
  const second = nextNight(play(night1(), visit(7)))
  const healed = play(second, visit(7, true), act('doctor_heal', 4, 7))
  expect(out(healed)).toMatchObject({ deaths: [], notes: [{ seat: 7, kind: 'healed', cause: 'haunted' }, { seat: 7, kind: 'silenced', cause: 'haunted' }], noAttack: null })
  const guarded = play(second, visit(7, true), act('bodyguard_guard', 6, 7))
  expect(out(guarded)).toMatchObject({ deaths: [{ seat: 6, cause: 'guard', guarded: 7 }], notes: [{ seat: 7, kind: 'silenced', cause: 'haunted' }] })
  // Третий визит после спасения: счётчик вырос, визит снова смертелен.
  const third = play(nextNight(healed), visit(7, true))
  expect(hauntCount(third, R, 3, 7)).toBe(2); expect(out(third).deaths).toEqual([{ seat: 7, cause: 'haunted' }])
})
test('проститутка заблокировала маньяка — визита не было: жертва не молчит, счётчик не растёт', () => {
  const blocked = play(night1(), visit(7), act('prostitute_block', 10, 2))
  expect(out(blocked)).toMatchObject({ deaths: [], notes: [], noAttack: 'none', blocked: [2] })
  expect(step(blocked, 'maniac_visit:2')).toMatchObject({ blocked: true }); expect(step(blocked, 'maniac_visit:2').answer).toBeUndefined()
  const day = play(blocked, confirm())
  expect(st(day).day!.silenced).toEqual([]); expect(st(day).morning!.silenced).toEqual([])
  // Следующий визит к тому же игроку — первый.
  const next = play(nextNight(blocked), visit(7, true))
  expect(hauntCount(next, R, 2, 7)).toBe(0); expect(out(next)).toMatchObject({ deaths: [], notes: [{ seat: 7, kind: 'silenced' }] })
  // Заблокированный второй визит не убивает и «нападавший заблокирован» объясняет, почему.
  const second = play(nextNight(play(night1(), visit(7))), visit(7, true), act('prostitute_block', 10, 2))
  expect(out(second)).toMatchObject({ deaths: [], notes: [], noAttack: 'blocked' })
})
test('жилет принимает второй визит; когда жилет снят, счётчик визитов к этому игроку обнуляется', () => {
  // Визит, который сам снял жилет, в новый счёт не входит: по словам заказчика, после жилета маньяку нужно прийти ещё два раза.
  let s = play(nextNight(play(night1(), visit(5))), visit(5, true))
  expect(out(s)).toMatchObject({ deaths: [], notes: [{ seat: 5, kind: 'silenced', cause: 'haunted' }, { seat: 5, kind: 'vest', cause: 'haunted' }], noAttack: null })
  s = nextNight(s)
  expect(st(s).players[4]).toMatchObject({ status: 'alive', vest: 'used' }); expect(hauntCount(s, R, 3, 5)).toBe(0)
  // Первый визит после снятия жилета — жертва только молчит; второй — убивает.
  s = play(s, visit(5, true))
  expect(out(s).deaths).toEqual([])
  s = nextNight(s)
  expect(hauntCount(s, R, 4, 5)).toBe(1)
  expect(out(play(s, visit(5, true))).deaths).toEqual([{ seat: 5, cause: 'haunted' }])
  // Жилет снят не маньяком (выстрел мафии): прежний визит обнулён — следующий визит снова первый.
  let shot = play(nextNight(play(night1(), visit(5))), act('mafia_shot', null, 5), visit(9))
  expect(out(shot).notes).toContainEqual({ seat: 5, kind: 'vest', cause: 'shot' })
  shot = nextNight(shot)
  expect(hauntCount(shot, R, 3, 5)).toBe(0)
  expect(out(play(shot, visit(5))).deaths).toEqual([]); expect(out(play(shot, visit(5))).notes).toEqual([{ seat: 5, kind: 'silenced' }])
  // Жилет снят голосованием днём — то же самое.
  let voted = play(night1(), visit(5), confirm(), { type: 'announceMorning' }, { type: 'nominate', by: 1, target: 5 },
    { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [5] }, { type: 'startPhase', phase: N(2) })
  expect(st(voted).players[4]).toMatchObject({ status: 'alive', vest: 'used' }); expect(hauntCount(voted, R, 2, 5)).toBe(0)
  voted = play(voted, visit(5, true))
  expect(out(voted)).toMatchObject({ deaths: [], notes: [{ seat: 5, kind: 'silenced' }] })
})
test('визит не отменяет ночное действие жертвы', () => {
  const s = play(night1(), visit(4), act('mafia_shot', null, 7), act('doctor_heal', 4, 7))
  expect(out(s)).toMatchObject({ deaths: [], notes: [{ seat: 4, kind: 'silenced' }, { seat: 7, kind: 'healed', cause: 'shot' }] })
  expect(step(s, 'doctor_heal:4')).toMatchObject({ blocked: false, blockedActors: [] })
})
test('к одной жертве две ночи подряд — предупреждение с «Записать всё равно»; при выключенной опции предупреждения нет', () => {
  const second = nextNight(play(night1(), visit(7)))
  expect(attempt(second, visit(7))).toEqual({ ok: false, reason: 'repeat_target' }); expect(attempt(second, visit(7, true)).ok).toBe(true)
  expect(attempt(second, visit(9)).ok).toBe(true)
  const free = nextNight(play(night1({ roleOptions: { maniac_no_repeat: false } }), visit(7)))
  expect(attempt(free, visit(7)).ok).toBe(true)
})
test('жертва, убитая этой же ночью другим, не «молчит»; маньяк, убитый этой ночью, успевает прийти', () => {
  expect(out(play(night1(), visit(7), act('mafia_shot', null, 7)))).toMatchObject({ deaths: [{ seat: 7, cause: 'shot' }], notes: [] })
  expect(out(play(night1(), visit(7), act('mafia_shot', null, 2)))).toMatchObject({ deaths: [{ seat: 2, cause: 'shot' }], notes: [{ seat: 7, kind: 'silenced' }] })
})
test('журнал: запись визита называет, первый он или повторный; итог — «убит маньяком»', () => {
  const texts = (s: Session, n: number, lang: 'ru' | 'uk' = 'ru') =>
    journal(s, R).find((g) => g.phase.kind === 'night' && g.phase.n === n)!.entries.map((e) => entryText(lang, e, R))
  const s = play(nextNight(play(night1(), visit(7))), visit(7, true), confirm(7))
  expect(texts(s, 1)).toContain('Маньяк → №7 — первый визит'); expect(texts(s, 2)).toContain('Маньяк → №7 — повторный визит')
  expect(texts(s, 2)).toContain('Итог ночи: №7 убит маньяком'); expect(texts(s, 2, 'uk')).toContain('Маніяк → №7 — повторний візит')
  expect(st(s).players[6]).toMatchObject({ status: 'out', cause: 'haunted' })
})

// ── День жертвы ─────────────────────────────────────────────────────────────

/** День 2 после первого визита маньяка к №7. */
const day2 = (config?: Partial<SessionConfig>): Session => play(night1(config), visit(7), confirm(), { type: 'announceMorning' })

test('жертва молчит один день: в списке молчащих — только на следующий день после визита', () => {
  expect(st(day2()).day).toMatchObject({ silenced: [7], silence: { noNominate: false, noVote: false } })
  expect(st(play(night1(), visit(7), confirm())).morning).toMatchObject({ silenced: [7], silence: { noNominate: false, noVote: false } })
  const day3 = play(day2(), { type: 'startPhase', phase: N(2) }, confirm())
  expect(st(day3).phase).toEqual({ kind: 'day', n: 3 }); expect(st(day3).day!.silenced).toEqual([]); expect(st(day3).morning!.silenced).toEqual([])
  // «Отменить» подтверждение ночи возвращает ночь: молчащих ещё нет.
  const confirmed = play(night1(), visit(7), confirm())
  expect(st({ ...confirmed, log: applyUndo(confirmed.log, confirmed.undo.at(-1)!) }).day).toBeNull()
})
test('очередь жертвы в круге проходит без речи: ход без таймера засчитывается, слово идёт дальше', () => {
  let s = play(day2(), { type: 'openCircle', first: 6 }, speak(6))
  expect(st(s).day!.waiting[0]).toBe(7)
  s = play(s, { type: 'startSpeech', kind: 'silent', seat: 7 })
  expect(st(s).day).toMatchObject({ speaking: { kind: 'silent', seat: 7 }, spoken: [6] }); expect(st(s).day!.waiting[0]).toBe(8)
  s = play(s, speak(8))
  expect(st(s).day).toMatchObject({ speaking: { kind: 'speech', seat: 8 }, spoken: [6, 7] }); expect(st(s).day!.waiting[0]).toBe(9)
  // В свою очередь жертва может выставить игрока.
  expect(attempt(play(day2(), { type: 'openCircle', first: 7 }, { type: 'startSpeech', kind: 'silent', seat: 7 }), { type: 'nominate', by: 7, target: 9 }).ok).toBe(true)
})
test('остальные речи у жертвы есть: оправдание, речь при ничьей и прощание', () => {
  let s = play(day2(), { type: 'nominate', by: 1, target: 7 }, { type: 'nominate', by: 3, target: 9 })
  expect(st(s).day!.defense.waiting).toEqual([7, 9]); expect(attempt(s, { type: 'startSpeech', kind: 'defense', seat: 7 }).ok).toBe(true)
  s = play(s, { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [7, 9] })
  expect(st(s).day!.tiebreak.waiting).toEqual([7, 9]); expect(attempt(s, { type: 'startSpeech', kind: 'tiebreak', seat: 7 }).ok).toBe(true)
  s = play(s, { type: 'resolveVote', ballot: 2, outcome: 'eliminated', seats: [7] })
  expect(st(s).day!.farewell.waiting).toEqual([7]); expect(attempt(s, { type: 'startSpeech', kind: 'farewell', seat: 7 }).ok).toBe(true)
})
test('опция «жертва не голосует»: голосующих по умолчанию меньше на одного; ведущий может поправить', () => {
  const nominated = (s: Session) => play(s, { type: 'nominate', by: 1, target: 3 }, { type: 'nominate', by: 3, target: 9 })
  expect(st(nominated(day2())).day!.ballots[0]!.voters).toBe(11)
  const mute = nominated(day2({ roleOptions: { maniac_no_vote: true } }))
  expect(st(mute).day).toMatchObject({ silenced: [7], silence: { noVote: true } }); expect(st(mute).day!.ballots[0]!.voters).toBe(10)
  expect(st(play(mute, { type: 'setVoters', ballot: 1, count: 11 })).day!.ballots[0]).toMatchObject({ voters: 11, votersOverridden: true })
  // Переголосование: без ничейных и без жертвы; жертва среди ничейных второй раз не вычитается.
  const tie = play(mute, { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [3, 9] })
  expect(st(tie).day!.ballots[1]!.voters).toBe(8)
  const own = play(play(day2({ roleOptions: { maniac_no_vote: true } }), { type: 'nominate', by: 1, target: 7 }, { type: 'nominate', by: 3, target: 9 }),
    { type: 'resolveVote', ballot: 1, outcome: 'tie', seats: [7, 9] })
  expect(st(own).day!.ballots[0]!.voters).toBe(10); expect(st(own).day!.ballots[1]!.voters).toBe(9)
})
test('жертва выбыла вручную посреди дня: её нет ни в очереди круга, ни среди молчащих, голосующих — по числу игроков в игре', () => {
  let s = play(day2({ roleOptions: { maniac_no_vote: true } }), { type: 'openCircle', first: 6 }, speak(6),
    { type: 'nominate', by: 6, target: 3 }, { type: 'nominate', by: 1, target: 9 })
  expect(st(s).day!.waiting[0]).toBe(7); expect(st(s).day!.ballots[0]!.voters).toBe(10)
  s = play(s, { type: 'setStatus', seat: 7, status: 'out', cause: 'shot' })
  expect(st(s).day).toMatchObject({ silenced: [] }); expect(st(s).day!.waiting[0]).toBe(8); expect(st(s).day!.ballots[0]!.voters).toBe(10)
  expect(st(s).morning!.silenced).toEqual([])
  // Вернули в игру — снова молчит и снова не голосует.
  s = play(s, { type: 'setStatus', seat: 7, status: 'alive' })
  expect(st(s).day!.silenced).toEqual([7]); expect(st(s).day!.ballots[0]!.voters).toBe(10); expect(st(s).counts.alive).toBe(11)
  // Жертва говорила вне очереди и выбыла посреди хода — слово снимается, шаг не перескакивает.
  let turn = play(day2(), { type: 'openCircle', first: 7 }, { type: 'startSpeech', kind: 'silent', seat: 7 }, { type: 'setStatus', seat: 7, status: 'out', cause: 'voted' })
  expect(st(turn).day!.speaking).toBeNull(); expect(st(turn).step).toBe('balagan')
  turn = play(turn, { type: 'setStatus', seat: 2, status: 'out', cause: 'voted' })
  expect(st(turn).counts.bySide.solo_maniac).toBe(0)
})
test('ведущий снял отметку с убитого вторым визитом — он в игре и сегодня молчит', () => {
  const s = play(nextNight(play(night1(), visit(7))), visit(7, true), confirm(), { type: 'announceMorning' })
  expect(st(s).players[6]!.status).toBe('alive'); expect(st(s).day!.silenced).toEqual([7])
})
