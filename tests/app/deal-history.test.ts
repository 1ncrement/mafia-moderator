import { gameDayStart, reachedNight } from '../../src/app/dealHistory'
import { createAppStore } from '../../src/app/store'
import type { AppStore } from '../../src/app/store'
import { DEFAULT_REGISTRY } from '../../src/engine'
import type { RoleId } from '../../src/engine'
import { seededInt, testEnv } from '../helpers'
import type { TestEnv } from '../helpers'

// Заказчик, 2026-11-22: раздача учитывает игры текущего игрового дня — с 6:00 до 6:00 следующего утра.
// Рядом с кнопкой видно, сколько игр учтено, и есть «Начать отсчёт заново». Судим только по номерам.

/** Момент по местным часам: 22 ноября 2026 плюс day суток. */
const at = (hour: number, minute = 0, day = 0) => new Date(2026, 10, 22 + day, hour, minute).getTime()
const COMPOSITION = { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }
const nightActors = new Set(DEFAULT_REGISTRY.nightActions.flatMap((a) => a.performers))
const isActive = (role: RoleId) => nightActors.has(role)

type Stage = 'deal' | 'day1' | 'night1' | 'finished' | 'day2' | 'finishedDay2'
/** Игра, созданная в момент time и доведённая до stage; приложение остаётся на главной. Возвращает id игры. */
function playGame(app: AppStore, env: TestEnv, time: number, stage: Stage = 'night1', players = 11): string {
  env.time = time
  app.newGame(); app.editDraft({ playerCount: players, composition: COMPOSITION }); app.dealDraft()
  const id = app.getState().session!.id
  if (stage !== 'deal') app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  if (stage !== 'deal' && stage !== 'day1') app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  if (stage === 'day2' || stage === 'finishedDay2') app.dispatch({ type: 'confirmNight', died: [] })
  if (stage === 'finished' || stage === 'finishedDay2') app.dispatch({ type: 'finishGame', winner: 'red' })
  app.goHome()
  return id
}
const start = (time = at(19)) => {
  const env = testEnv(); env.time = time
  return { env, app: createAppStore(env) }
}
const ids = (app: AppStore) => app.dealHistory().games.map((g) => g.id)

describe('игровой день', () => {
  test('начинается в 6:00 утра: до шести утра ещё идёт вчерашний день', () => {
    expect(gameDayStart(at(19))).toBe(at(6))
    expect(gameDayStart(at(6))).toBe(at(6))
    expect(gameDayStart(at(5, 59))).toBe(at(6, 0, -1))
    expect(gameDayStart(at(1, 0, 1))).toBe(at(6))
  })
})

describe('дошла ли игра до ночи', () => {
  test('раздача и День 1 — нет; Ночь 1, День 2 и дальше — да', () => {
    expect(reachedNight({ kind: 'deal' })).toBe(false); expect(reachedNight({ kind: 'day', n: 1 })).toBe(false)
    expect(reachedNight({ kind: 'night', n: 1 })).toBe(true); expect(reachedNight({ kind: 'day', n: 2 })).toBe(true)
    expect(reachedNight({ kind: 'night', n: 3 })).toBe(true)
  })
})

