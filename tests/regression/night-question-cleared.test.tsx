import { screen } from '@testing-library/react'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.3: два режима стола. «Обзор: клик по карточке открывает всплывающую панель игрока.
// Выбор: над столом вопрос шага…, клик по карточке — ответ». Дополнение 5.5: на итоге ночи ведущий может
// добавить выбывшего сам — «Добавить выбывшего…» открывает вопрос над столом. Ведущий нажал кнопку, передумал
// и подтвердил итог главной кнопкой: ночь закрыта, вопрос «Кто ещё выбыл этой ночью?» должен исчезнуть, стол — вернуться в «Обзор».

const N1 = { kind: 'night', n: 1 } as const
const QUESTION = 'Кто ещё выбыл этой ночью?'
const onSummary = (a: Parameters<NonNullable<Parameters<typeof renderApp>[0]>>[0]) => {
  seedGame(a, TABLE_11, 1)
  a.dispatch({ type: 'startPhase', phase: N1 })
  a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
  a.dispatch({ type: 'enterStep', step: 'summary' })
}

test('после «Добавить выбывшего…» и подтверждения «Никто не выбыл» день начинается без ночного вопроса над столом', async () => {
  const { app, user, env } = renderApp(onSummary)
  await user.click(screen.getByRole('button', { name: 'Добавить выбывшего…' }))
  expect(screen.getByText(QUESTION)).toBeInTheDocument()
  // Передумал: снял отметку с застреленного и подтвердил итог.
  await user.click(screen.getByRole('checkbox', { name: '№7 покидает стол' }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /Никто не выбыл · начать День 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 })
  // Ночь подтверждена: её вопрос над столом больше не к месту.
  expect(screen.queryByText(QUESTION)).not.toBeInTheDocument()
  // Стол в режиме «Обзор»: клик по карточке открывает панель игрока.
  await user.click(screen.getByRole('button', { name: 'Игрок №2' }))
  expect(screen.getByRole('button', { name: 'Вернуть в игру' })).toBeInTheDocument()
})

test('после «Добавить выбывшего…» и главной кнопки итога день начинается без ночного вопроса над столом', async () => {
  const { app, user, env } = renderApp(onSummary)
  await user.click(screen.getByRole('button', { name: 'Добавить выбывшего…' }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /№7 выбывает · начать День 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 })
  expect(app.getState().game!.players[6]!.status).toBe('out')
  expect(screen.queryByText(QUESTION)).not.toBeInTheDocument()
})
