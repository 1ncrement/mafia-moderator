import { screen, within } from '@testing-library/react'
import { DEFAULT_RULES } from '../../src/engine'
import { TABLE_11 } from '../helpers'
import type { AppStore } from '../../src/app/store'
import { advance, renderApp, seedGame } from './helpers'

test('День 1: круг с №5 по одной кнопке, без выставления', async () => {
  const { app, user, env } = renderApp((a) => seedGame(a, TABLE_11, 1))
  await user.click(screen.getByRole('button', { name: 'Выбрать, кто начинает' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' })); advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Дать слово №5 · 60 с/ }))
  expect(screen.getByText('Речь №5')).toBeInTheDocument(); expect(screen.getByText('1:00')).toBeInTheDocument()
  advance(env, 18_000); expect(screen.getByText('0:42')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Следующий: №6 · 60 с/ }))
  expect(app.getState().game!.day).toMatchObject({ spoken: [5] }); expect(screen.queryByRole('button', { name: /выставляет/ })).not.toBeInTheDocument()
})
test('ноль не передаёт слово; виден перерасход', async () => {
  const { app, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) })
  advance(env, 67_000)
  expect(screen.getByText('0:00')).toBeInTheDocument(); expect(screen.getByText('+0:07')).toBeInTheDocument()
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 5 })
})
test('пауза, +10 с, заново', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) })
  // В плане здесь /^Пауза/, но так же начинается «Пауза игры» в шапке: берём кнопку таймера по точному имени.
  advance(env, 40_000); await user.click(screen.getByRole('button', { name: 'Пауза' })); advance(env, 30_000)
  expect(screen.getByText('0:20')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '+10 с' })); expect(screen.getByText('0:30')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Заново' })); expect(app.getState().session!.timer).toMatchObject({ status: 'ready', remainingMs: 60_000 })
})
test('День 2: выставление в порядке очереди, повтор не добавляется', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'enterStep', step: 'speeches' })
    a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) })
  await user.click(screen.getByRole('button', { name: '№5 выставляет…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  await user.click(screen.getByRole('button', { name: /Следующий: №6/ }))
  await user.click(screen.getByRole('button', { name: '№6 выставляет…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(screen.getByText('№7 уже выставлен')).toBeInTheDocument()
  expect(app.getState().game!.day!.nominations.map((n) => n.target)).toEqual([7])
  await user.click(screen.getByRole('button', { name: 'Снять №7 с голосования' })); expect(app.getState().game!.day!.nominations).toEqual([])
})
test('конец круга: никто не выставлен — сразу ночь', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, 'G c c c', 2); a.dispatch({ type: 'enterStep', step: 'speeches' })
    a.dispatch({ type: 'openCircle', first: 1 }); for (const s of [1, 2, 3, 4]) a.speak('speech', s); a.dispatch({ type: 'endSpeech' }) })
  await user.click(screen.getByRole('button', { name: /Никто не выставлен → Ночь 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 2 })
})
test('один кандидат: оправдание, без голосования, прощание', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'nominate', by: 5, target: 9 }); a.dispatch({ type: 'enterStep', step: 'defense' }) })
  await user.click(screen.getByRole('button', { name: /Оправдание №9 · 30 с/ })); advance(env, 500)
  await user.click(screen.getByRole('button', { name: /№9 выгнан → прощание · 30 с/ }))
  expect(app.getState().game!.players[8]).toMatchObject({ status: 'out', cause: 'voted' }); expect(app.getState().game!.step).toBe('farewell')
})

