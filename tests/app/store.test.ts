import { createAppStore } from '../../src/app/store'
import { game, seeded, TABLE_11, testEnv } from '../helpers'

test('новая игра: 10 игроков при первом запуске, раздача создаёт сессию', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame()
  expect(app.getState()).toMatchObject({ screen: 'setup', draft: { playerCount: 10 } })
  app.editDraft({ playerCount: 11, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } }); app.dealDraft()
  expect(app.getState().screen).toBe('deal'); expect(app.getState().game!.counts).toMatchObject({ total: 11, bySide: { black: 3, red: 8 } })
  expect(env.kv.getItem('mafia:active')).toBe(app.getState().session!.id)
})
test('состав с ошибкой не раздаётся', () => {
  const app = createAppStore(testEnv()); app.newGame(); app.editDraft({ playerCount: 4, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } })
  app.dealDraft(); expect(app.getState().screen).toBe('setup')
})
test('отмена откатывает переход фазы и переживает перезагрузку', () => {
  const env = testEnv(); const app = seeded(env)
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); expect(app.getState().screen).toBe('game')
  const reloaded = createAppStore(env)
  expect(reloaded.getState().game!.phase).toEqual({ kind: 'day', n: 1 }); expect(reloaded.canUndo()).toBe(true)
  reloaded.undo(); expect(reloaded.getState().screen).toBe('deal')
})
test('стек отмены не длиннее 50', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  for (let i = 0; i < 60; i++) app.dispatch({ type: 'setStatus', seat: 2, status: i % 2 ? 'alive' : 'out', cause: 'voted' })
  expect(app.getState().session!.undo).toHaveLength(50)
})
test('слово, таймер и отмена', () => {
  const env = testEnv(); const app = seeded(env); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5)
  expect(app.getState().session!.timer).toMatchObject({ kind: 'speech', seat: 5, status: 'running', durationMs: 60_000 })
  app.undo(); expect(app.getState().session!.timer!.status).toBe('ready'); expect(app.getState().game!.day!.speaking).toBeNull()
})
test('хранилище недоступно: игра идёт в памяти, есть признак ошибки', () => {
  const env = testEnv(); const app = seeded(env); env.kv.failWrites = true
  expect(app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }).ok).toBe(true)
  expect(app.getState()).toMatchObject({ screen: 'game', storageError: true })
})
test('остановка, итоги, новая игра с тем же составом', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'finishGame', winner: 'black' }); expect(app.getState().screen).toBe('summary')
  app.rematch(); expect(app.getState()).toMatchObject({ screen: 'setup', draft: { playerCount: 11 } })
})
test('битая активная сессия не роняет запуск', () => {
  const env = testEnv(); env.kv.setItem('mafia:active', 'z'); env.kv.setItem('mafia:session:z', '{')
  expect(createAppStore(env).getState()).toMatchObject({ screen: 'home', brokenSession: 'z' })
})

// Сверх плана: поведение, которое нужно экранам.
test('несколько команд одной кнопки отменяются одним нажатием', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  const before = app.getState().session!.undo.length
  expect(app.dispatchAll([{ type: 'openCircle', first: 5 }, { type: 'enterStep', step: 'speeches' }]).ok).toBe(true)
  expect(app.getState().session!.undo).toHaveLength(before + 1)
  app.undo(); expect(app.getState().game!.day!.opener).toBeNull()
})
test('пачка с отклонённой командой не применяется вовсе', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  const r = app.dispatchAll([{ type: 'openCircle', first: 5 }, { type: 'nominate', by: 5, target: 7 }])
  expect(r).toEqual({ ok: false, reason: 'nominations_closed' }); expect(app.getState().game!.day!.opener).toBeNull()
})
test('говорящий выбыл — таймер снимается; смена фазы тоже снимает таймер', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5)
  app.dispatch({ type: 'setStatus', seat: 5, status: 'out', cause: 'voted' })
  expect(app.getState().session!.timer).toBeNull()
  app.speak('speech', 6); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(app.getState().session!.timer).toBeNull()
})
test('пауза игры останавливает таймер, снятие паузы его не запускает', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5)
  app.setPaused(true); expect(app.getState().session).toMatchObject({ paused: true, timer: { status: 'paused' } })
  app.setPaused(false); expect(app.getState().session).toMatchObject({ paused: false, timer: { status: 'paused' } })
})
test('на главную, список игр, продолжение и удаление', () => {
  const env = testEnv(); const app = seeded(env); const id = app.getState().session!.id
  app.goHome(); expect(app.getState()).toMatchObject({ screen: 'home', session: null }); expect(app.getState().sessions).toHaveLength(1)
  expect(env.kv.getItem('mafia:active')).toBeNull()
  app.openSession(id); expect(app.getState().screen).toBe('deal')
  app.deleteSession(id); expect(app.getState()).toMatchObject({ screen: 'home', session: null, sessions: [] })
})
test('последний состав и язык запоминаются', () => {
  const env = testEnv(); const app = seeded(env); app.setSettings({ lang: 'uk' })
  const again = createAppStore(env); expect(again.getState().settings.lang).toBe('uk')
  again.goHome(); again.newGame(); expect(again.getState().draft.playerCount).toBe(11)
})

// По итогам ревью ветки
test('отмена передачи слова: таймер встаёт в «готов» для того, кто говорит', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5); app.speak('speech', 6); app.undo()
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 5 })
  expect(app.getState().session!.timer).toMatchObject({ kind: 'speech', seat: 5, status: 'ready', remainingMs: 60_000 })
})
test('свободный таймер посреди речи: после закрытия таймер говорящего на месте', () => {
  const app = seeded(testEnv()); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5); app.freeTimer(30); app.clearTimer()
  expect(app.getState().session!.timer).toMatchObject({ kind: 'speech', seat: 5, status: 'ready' })
})
test('битое событие в сохранённой игре не роняет запуск и не затирается', () => {
  const env = testEnv(); const broken = { ...game(TABLE_11), id: 'z', log: [{ id: 'x', seq: 1, tx: 'x', type: 'status_set', seat: 2 }] }
  env.kv.setItem('mafia:session:z', JSON.stringify(broken)); env.kv.setItem('mafia:active', 'z')
  const app = createAppStore(env)
  expect(app.getState()).toMatchObject({ screen: 'home', brokenSession: 'z', session: null })
  expect(JSON.parse(env.kv.getItem('mafia:session:z')!)).toEqual(broken)
  app.openSession('z'); expect(app.getState()).toMatchObject({ screen: 'home', brokenSession: 'z' })
})
test('неполный последний состав не роняет «Новую игру»', () => {
  const env = testEnv(); env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'uk', lastConfig: { playerCount: 7 } }))
  const app = createAppStore(env); app.newGame()
  expect(app.getState()).toMatchObject({ screen: 'setup', settings: { lang: 'uk', lastConfig: null }, draft: { playerCount: 10 } })
})
test('хранилище недоступно: игра не теряется при выходе на главную', () => {
  const env = testEnv(); const app = seeded(env); env.kv.failWrites = true
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); const id = app.getState().session!.id
  app.goHome()
  expect(app.getState()).toMatchObject({ screen: 'home', storageError: true }); expect(app.getState().sessions.map((m) => m.id)).toContain(id)
  expect(app.getState().sessions.find((m) => m.id === id)).toMatchObject({ status: 'running', phase: { kind: 'day', n: 1 } })
  app.openSession(id); expect(app.getState()).toMatchObject({ screen: 'game', game: { phase: { kind: 'day', n: 1 } } })
})
