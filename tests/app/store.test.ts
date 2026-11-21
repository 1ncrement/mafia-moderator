import { createAppStore } from '../../src/app/store'
import { journal } from '../../src/engine'
import { act, game, n1, play, seeded, TABLE_11, testEnv } from '../helpers'

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

// ── Видимость ролей по фазе ─────────────────────────────────────────────────

const day1 = (env = testEnv()) => { const app = seeded(env); app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); return { app, env } }
const hidden = (app: ReturnType<typeof seeded>) => app.getState().settings.rolesHidden
const toNight1 = { type: 'startPhase', phase: { kind: 'night', n: 1 } } as const

test('День 1 начался — роли скрыты; началась ночь — открыты; утром снова скрыты', () => {
  const { app } = day1()
  expect(hidden(app)).toBe(true)
  app.dispatch(toNight1); expect(hidden(app)).toBe(false)
  app.dispatch({ type: 'confirmNight', died: [] }); expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(hidden(app)).toBe(true)
})
test('ведущий открыл роли днём — до конца дня они открыты, следующий день снова скрыт', () => {
  const { app } = day1()
  app.setSettings({ rolesHidden: false })
  app.dispatch({ type: 'openCircle', first: 5 }); app.speak('speech', 5); app.dispatch({ type: 'endSpeech' })
  expect(hidden(app)).toBe(false)
  app.dispatch(toNight1); app.dispatch({ type: 'confirmNight', died: [] })
  expect(hidden(app)).toBe(true)
})
test('ведущий скрыл роли ночью — до конца ночи они скрыты, шаги ночи видимость не трогают', () => {
  const { app } = day1(); app.dispatch(toNight1)
  app.setSettings({ rolesHidden: true })
  app.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 }); app.dispatch({ type: 'enterStep', step: 'summary' })
  expect(hidden(app)).toBe(true)
})
test('«Отменить» переход фазы ставит видимость по фазе, в которую вернулись', () => {
  const { app } = day1()
  app.setSettings({ rolesHidden: false }); app.dispatch(toNight1)
  app.undo()
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 1 }); expect(hidden(app)).toBe(true)
  app.dispatch(toNight1); app.dispatch({ type: 'confirmNight', died: [] }); expect(hidden(app)).toBe(true)
  app.undo()
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 1 }); expect(hidden(app)).toBe(false)
})
test('«Отменить» внутри фазы видимость не меняет', () => {
  const { app } = day1(); app.setSettings({ rolesHidden: false })
  app.dispatch({ type: 'openCircle', first: 5 }); app.undo()
  expect(hidden(app)).toBe(false)
})
test('перезагрузка страницы посреди фазы видимость не меняет', () => {
  const day = day1(); day.app.setSettings({ rolesHidden: false })
  const reloadedDay = createAppStore(day.env)
  expect(reloadedDay.getState().game!.phase).toEqual({ kind: 'day', n: 1 }); expect(hidden(reloadedDay)).toBe(false)
  const night = day1(); night.app.dispatch(toNight1); night.app.setSettings({ rolesHidden: true })
  const reloadedNight = createAppStore(night.env)
  expect(reloadedNight.getState().game!.phase).toEqual({ kind: 'night', n: 1 }); expect(hidden(reloadedNight)).toBe(true)
  // Скрытие в начале дня тоже сохранено: после перезагрузки роли не открываются сами.
  expect(hidden(createAppStore(day1().env))).toBe(true)
})
test('распределение и итоги правило не трогает; открытие игры из списка — тоже', () => {
  const env = testEnv(); const app = seeded(env)
  expect(hidden(app)).toBe(false)
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.undo()
  // Вернулись на распределение: правило молчит, роли остаются как были в момент отмены — сами не открываются.
  expect(app.getState().screen).toBe('deal'); expect(hidden(app)).toBe(true)
  app.setSettings({ rolesHidden: false }); app.dispatch({ type: 'swapRoles', a: 1, b: 2 }); expect(hidden(app)).toBe(false)
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.setSettings({ rolesHidden: false })
  app.dispatch({ type: 'finishGame', winner: null }); expect(hidden(app)).toBe(false)
  app.dispatch({ type: 'resumeGame' }); expect(hidden(app)).toBe(false)
  const id = app.getState().session!.id
  app.goHome(); app.openSession(id); expect(hidden(app)).toBe(false)
})