describe('какие игры учитываются', () => {
  test('игра, ушедшая дальше Ночи 1, учтена: идущая в День 2 и завершённая после него', () => {
    const { env, app } = start()
    const running = playGame(app, env, at(19), 'day2'), done = playGame(app, env, at(20), 'finishedDay2')
    expect(ids(app)).toEqual([running, done])
  })

  test('время игры — момент её создания: игру, созданную до шести утра и продолженную после, новый день не учитывает', () => {
    const { env, app } = start(at(5))
    const early = playGame(app, env, at(5, 30))
    env.time = at(7); app.openSession(early); app.dispatch({ type: 'confirmNight', died: [] }); app.goHome()
    expect(ids(app)).toEqual([])
    // То же с началом отсчёта: игра создана до него, правлена после — не учитывается.
    const before = playGame(app, env, at(19))
    env.time = at(20); app.resetDealHistory()
    env.time = at(20, 30); app.openSession(before); app.dispatch({ type: 'confirmNight', died: [] }); app.goHome()
    expect(ids(app)).toEqual([])
  })

  test('игра, которую приложение не может открыть, не учитывается', () => {
    const { env, app } = start()
    const odd = playGame(app, env, at(19)), fine = playGame(app, env, at(20))
    // Журнал записан другой версией: читается, но стол по нему не выводится.
    const key = `mafia:session:${odd}`
    const stored = JSON.parse(env.kv.getItem(key)!)
    stored.log.push({ id: 'чужое', seq: stored.nextSeq, at: at(19), type: 'vote_resolved', phase: { kind: 'day', n: 1 } })
    env.kv.setItem(key, JSON.stringify(stored))
    app.openSession(odd); expect(app.getState().brokenSession).toBe(odd)
    expect(ids(app)).toEqual([fine])
  })

  test('игра, дошедшая до Ночи 1, учтена — завершённая и незавершённая; порядок от ранней к поздней', () => {
    const { env, app } = start()
    const first = playGame(app, env, at(19, 5), 'finished'), second = playGame(app, env, at(20, 10), 'night1')
    env.time = at(21)
    expect(app.dealHistory()).toMatchObject({
      games: [{ id: first, createdAt: at(19, 5), playerCount: 11 }, { id: second, createdAt: at(20, 10), playerCount: 11 }], resetAt: null,
    })
  })

  test('раздача без игры и игра, брошенная в День 1, не учитываются: роль ещё никто не сыграл', () => {
    const { env, app } = start()
    playGame(app, env, at(19), 'deal'); playGame(app, env, at(19, 10), 'day1')
    const real = playGame(app, env, at(19, 20))
    expect(ids(app)).toEqual([real])
  })

  test('удалённая и нечитаемая игры не учитываются', () => {
    const { env, app } = start()
    const gone = playGame(app, env, at(19)), broken = playGame(app, env, at(19, 30)), kept = playGame(app, env, at(20))
    app.deleteSession(gone)
    env.kv.setItem(`mafia:session:${broken}`, '{"это не игра":')
    expect(ids(app)).toEqual([kept])
  })

  test('вечер за полночь — один день: игра в 23:30 учтена в час ночи, но не после шести утра', () => {
    const { env, app } = start()
    const late = playGame(app, env, at(23, 30))
    env.time = at(1, 0, 1); expect(ids(app)).toEqual([late])
    env.time = at(5, 59, 1); expect(ids(app)).toEqual([late])
    env.time = at(6, 0, 1); expect(ids(app)).toEqual([])
  })

  test('вчерашняя игра не учитывается, даже если с неё не прошло суток', () => {
    const { env, app } = start(at(5))
    playGame(app, env, at(5, 30))
    env.time = at(7); expect(ids(app)).toEqual([])
  })

  test('игра, для которой раздаются роли сейчас, сама себя не учитывает', () => {
    const { env, app } = start()
    const past = playGame(app, env, at(19))
    env.time = at(20); app.newGame(); app.editDraft({ playerCount: 11, composition: COMPOSITION }); app.dealDraft()
    app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    expect(ids(app)).toEqual([past])
  })

  test('игра, которую не удалось сохранить, учтена: она видна на главной', () => {
    const { env, app } = start()
    env.kv.failWrites = true
    const unsaved = playGame(app, env, at(19))
    expect(ids(app)).toEqual([unsaved])
  })

  test('роли прошлой игры — с учётом обмена «Поменять роли двум номерам»', () => {
    const { env, app } = start()
    env.time = at(19); app.newGame(); app.editDraft({ playerCount: 11, composition: COMPOSITION }); app.dealDraft()
    const before = app.getState().game!.players.map((p) => p.roleId)
    const a = before.findIndex(isActive) + 1, b = before.findIndex((role) => !isActive(role)) + 1
    app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    app.dispatch({ type: 'swapRoles', a, b }); app.goHome()
    const roles = app.dealHistory().games[0]!.roles
    expect(roles[a - 1]).toBe(before[b - 1]); expect(roles[b - 1]).toBe(before[a - 1])
  })
})