// Сверх плана
test('балаган: запуск, затем выбор начинающего; одно нажатие — одна отмена', async () => {
  const { app, user, env } = renderApp((a) => seedGame(a, TABLE_11, 2))
  await user.click(screen.getByRole('button', { name: /Запустить балаган · 60 с/ }))
  expect(screen.getByText('Балаган', { selector: '.timer-label' })).toBeInTheDocument(); expect(app.getState().session!.timer).toMatchObject({ kind: 'balagan', status: 'running' })
  advance(env, 500); await user.click(screen.getByRole('button', { name: 'Выбрать, кто начинает круг' }))
  expect(app.getState().game!.step).toBe('speeches'); expect(app.getState().session!.timer).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №3' }))
  expect(app.getState().game!.day!.opener).toBe(3); expect(screen.getByRole('button', { name: /Дать слово №3 · 60 с/ })).toBeInTheDocument()
  app.undo(); expect(app.getState().game!.day!.opener).toBeNull(); app.undo(); expect(app.getState().game!.step).toBe('balagan')
})
test('оправдания по очереди, затем к голосованию; видно, кто не говорил', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5)
    a.dispatch({ type: 'nominate', by: 5, target: 7 }); a.dispatch({ type: 'nominate', by: 6, target: 3 }) })
  await user.click(within(screen.getByRole('navigation', { name: 'Шаги дня' })).getByRole('button', { name: 'Оправдания' }))
  expect(app.getState().game!.day!.speaking).toBeNull(); expect(screen.getByText(/Не говорили: 6, 7, 8/)).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Оправдание №7 · 30 с/ })); advance(env, 500)
  expect(app.getState().session!.timer).toMatchObject({ kind: 'defense', seat: 7, durationMs: 30_000 })
  await user.click(screen.getByRole('button', { name: /Следующий: №3 · 30 с/ })); advance(env, 500)
  await user.click(screen.getByRole('button', { name: /К голосованию/ })); expect(app.getState().game!.step).toBe('vote')
})
test('панель игрока днём: слово вне очереди, пропуск, выставить и снять', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'enterStep', step: 'speeches' }); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) })
  await user.click(screen.getByRole('button', { name: 'Игрок №9' })); await user.click(screen.getByRole('button', { name: 'Выставить' }))
  expect(app.getState().game!.day!.nominations).toMatchObject([{ target: 9, by: 5 }])
  await user.click(screen.getByRole('button', { name: 'Игрок №9' })); await user.click(screen.getByRole('button', { name: 'Снять с голосования' }))
  expect(app.getState().game!.day!.nominations).toEqual([])
  await user.click(screen.getByRole('button', { name: 'Игрок №6' })); await user.click(screen.getByRole('button', { name: 'Пропустить в круге' }))
  expect(app.getState().game!.day!.skipped).toEqual([6])
  await user.click(screen.getByRole('button', { name: 'Игрок №9' })); await user.click(screen.getByRole('button', { name: 'Дать слово сейчас' }))
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 9 })
})
test('запуск таймера отдельной кнопкой и свободный таймер', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.updateConfig({ separateTimerStart: true }); a.dispatch({ type: 'openCircle', first: 5 }) })
  await user.click(screen.getByRole('button', { name: /Дать слово №5/ }))
  expect(app.getState().session!.timer).toMatchObject({ seat: 5, status: 'ready' })
  await user.click(screen.getByRole('button', { name: 'Старт' })); expect(app.getState().session!.timer!.status).toBe('running')
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Свободный таймер 30 с' }))
  expect(screen.getByText('Свободный таймер')).toBeInTheDocument(); expect(app.getState().session!.timer).toMatchObject({ kind: 'free', durationMs: 30_000 })
  // №5 всё ещё говорит: после закрытия свободного таймера ему возвращается таймер речи в «готов».
  await user.click(screen.getByRole('button', { name: 'Убрать таймер' })); expect(app.getState().session!.timer).toMatchObject({ kind: 'speech', seat: 5, status: 'ready' })
})

// ── Правила партии: балаган и прощание после голосования ────────────────────

const NO_BALAGAN = { rules: { ...DEFAULT_RULES, balagan: false } }
const NO_FAREWELL = { rules: { ...DEFAULT_RULES, farewellAfterVote: false } }