// ── Первый круг: случайный начинающий ───────────────────────────────────────

test('начало Дня 1: начинающего выбирает случай — одной пачкой с началом дня, отмена одна', () => {
  const env = testEnv(); const pick = vi.fn((max: number) => max - 7); env.randomInt = pick
  const app = seeded(env); const undoBefore = app.getState().session!.undo.length
  pick.mockClear()
  expect(app.startFirstDay().ok).toBe(true)
  // Случай выбирает среди игроков в игре: 11 за столом, индекс 4 — это №5.
  expect(pick).toHaveBeenCalledExactlyOnceWith(11)
  expect(app.getState().game).toMatchObject({ phase: { kind: 'day', n: 1 }, day: { opener: 5, openerRandom: true } })
  expect(app.getState().session!.log.filter((e) => e.type === 'circle_opened')).toMatchObject([{ first: 5, random: true }])
  expect(app.getState().session!.undo).toHaveLength(undoBefore + 1)
  app.undo()
  expect(app.getState().screen).toBe('deal'); expect(app.getState().session!.log.some((e) => e.type === 'circle_opened')).toBe(false)
})
test('начало Дня 1 вне распределения отклоняется и ничего не меняет', () => {
  const app = seeded(testEnv()); app.startFirstDay(); const log = app.getState().session!.log
  expect(app.startFirstDay()).toEqual({ ok: false, reason: 'wrong_phase' }); expect(app.getState().session!.log).toBe(log)
})
test('доп. речь первого круга получает таймер обычной речи; «Заново» берёт длительность из настроек', () => {
  const app = seeded(testEnv()); app.startFirstDay(); app.updateConfig({ durations: { speech: 45, balagan: 60, defense: 30, tiebreak: 30, farewell: 30 } })
  for (let seat = 1; seat <= 11; seat++) app.speak('speech', seat)
  app.speak('closing', 1)
  expect(app.getState().session!.timer).toMatchObject({ kind: 'closing', seat: 1, status: 'running', durationMs: 45_000 })
  app.updateConfig({ durations: { speech: 50, balagan: 60, defense: 30, tiebreak: 30, farewell: 30 } }); app.timer({ type: 'reset' })
  expect(app.getState().session!.timer).toMatchObject({ kind: 'closing', status: 'ready', durationMs: 50_000, remainingMs: 50_000 })
  // Отмена передачи слова возвращает таймер тому, кто говорил до этого.
  app.speak('closing', 2); app.undo()
  expect(app.getState().session!.timer).toMatchObject({ kind: 'closing', seat: 1, status: 'ready', durationMs: 50_000 })
})

// ── Порядок проститутки и опции ролей ───────────────────────────────────────

const firstStep = (app: ReturnType<typeof seeded>) => app.getState().game!.night!.steps[0]!.actionId