describe('начало отсчёта', () => {
  test('«Начать отсчёт заново» отсекает прежние игры, новые после него учитываются; «Вернуть» возвращает прежние', () => {
    const { env, app } = start()
    const old = playGame(app, env, at(19))
    env.time = at(21, 5); app.resetDealHistory()
    expect(app.dealHistory()).toEqual({ games: [], resetAt: at(21, 5) })
    const fresh = playGame(app, env, at(21, 30))
    expect(ids(app)).toEqual([fresh]); expect(app.dealHistory().resetAt).toBe(at(21, 5))
    app.restoreDealHistory()
    expect(ids(app)).toEqual([old, fresh]); expect(app.dealHistory().resetAt).toBeNull()
  })

  test('повторный сброс и «Вернуть» возвращают прежнее начало отсчёта, а не снимают его совсем', () => {
    const { env, app } = start()
    playGame(app, env, at(19))                                  // прежняя компания
    env.time = at(21, 5); app.resetDealHistory()
    const ours = playGame(app, env, at(21, 30))
    env.time = at(22, 30); app.resetDealHistory()               // нажали по ошибке
    expect(app.dealHistory()).toEqual({ games: [], resetAt: at(22, 30) })
    app.restoreDealHistory()
    expect(ids(app)).toEqual([ours]); expect(app.dealHistory().resetAt).toBe(at(21, 5))
    app.restoreDealHistory()
    expect(app.dealHistory().resetAt).toBeNull(); expect(ids(app)).toHaveLength(2)
  })

  test('мусор в сохранённом начале отсчёта читается как «отсчёта нет»', () => {
    const { env } = start()
    for (const junk of ['"abc"', 'null', '{}', '1e999']) {
      env.kv.setItem('mafia:settings', `{"lang":"ru","dealHistoryFrom":${junk},"dealHistoryPrev":${junk}}`)
      expect(createAppStore(env).getState().settings).toMatchObject({ dealHistoryFrom: null, dealHistoryPrev: null })
    }
  })

  test('начало отсчёта переживает перезагрузку страницы', () => {
    const { env, app } = start()
    playGame(app, env, at(19)); env.time = at(21, 5); app.resetDealHistory()
    const reloaded = createAppStore(env)
    expect(reloaded.dealHistory()).toEqual({ games: [], resetAt: at(21, 5) })
  })

  test('на следующий игровой день начало отсчёта теряет силу само', () => {
    const { env, app } = start()
    env.time = at(21, 5); app.resetDealHistory()
    const next = playGame(app, env, at(19, 0, 1))
    expect(app.dealHistory()).toMatchObject({ games: [{ id: next }], resetAt: null })
  })
})