test('балаган выключен: День 2 начинается с выбора начинающего, шага «Балаган» в полосе нет', async () => {
  const { app, user } = renderApp((a) => seedGame(a, TABLE_11, 2, NO_BALAGAN))
  expect(app.getState().game!.step).toBe('speeches')
  const nav = within(screen.getByRole('navigation', { name: 'Шаги дня' }))
  expect(nav.queryByRole('button', { name: 'Балаган' })).not.toBeInTheDocument()
  expect(nav.getAllByRole('button').map((b) => b.textContent)).toEqual(['Круг речей', 'Оправдания', 'Голосование'])
  expect(screen.queryByRole('button', { name: /Запустить балаган/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать, кто начинает' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' }))
  expect(app.getState().game!.day!.opener).toBe(5)
})
test('балаган включён: День 2 открывается балаганом, как раньше', () => {
  const { app } = renderApp((a) => seedGame(a, TABLE_11, 2))
  expect(app.getState().game!.step).toBe('balagan')
  expect(within(screen.getByRole('navigation', { name: 'Шаги дня' })).getByRole('button', { name: 'Балаган' })).toBeInTheDocument()
})
test('прощание выключено, выставлен один: «№9 выгнан → Ночь 2», шага прощания нет', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 2, NO_FAREWELL); a.dispatch({ type: 'nominate', by: 5, target: 9 }); a.dispatch({ type: 'enterStep', step: 'defense' }) })
  await user.click(screen.getByRole('button', { name: /Оправдание №9 · 30 с/ })); advance(env, 500)
  expect(screen.queryByRole('button', { name: /прощание/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /№9 выгнан → Ночь 2/ }))
  expect(app.getState().game!.players[8]).toMatchObject({ status: 'out', cause: 'voted', outPhase: { kind: 'day', n: 2 } })
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 2 })
  // Одно нажатие — одна отмена: игрок снова в игре, день на том же шаге.
  app.undo()
  expect(app.getState().game).toMatchObject({ phase: { kind: 'day', n: 2 }, step: 'defense' }); expect(app.getState().game!.players[8]!.status).toBe('alive')
})

// ── Первый круг: случайный начинающий и доп. речь первых двоих ──────────────

const ORDER_FROM_5 = [5, 6, 7, 8, 9, 10, 11, 1, 2, 3, 4]