test('новая игра: проститутка просыпается первой; «после мафии» — по правилу партии', () => {
  const app = seeded(testEnv()); app.startFirstDay(); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(firstStep(app)).toBe('prostitute_block'); expect(app.getState().game!.step).toMatch(/^prostitute_block/)
  const later = createAppStore(testEnv()); later.newGame()
  later.editDraft({ playerCount: 11, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }, rules: { ...later.getState().draft.rules, prostituteFirst: false } })
  later.dealDraft(); later.startFirstDay(); later.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(firstStep(later)).toBe('mafia_shot')
})
test('игра, сохранённая до обновления, доигрывается по-старому: проститутка после мафии, блок крёстного отца отменяет выстрел', () => {
  const env = testEnv()
  const old = { ...game(TABLE_11), id: 'old' }
  const saved = { ...old, config: { ...old.config, rules: { nominationsFromDay: 2, balaganFromDay: 2 } } }
  expect(saved.config).not.toHaveProperty('roleOptions')
  env.kv.setItem('mafia:session:old', JSON.stringify(saved)); env.kv.setItem('mafia:active', 'old')
  const app = createAppStore(env)
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  expect(app.getState().game!.night!.steps.map((s) => s.actionId)).toEqual(['mafia_shot', 'godfather_search', 'prostitute_block', 'sheriff_check', 'doctor_heal'])
  app.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
  app.dispatch({ type: 'recordNightAction', actionId: 'godfather_search', actor: 3, target: 1 })
  app.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 3 })
  expect(app.getState().game!.night!.outcome).toMatchObject({ deaths: [], noAttack: 'blocked' })
  expect(app.getState().game!.night!.steps.find((s) => s.actionId === 'godfather_search')!.answer).toEqual({ kind: 'found', found: true })
  // Балаган и прощание после голосования у старой игры на месте.
  app.dispatch({ type: 'confirmNight', died: [] }); expect(app.getState().game!.step).toBe('balagan')
  expect(app.getState().session!.config.rules).toMatchObject({ balagan: true, farewellAfterVote: true, farewellAfterNight: false, prostituteFirst: false })
})
test('опции ролей из черновика попадают в игру и запоминаются для следующей', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame()
  app.editDraft({ roleOptions: { leader_block: 'both' } }); app.dealDraft()
  expect(app.getState().session!.config.roleOptions).toEqual({ leader_block: 'both' })
  app.goHome(); app.newGame(); expect(app.getState().draft.roleOptions).toEqual({ leader_block: 'both' })
  expect(createAppStore(env).getState().settings.lastConfig?.roleOptions).toEqual({ leader_block: 'both' })
})
test('справочник экрана состава следует правилу черновика: порядок ночи меняется вместе с выбором', () => {
  const app = createAppStore(testEnv()); app.newGame()
  const order = () => [...app.registry.nightActions].sort((a, b) => a.order - b.order).map((a) => a.id)
  expect(order()[0]).toBe('prostitute_block')
  app.editDraft({ rules: { ...app.getState().draft.rules, prostituteFirst: false } })
  expect(order().slice(0, 3)).toEqual(['mafia_shot', 'godfather_search', 'prostitute_block'])
})

test('игра, сохранённая до обновления, открывается с прежним итогом ночи: подтверждение с одним номером читается как набор', () => {
  const env = testEnv()
  // Ночь 1: выстрел в №7 подтверждён; Ночь 2 без выстрела. В старом сохранении отметка итога — один номер или null.
  const played = play(n1(), act('mafia_shot', null, 7), { type: 'confirmNight', died: [7] }, { type: 'startPhase', phase: { kind: 'night', n: 2 } }, { type: 'confirmNight', died: [] })
  const one = (seats: unknown) => (Array.isArray(seats) ? seats[0] ?? null : seats)
  const saved = { ...played, id: 'old', log: played.log.map((e) => (e.type === 'night_confirmed' ? { ...e, hinted: one(e.hinted), chosen: one(e.chosen) } : e)) }
  expect(saved.log.filter((e) => e.type === 'night_confirmed').map((e) => e.chosen)).toEqual([7, null])
  env.kv.setItem('mafia:session:old', JSON.stringify(saved)); env.kv.setItem('mafia:active', 'old')
  const app = createAppStore(env)
  expect(app.getState()).toMatchObject({ screen: 'game', brokenSession: null, game: { phase: { kind: 'day', n: 3 }, warnings: [] } })
  expect(app.getState().game!.players[6]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
  const results = journal(app.getState().session!, app.registry).flatMap((g) => g.entries.flatMap((e) => (e.kind === 'night_result' ? [e.died] : [])))
  expect(results).toEqual([[], [7]])
  // Правка итога старой ночи записывает его уже набором — и игра по-прежнему читается после перезагрузки.
  expect(app.dispatch({ type: 'setNightResult', night: 1, died: [7, 2] }).ok).toBe(true)
  const reloaded = createAppStore(env)
  expect(reloaded.getState().game!.counts.alive).toBe(9); expect(reloaded.getState().game!.warnings).toEqual([])
})
