import { screen, within } from '@testing-library/react'
import { DEFAULT_RULES } from '../../src/engine'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from './helpers'

// Со второго дня начинающий круг выбран заранее — следующий после того, кто закрывал прошлый день.

test('после итога ночи День 2 уже знает, кто начинает круг; ведущий может выбрать другого', async () => {
  const { app, user, env } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'openCircle', first: 3, random: true })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'enterStep', step: 'summary' })
  })
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Никто не выбыл · начать День 2/ }))
  expect(app.getState().game!.day).toMatchObject({ n: 2, opener: 5, openerQueued: true })
  advance(env, 500)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Объявил/ }))
  await user.click(within(screen.getByRole('navigation', { name: 'Шаги дня' })).getByRole('button', { name: 'Круг речей' }))
  expect(screen.getByText(/круг начинает №5, по очереди/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Дать слово №5/ })).toBeInTheDocument()
  // Одна отмена возвращает на итог ночи: начало дня и выбор начинающего — одно действие.
  await user.click(screen.getByRole('button', { name: 'Выбрать другого…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.day).toMatchObject({ opener: 9, openerQueued: false })
  expect(screen.getByRole('button', { name: /Дать слово №9/ })).toBeInTheDocument()
  expect(screen.queryByText(/по очереди/)).not.toBeInTheDocument()
})

test('подтверждение ночи и выбор начинающего отменяются одним нажатием', async () => {
  const { app, user, env } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'openCircle', first: 3, random: true })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'enterStep', step: 'summary' })
  })
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Никто не выбыл · начать День 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 })
  app.undo()
  expect(app.getState().game!.phase).toEqual({ kind: 'night', n: 1 })
})

test('после балагана круг начинает выбранный по очереди: приложение не переспрашивает, кто начинает', async () => {
  const { app, user, env } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'openCircle', first: 3, random: true })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatchAll([{ type: 'confirmNight', died: [] }, { type: 'openNextCircle' }])
    a.dispatch({ type: 'announceMorning' })
  })
  expect(app.getState().game!.step).toBe('balagan')
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Запустить балаган/ }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /К кругу речей · начинает №5/ }))
  expect(app.getState().game!.step).toBe('speeches')
  expect(screen.queryByText('Кто начинает круг?')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Дать слово №5/ })).toBeInTheDocument()
})

test('«Пропустить балаган» при выбранном по очереди начинающем сразу открывает круг', async () => {
  const { app, user } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'openCircle', first: 3, random: true })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatchAll([{ type: 'confirmNight', died: [] }, { type: 'openNextCircle' }])
    a.dispatch({ type: 'announceMorning' })
  })
  await user.click(screen.getByRole('button', { name: 'Пропустить балаган' }))
  expect(app.getState().game!.step).toBe('speeches')
  expect(screen.queryByText('Кто начинает круг?')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Дать слово №5/ })).toBeInTheDocument()
})

test('после ночного прощания без балагана: следующий по очереди выбыл ночью — круг начинает следующий за ним', async () => {
  const { app, user, env } = renderApp((a) => {
    seedGame(a, TABLE_11, 1, { rules: { ...DEFAULT_RULES, farewellAfterNight: true, balagan: false } })
    a.dispatch({ type: 'openCircle', first: 3, random: true })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatchAll([{ type: 'confirmNight', died: [5] }, { type: 'openNextCircle' }])
    a.dispatch({ type: 'announceMorning' })
  })
  expect(app.getState().game!.step).toBe('night_farewell')
  await user.click(screen.getByRole('button', { name: 'Пропустить №5' }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /К кругу речей · начинает №6/ }))
  expect(app.getState().game!.step).toBe('speeches')
  expect(screen.queryByText('Кто начинает круг?')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Дать слово №6/ })).toBeInTheDocument()
})

test('карточка начинающего: пока он не говорил — «начинает день», после своей речи — «говорил · начинал день»', async () => {
  const { user, env } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'openCircle', first: 3, random: true })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatchAll([{ type: 'confirmNight', died: [] }, { type: 'openNextCircle' }])
    a.dispatch({ type: 'announceMorning' })
  })
  const marks = () => [...document.querySelectorAll('.card-mark')].map((el) => el.textContent)
  expect(marks()).toEqual(['начинает день'])
  await user.click(screen.getByRole('button', { name: 'Пропустить балаган' }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Дать слово №5/ }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Следующий: №6/ }))
  expect(marks()).toEqual(['говорил · начинал день', 'говорит сейчас'])
})