test('«Город просыпается: День 1» сразу показывает случайного начинающего; «Выбрать другого…» заменяет его, отмена возвращает', async () => {
  const { app, user, env } = renderApp((a) => { a.newGame(); a.dealDraft() })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Город просыпается: День 1/ }))
  // randomInt в тестах всегда 0 — начинает №1.
  expect(app.getState().game!.day).toMatchObject({ opener: 1, openerRandom: true })
  expect(screen.getByText('День 1 · круг начал №1, выбран случайно')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Дать слово №1 · 60 с/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Выбрать, кто начинает' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Начать круг заново с №…' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать другого…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' }))
  expect(app.getState().game!.day).toMatchObject({ opener: 5, openerRandom: false })
  expect(app.getState().session!.log.filter((e) => e.type === 'circle_opened')).toHaveLength(1)
  expect(screen.queryByText(/выбран случайно/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Начать круг заново с №…' })).toBeInTheDocument()
  // Одно нажатие «Отменить» возвращает к случайному выбору.
  await user.click(screen.getByRole('button', { name: 'Отменить' }))
  expect(app.getState().game!.day).toMatchObject({ opener: 1, openerRandom: true })
  expect(screen.getByRole('button', { name: 'Выбрать другого…' })).toBeInTheDocument()
  // Ещё одно — к распределению: начало дня и случайный выбор отменяются вместе.
  await user.click(screen.getByRole('button', { name: 'Отменить' }))
  expect(app.getState().screen).toBe('deal')
})
test('после первой речи «Выбрать другого…» сменяется на «Начать круг заново с №…»', async () => {
  const { user, env } = renderApp((a) => { a.newGame(); a.dealDraft(); a.startFirstDay() })
  expect(screen.getByRole('button', { name: 'Выбрать другого…' })).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Дать слово №1 · 60 с/ }))
  expect(screen.queryByRole('button', { name: 'Выбрать другого…' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Начать круг заново с №…' })).toBeInTheDocument()
})
test('конец первого круга: «Доп. минута №5 · 60 с», затем №6, затем «Город засыпает: Ночь 1»', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5, random: true }); ORDER_FROM_5.forEach((s) => a.speak('speech', s)) })
  expect(screen.getByText('Круг закрывают первые двое')).toBeInTheDocument()
  expect(screen.getByText('Все высказались. №5 и №6 говорили первыми и получают ещё по минуте.')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /^Доп\. минута №5 · 60 с/ }))
  expect(screen.getByText('Доп. минута №5', { selector: '.timer-label' })).toBeInTheDocument()
  expect(app.getState().session!.timer).toMatchObject({ kind: 'closing', seat: 5, status: 'running', durationMs: 60_000 })
  expect(app.getState().game!.step).toBe('speeches')
  expect(within(screen.getByRole('button', { name: 'Игрок №5' })).getByText('говорит сейчас')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /^Доп\. минута №6 · 60 с/ }))
  expect(app.getState().game!.day).toMatchObject({ speaking: { kind: 'closing', seat: 6 }, closing: { done: [5], waiting: [] } })
  expect(screen.queryByRole('button', { name: 'Пропустить доп. минуту' })).not.toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Город засыпает: Ночь 1/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 1 })
})
test('«Пропустить доп. минуту» снимает следующую доп. речь без таймера', async () => {
  const { app, user, env } = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); ORDER_FROM_5.forEach((s) => a.speak('speech', s)); a.dispatch({ type: 'endSpeech' }) })
  // Никто не говорит: таймер ждёт доп. минуту №5.
  expect(screen.getByText('Доп. минута №5', { selector: '.timer-label' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Пропустить доп. минуту' }))
  expect(app.getState().game!.day).toMatchObject({ speaking: null, closing: { done: [5], waiting: [6] } })
  expect(app.getState().session!.timer).toBeNull()
  expect(screen.getByRole('button', { name: /^Доп\. минута №6 · 60 с/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Пропустить доп. минуту' }))
  expect(app.getState().game!.day!.closing).toEqual({ done: [5, 6], waiting: [] })
  advance(env, 500); expect(screen.getByRole('button', { name: /Город засыпает: Ночь 1/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Пропустить доп. минуту' })).not.toBeInTheDocument()
  // Пропуск — одно действие: отменяется одним нажатием.
  app.undo(); expect(app.getState().game!.day!.closing).toEqual({ done: [5], waiting: [6] })
})
test('пробел запускает ожидаемую доп. минуту; со второго дня доп. минут нет', async () => {
  const first = renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); ORDER_FROM_5.forEach((s) => a.speak('speech', s)); a.dispatch({ type: 'endSpeech' }) })
  await first.user.keyboard(' ')
  expect(first.app.getState().game!.day!.speaking).toMatchObject({ kind: 'closing', seat: 5 })
  first.unmount()
  renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'enterStep', step: 'speeches' }); a.dispatch({ type: 'openCircle', first: 5 }); ORDER_FROM_5.forEach((s) => a.speak('speech', s)) })
  expect(screen.queryByText(/Доп\. минута/)).not.toBeInTheDocument(); expect(screen.queryByText('Круг закрывают первые двое')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Никто не выставлен → Ночь 2/ })).toBeInTheDocument()
})

// ── Прощание после ночной смерти ────────────────────────────────────────────

const NIGHT_FAREWELL = { rules: { ...DEFAULT_RULES, farewellAfterNight: true } }
/** Начало Дня 2 после ночи, в которую выбыли died. announce: false — окно утра ещё открыто. */
const dayAfterNight = (died: number[], config = NIGHT_FAREWELL, announce = true) => (a: AppStore) => {
  seedGame(a, TABLE_11, 1, config); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  a.dispatch({ type: 'confirmNight', died })
  if (announce) a.dispatch({ type: 'announceMorning' })
}
const dayNav = () => within(screen.getByRole('navigation', { name: 'Шаги дня' })).getAllByRole('button').map((b) => b.textContent)