describe('раздача', () => {
  const dealtEvent = (app: AppStore) => app.getState().session!.log.find((e) => e.type === 'roles_dealt')!

  test('без режима и в режиме «случайно» раздача прежняя: поля об учёте нет', () => {
    const { env, app } = start()
    playGame(app, env, at(19))
    env.time = at(20); app.newGame(); app.dealDraft()
    expect('history' in dealtEvent(app)).toBe(false)
    app.backToSetup(); app.dealDraft('random')
    expect('history' in dealtEvent(app)).toBe(false)
  })

  test('с учётом прошлых игр: в раздаче записано, сколько игр учтено, колода — по составу', () => {
    const { env, app } = start()
    playGame(app, env, at(19)); playGame(app, env, at(20))
    env.time = at(21); app.newGame(); app.editDraft({ playerCount: 11, composition: COMPOSITION }); app.dealDraft('history')
    expect(dealtEvent(app)).toMatchObject({ history: 2 })
    expect(app.getState().game!.counts).toMatchObject({ total: 11, bySide: { black: 3, red: 8 } })
  })

  test('учитывать нечего — раздача с учётом игр становится случайной и записывается как случайная', () => {
    const { env, app } = start()
    env.time = at(20); app.newGame(); app.dealDraft('history')
    expect(app.getState().screen).toBe('deal'); expect('history' in dealtEvent(app)).toBe(false)
  })

  test('раздача с учётом игр идёт по весам: номера, игравшие активную роль, получают её реже остальных', () => {
    const env = testEnv(); env.time = at(19); env.randomInt = seededInt(5)
    const app = createAppStore(env)
    playGame(app, env, at(19))
    const played = app.dealHistory().games[0]!.roles.map(isActive)
    let again = 0, fresh = 0
    env.time = at(20)
    for (let i = 0; i < 300; i++) {
      app.newGame(); app.editDraft({ playerCount: 11, composition: COMPOSITION }); app.dealDraft('history')
      app.getState().game!.players.forEach((p, s) => { if (isActive(p.roleId)) { if (played[s]) again++; else fresh++ } })
      app.backToSetup()
    }
    // Пятеро игравших и шестеро новых: при полном рандоме доли были бы 5 к 6, с учётом игр новые получают роль втрое чаще.
    expect(fresh / 6).toBeGreaterThan((again / 5) * 2)
    expect(again).toBeGreaterThan(0)
  })

  test('другое число мест: раздача с учётом игр работает и за большим, и за меньшим столом', () => {
    const { env, app } = start()
    playGame(app, env, at(19))                                  // 11 мест
    for (const players of [13, 8]) {
      env.time = at(20); app.newGame(); app.editDraft({ playerCount: players, composition: COMPOSITION }); app.dealDraft('history')
      expect(dealtEvent(app)).toMatchObject({ history: 1 })
      expect(app.getState().game!.counts).toMatchObject({ total: players, bySide: { black: 3, red: players - 3 } })
      app.backToSetup()
    }
  })

  test('своя роль прошлой игры считается по перечню той игры, даже когда её уже удалили: игравший её получает активную роль реже', () => {
    const env = testEnv(); env.time = at(19); env.randomInt = seededInt(9)
    const app = createAppStore(env)
    app.newGame(); expect(app.addCustomRole({ name: 'лунатик', side: 'red', night: true })).toBeNull()
    const own = app.getState().settings.customRoles[0]!.id
    app.editDraft({ playerCount: 6, composition: { mafia: 1, prostitute: 0, sheriff: 0, doctor: 0, [own]: 1 } }); app.dealDraft()
    const seat = app.getState().game!.players.findIndex((p) => p.roleId === own)
    app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    app.goHome(); app.removeCustomRole(own)
    const past = app.dealHistory().games[0]!.roles
    expect(past[seat]).toBe(own)
    const wasActive = past.map((role) => role === own || isActive(role))
    const active = past.map(() => 0)
    env.time = at(20)
    for (let i = 0; i < 300; i++) {
      app.newGame(); app.editDraft({ playerCount: 6, composition: { mafia: 1, prostitute: 0, sheriff: 1, doctor: 0 } }); app.dealDraft('history')
      app.getState().game!.players.forEach((p, s) => { if (isActive(p.roleId)) active[s]!++ })
      app.backToSetup()
    }
    const freshShare = active.filter((_, s) => !wasActive[s]).reduce((a, b) => a + b, 0) / wasActive.filter((x) => !x).length
    expect(active[seat]).toBeLessThan(freshShare * 0.7)
  })

  test('перераздача обоими способами: меняет запись, отменяется одной отменой, после начала Дня 1 закрыта', () => {
    const { env, app } = start()
    playGame(app, env, at(19))
    env.time = at(20); app.newGame(); app.editDraft({ playerCount: 11, composition: COMPOSITION }); app.dealDraft()
    const first = dealtEvent(app).id
    expect(app.redeal('history').ok).toBe(true)
    expect(dealtEvent(app)).toMatchObject({ history: 1 }); expect(dealtEvent(app).id).not.toBe(first)
    app.undo(); expect(dealtEvent(app).id).toBe(first)
    expect(app.redeal().ok).toBe(true); expect('history' in dealtEvent(app)).toBe(false)
    app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
    expect(app.redeal('history')).toEqual({ ok: false, reason: 'redeal_closed' })
  })
})
