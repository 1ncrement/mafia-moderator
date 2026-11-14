import { screen, within } from '@testing-library/react'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Спецификация 6.2: полосой шагов можно пропустить шаг; «незавершённое (не все говорили, …)
// показывается строкой-предупреждением, а не запретом».
test('круг пропущен целиком через полосу шагов: строка «Не говорили» есть', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 2); a.dispatch({ type: 'nominate', by: null, target: 7 }) })
  await user.click(within(screen.getByRole('navigation', { name: 'Шаги дня' })).getByRole('button', { name: 'Оправдания' }))
  expect(app.getState().game!.step).toBe('defense')
  expect(app.getState().game!.day!.spoken).toEqual([])
  expect(screen.getByText(/Не говорили/)).toBeInTheDocument()
})