test('правило выключено: после ночной смерти шага прощания нет, день открывается балаганом', () => {
  const { app } = renderApp(dayAfterNight([7, 3], { rules: DEFAULT_RULES }))
  expect(app.getState().game!.step).toBe('balagan'); expect(dayNav()).toEqual(['Балаган', 'Круг речей', 'Оправдания', 'Голосование'])
  expect(screen.queryByRole('button', { name: /Прощание №/ })).not.toBeInTheDocument()
})
test('правило включено, двое выбыли ночью: шаг «Прощание» первый — две речи по 30 с, затем балаган', async () => {
  const { app, user, env } = renderApp(dayAfterNight([7, 3]))
  expect(app.getState().game!.step).toBe('night_farewell'); expect(dayNav()).toEqual(['Прощание', 'Балаган', 'Круг речей', 'Оправдания', 'Голосование'])
  expect(screen.getByText('№3 и №7: выбыли ночью · прощание')).toBeInTheDocument()
  // Круг ещё не начинался: строки «Не говорили» на этом шаге нет.
  expect(screen.queryByText(/Не говорили/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Прощание №3 · 30 с/ }))
  expect(app.getState().session!.timer).toMatchObject({ kind: 'farewell', seat: 3, durationMs: 30_000, status: 'running' })
  expect(screen.getByText('Прощание №3')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Прощание №7 · 30 с/ }))
  expect(app.getState().game!.day).toMatchObject({ speaking: { kind: 'farewell', seat: 7 }, nightFarewell: { done: [3], waiting: [] } })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Дальше: балаган/ }))
  expect(app.getState().game!.step).toBe('balagan'); expect(app.getState().game!.day!.speaking).toBeNull()
  expect(screen.getByRole('button', { name: /Запустить балаган · 60 с/ })).toBeInTheDocument()
  // Пройденный шаг остаётся первым в полосе; выбывшие говорили, но в игру не вернулись.
  expect(dayNav()[0]).toBe('Прощание'); expect(app.getState().game!.counts.alive).toBe(9)
})
test('ночное прощание без балагана: «Пропустить №…» снимает речь без таймера, дальше — выбор начинающего круг', async () => {
  const { app, user, env } = renderApp(dayAfterNight([7], { rules: { ...DEFAULT_RULES, farewellAfterNight: true, balagan: false } }))
  expect(dayNav()).toEqual(['Прощание', 'Круг речей', 'Оправдания', 'Голосование'])
  expect(screen.getByText('№7: выбыл ночью · прощание')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Пропустить №7' }))
  expect(app.getState().game!.day!.nightFarewell).toEqual({ done: [7], waiting: [] }); expect(app.getState().session!.timer).toBeNull()
  advance(env, 500); await user.click(screen.getByRole('button', { name: 'Выбрать, кто начинает круг' }))
  expect(app.getState().game!.step).toBe('speeches'); expect(screen.getByText('Кто начинает круг?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' })); expect(app.getState().game!.day!.opener).toBe(5)
})
test('окно утра называет прощающихся; после «Объявил» пробел запускает прощание первого', async () => {
  const { app, user, env } = renderApp(dayAfterNight([7, 3], NIGHT_FAREWELL, false))
  const dialog = screen.getByRole('dialog', { name: 'Объяви столу' })
  expect(dialog.textContent).toContain('Стол покидают игроки №3 и №7')
  expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['№3прощается со столом — 30 с', '№7прощается со столом — 30 с'])
  advance(env, 500); await user.keyboard('{Enter}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(app.getState().game!.day!.speaking).toBeNull()
  await user.keyboard(' ')
  expect(app.getState().game!.day!.speaking).toMatchObject({ kind: 'farewell', seat: 3 })
})
test('правило выключено: окно утра о прощании не говорит', () => {
  renderApp(dayAfterNight([7], { rules: DEFAULT_RULES }, false))
  expect(within(screen.getByRole('dialog', { name: 'Объяви столу' })).queryByRole('listitem')).not.toBeInTheDocument()
})
