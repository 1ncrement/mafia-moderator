import { act, screen } from '@testing-library/react'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Ведущий сменил ночной шаг и тут же кликнул по карточке. Оба нажатия приходят раньше,
// чем стол успевает перерисоваться с вопросом нового шага: ответ всё равно относится к новому шагу.

test('клик по карточке сразу после смены ночного шага записывается в новый шаг', () => {
  const { app } = renderApp((a) => {
    seedGame(a, TABLE_11, 1)
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
    a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
  })
  const stepButton = document.querySelector<HTMLButtonElement>('[data-step="prostitute_block:10"]')!
  const card = screen.getByRole('button', { name: 'Выбрать игрока №4' })
  // Внутри одного act перерисовки между кликами нет — как при двух нажатиях подряд в браузере.
  act(() => {
    stepButton.click()
    card.click()
  })
  const steps = app.getState().game!.night!.steps
  expect(steps.find((s) => s.actionId === 'mafia_shot')!.target).toBe(7)
  expect(steps.find((s) => s.actionId === 'prostitute_block')!.target).toBe(4)
})
