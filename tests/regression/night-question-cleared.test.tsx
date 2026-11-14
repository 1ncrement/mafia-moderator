import { screen } from '@testing-library/react'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.3: два режима стола. «Обзор: клик по карточке открывает всплывающую панель игрока.
// Выбор: над столом вопрос шага…, клик по карточке — ответ». 5.5: рядом с главной кнопкой итога ночи —
// «Никто не выбыл» и «Выбыл другой…». Ведущий нажал «Выбыл другой…», передумал и подтвердил итог
// соседней кнопкой: ночь закрыта, вопрос «Кто выбыл этой ночью?» должен исчезнуть, стол — вернуться в «Обзор».

const N1 = { kind: 'night', n: 1 } as const

test('после «Выбыл другой…» и «Никто не выбыл» день начинается без ночного вопроса над столом', async () => {
  const { app, user } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'enterStep', step: 'summary' })
  })
  await user.click(screen.getByRole('button', { name: 'Выбыл другой…' }))
  expect(screen.getByText('Кто выбыл этой ночью?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Никто не выбыл' }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 })
  // Ночь подтверждена: её вопрос над столом больше не к месту.
  expect(screen.queryByText('Кто выбыл этой ночью?')).not.toBeInTheDocument()
  // Стол в режиме «Обзор»: клик по карточке открывает панель игрока.
  await user.click(screen.getByRole('button', { name: 'Игрок №2' }))
  expect(screen.getByRole('button', { name: 'Вернуть в игру' })).toBeInTheDocument()
})

test('после «Выбыл другой…» и главной кнопки итога день начинается без ночного вопроса над столом', async () => {
  const { app, user, env } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'startPhase', phase: N1 })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
    a.dispatch({ type: 'enterStep', step: 'summary' })
  })
  await user.click(screen.getByRole('button', { name: 'Выбыл другой…' }))
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: /№7 застрелен · начать День 2/ }))
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 2 })
  expect(app.getState().game!.players[6]!.status).toBe('out')
  expect(screen.queryByText('Кто выбыл этой ночью?')).not.toBeInTheDocument()
})
