import { screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from './helpers'

const night1 = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }) }
test('шаги ночи по порядку, крёстный отец получает ответ', async () => {
  const { app, user } = renderApp(night1)
  expect(within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getAllByRole('button').map((b) => b.getAttribute('data-step')))
    .toEqual(['mafia_shot', 'godfather_search:3', 'prostitute_block:10', 'sheriff_check:1', 'doctor_heal:4', 'summary'])
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №6' }))
  await user.click(screen.getByRole('button', { name: /Дальше: Крёстный отец/ }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №1' }))
  expect(screen.getByText('№1 — шериф')).toBeInTheDocument()
  expect(app.getState().game!.night!.steps[1]).toMatchObject({ target: 1, answer: { kind: 'found', found: true } })
})
test('шериф видит сторону', async () => {
  const { user } = renderApp((a) => { night1(a); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }) })
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №10' })); expect(screen.getByText('№10 — чёрный')).toBeInTheDocument()
})
test('заблокированному шерифу ответа нет', () => {
  renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 1 }); a.dispatch({ type: 'enterStep', step: 'sheriff_check:1' }) })
  expect(screen.getAllByText(/заблокирован — проверка не состоялась/).length).toBeGreaterThan(0)
})
test('доктор: прошлая ночь, предупреждение и «Записать всё равно»', async () => {
  const { app, user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'doctor_heal', actor: 4, target: 5 })
    a.dispatch({ type: 'confirmNight', chosen: null }); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'doctor_heal:4' }) })
  expect(screen.getByText(/Прошлой ночью: №5/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №5' }))
  expect(screen.getByText('Этого игрока лечили прошлой ночью')).toBeInTheDocument(); expect(app.getState().game!.night!.steps.at(-1)!.recorded).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Записать всё равно' })); expect(app.getState().game!.night!.steps.at(-1)).toMatchObject({ target: 5 })
})
test('серый шаг выбывшей роли', async () => {
  renderApp((a) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'setStatus', seat: 1, status: 'out', cause: 'voted' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }); a.dispatch({ type: 'enterStep', step: 'sheriff_check' }) })
  expect(screen.getAllByText(/выбыл · разбудить для вида/).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Выбрать игрока №2' })).not.toBeInTheDocument()
})
test('итог ночи: подсказка, подтверждение одной кнопкой, другой исход', async () => {
  const seed = (a: AppStore) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 6 }); a.dispatch({ type: 'enterStep', step: 'summary' }) }
  const first = renderApp(seed)
  expect(screen.getByText('№6 застрелен')).toBeInTheDocument(); expect(screen.getByText(/Не записано:/)).toBeInTheDocument()
  await first.user.click(screen.getByRole('button', { name: /№6 застрелен · начать День 2/ }))
  expect(first.app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(first.app.getState().game!.players[5]!.status).toBe('out')
  first.unmount()
  const second = renderApp(seed)
  await second.user.click(screen.getByRole('button', { name: 'Никто не выбыл' }))
  expect(second.app.getState().game!.counts.alive).toBe(11)
})

// Сверх плана
test('ночь целиком: «Никого», ночные метки на столе, подсказки итога', async () => {
  const { app, user, env } = renderApp(night1)
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  for (const step of ['Крёстный отец', 'Проститутка']) { advance(env, 500); await user.click(screen.getByRole('button', { name: new RegExp(`Дальше: ${step}`) })) }
  await user.click(screen.getByRole('button', { name: 'Никого' }))
  expect(app.getState().game!.night!.steps[2]).toMatchObject({ recorded: true, target: null })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Дальше: Шериф/ })); advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Дальше: Доктор/ })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(within(screen.getByRole('button', { name: 'Выбрать игрока №7' })).getByText('цель мафии')).toBeInTheDocument()
  advance(env, 500); await user.click(within(screen.getByRole('navigation', { name: 'Шаги ночи' })).getByRole('button', { name: 'Итог ночи' }))
  expect(app.getState().game!.step).toBe('summary')
  expect(screen.getByText('Никто не выбыл: доктор вылечил №7')).toBeInTheDocument(); expect(screen.getByText('Не записано: Крёстный отец, Шериф')).toBeInTheDocument()
  expect(within(screen.getByRole('button', { name: 'Игрок №7' })).getByText('вылечен')).toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Никто не выбыл · начать День 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 }); expect(app.getState().game!.counts.alive).toBe(11)
  expect(within(screen.getByRole('button', { name: 'Игрок №7' })).queryByText('вылечен')).not.toBeInTheDocument()
})
test('блок крёстного отца: «выстрела не было»; выбыл другой', async () => {
  const { app, user } = renderApp((a) => { night1(a); a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 5 })
    a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 3 }); a.dispatch({ type: 'enterStep', step: 'summary' }) })
  expect(screen.getByText('Никто не выбыл: выстрела не было')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбыл другой…' })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №2' }))
  expect(app.getState().game!.players[1]).toMatchObject({ status: 'out', cause: 'shot', outPhase: { kind: 'night', n: 1 } })
})
test('выстрел перешёл к проститутке: вопрос называет её', () => {
  renderApp((a) => { seedGame(a, TABLE_11, 1); for (const seat of [3, 8]) a.dispatch({ type: 'setStatus', seat, status: 'out', cause: 'voted' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }) })
  expect(screen.getByText('В кого стреляет проститутка?')).toBeInTheDocument(); expect(screen.getByText(/Просыпается проститутка — №10/)).toBeInTheDocument()
})
